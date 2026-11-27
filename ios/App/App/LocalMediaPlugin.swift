import AVFoundation
import AVKit
import Capacitor
import MediaPlayer
import QuickLook
import UIKit
import UniformTypeIdentifiers

/**
 * Local media folders, scanning, playback and the image viewer.
 *
 * The built-in "app" folder is the Documents directory, which the Files app
 * and Finder show as "Zaparoo" because file sharing is on. Linked folders are
 * picked with the document picker and kept as bookmarks; their security scope
 * is opened for scans, downloads, playback and the image viewer. Folder
 * storage, scans and the index file are only touched on `ioQueue`. Files that
 * aren't local yet (iCloud Drive and other file providers) are downloaded on
 * `downloadQueue` before playback or viewing. Playback runs on one AVPlayer,
 * only touched on the main thread, and reports lock-screen and Control Center
 * actions to JS as `playbackState` events. Images open in a QLPreviewController.
 */
@objc(LocalMediaPlugin)
public class LocalMediaPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate,
    AVPlayerViewControllerDelegate, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
    public let identifier = "LocalMediaPlugin"
    public let jsName = "LocalMedia"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listFolders", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "addFolder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeFolder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getIndex", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seek", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPlaybackState", returnType: CAPPluginReturnPromise)
    ]

    private static let appFolderId = "app"
    private static let appFolderName = "Zaparoo"

    private struct StoredFolder: Codable {
        let id: String
        var name: String
        var bookmark: Data
    }

    private struct LinkedFolder {
        let stored: StoredFolder
        // Nil when the bookmark no longer resolves.
        let url: URL?
    }

    private struct NowPlaying {
        let uri: String
        let kind: String
        let title: String
        let subtitle: String?
    }

    private final class ImageItem: NSObject, QLPreviewItem {
        let previewItemURL: URL?
        let previewItemTitle: String?

        init(url: URL, title: String) {
            previewItemURL = url
            previewItemTitle = title.isEmpty ? nil : title
        }
    }

    private struct Placeholder {
        let name: String
        let url: URL
        let size: Int
        let modified: Date?
    }

    private let ioQueue = DispatchQueue(label: "dev.wizzo.tapto.LocalMedia", qos: .userInitiated)
    // Downloads can take a while, so they don't hold up scans or each other.
    private let downloadQueue = DispatchQueue(
        label: "dev.wizzo.tapto.LocalMedia.download",
        qos: .userInitiated,
        attributes: .concurrent
    )

    // Main thread only.
    private var pickerCall: CAPPluginCall?
    private let player = AVPlayer()
    private var current: NowPlaying?
    private var ended = false
    private var errorMessage: String?
    private var scopedFolder: URL?
    private var itemObservers: [NSKeyValueObservation] = []
    private var itemNotifications: [NSObjectProtocol] = []
    private var playerObservers: [NSKeyValueObservation] = []
    private var timeObserver: Any?
    private var videoController: AVPlayerViewController?
    private var videoPresented = false
    private var resumeAfterInterruption = false
    private var lastStateKey: String?
    // Bumped by each play or stop, so a play that finishes downloading late doesn't win.
    private var playRequest = 0
    private var imageRequest = 0
    private var imageController: QLPreviewController?
    private var imageItem: ImageItem?
    private var imageScope: URL?
    // A downloaded copy of a remote image, deleted when the viewer lets go of it.
    private var imageTempFile: URL?

    private static let downloadTimeout: TimeInterval = 60
    private static let maxRemoteImageBytes: Int64 = 50 * 1024 * 1024

    private lazy var imageSession: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForResource = LocalMediaPlugin.downloadTimeout
        return URLSession(configuration: config)
    }()

    override public func load() {
        DispatchQueue.main.async {
            self.setUpPlayer()
        }
        // Remote image copies only live while they are shown.
        ioQueue.async {
            try? FileManager.default.removeItem(at: self.remoteImageDirectory())
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": true])
    }

    // MARK: Folders

    @objc func listFolders(_ call: CAPPluginCall) {
        ioQueue.async {
            var folders: [[String: Any]] = []
            if let app = try? self.appFolder() {
                folders.append(self.appFolderResult(available: FileManager.default.fileExists(atPath: app.path)))
            } else {
                folders.append(self.appFolderResult(available: false))
            }
            for linked in self.resolveLinkedFolders() {
                folders.append(self.folderResult(linked))
            }
            call.resolve(["folders": folders])
        }
    }

    @objc func addFolder(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let presenter = self.topViewController() else {
                call.reject("No view to present the folder picker from")
                return
            }
            if self.pickerCall != nil {
                call.reject("The folder picker is already open")
                return
            }
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
            picker.delegate = self
            picker.allowsMultipleSelection = false
            self.pickerCall = call
            presenter.present(picker, animated: true)
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = pickerCall else { return }
        pickerCall = nil
        guard let url = urls.first else {
            call.resolve([:])
            return
        }
        ioQueue.async {
            self.link(url, call: call)
        }
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pickerCall?.resolve([:])
        pickerCall = nil
    }

    @objc func removeFolder(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("id is required")
            return
        }
        if id == LocalMediaPlugin.appFolderId {
            call.reject("The app folder can't be removed")
            return
        }
        ioQueue.async {
            let folders = self.readFolders()
            do {
                try self.writeFolders(folders.filter { $0.id != id })
            } catch {
                call.reject("Could not save the folders", nil, error)
                return
            }
            self.removeFromIndex(folderId: id)
            call.resolve()
        }
    }

    // MARK: Index

    @objc func scan(_ call: CAPPluginCall) {
        let extensions = Set(
            (call.getArray("extensions", String.self) ?? []).compactMap { raw -> String? in
                var ext = raw.lowercased()
                if ext.hasPrefix(".") {
                    ext.removeFirst()
                }
                return ext.isEmpty ? nil : ext
            }
        )
        ioQueue.async {
            var files: [[String: Any]] = []
            if let app = try? self.appFolder() {
                self.walk(root: app, folderId: LocalMediaPlugin.appFolderId, extensions: extensions, into: &files)
            }
            for linked in self.resolveLinkedFolders() {
                guard let root = linked.url else { continue }
                self.withScope(root) {
                    self.coordinatedRead(root, metadataOnly: true) { readURL in
                        self.walk(root: readURL, folderId: linked.stored.id, extensions: extensions, into: &files)
                    }
                }
            }
            let index: [String: Any] = ["files": files, "scannedAt": LocalMediaPlugin.millis(Date())]
            do {
                try self.writeIndex(index)
            } catch {
                call.reject("Could not save the media index", nil, error)
                return
            }
            call.resolve(index)
        }
    }

    @objc func getIndex(_ call: CAPPluginCall) {
        ioQueue.async {
            call.resolve(self.readIndex())
        }
    }

    // MARK: Playback

    @objc func play(_ call: CAPPluginCall) {
        guard let uri = call.getString("uri"), !uri.isEmpty else {
            call.reject("uri is required")
            return
        }
        let kind = call.getString("kind") ?? ""
        guard kind == "audio" || kind == "video" else {
            call.reject("kind must be audio or video")
            return
        }
        guard let url = URL(string: uri), url.isFileURL || url.scheme == "http" || url.scheme == "https" else {
            call.reject("uri must be a file or http(s) URL")
            return
        }
        let subtitle = call.getString("subtitle")
        let item = NowPlaying(
            uri: uri,
            kind: kind,
            title: call.getString("title") ?? "",
            subtitle: subtitle?.isEmpty == false ? subtitle : nil
        )
        DispatchQueue.main.async {
            self.playRequest += 1
            let request = self.playRequest
            // Files in linked folders need the folder's security scope open
            // for as long as the player reads them.
            self.prepareFile(url) { scope, error in
                guard request == self.playRequest else {
                    // A newer play or stop replaced this one.
                    call.resolve()
                    return
                }
                if let error = error {
                    call.reject("Could not open the file", nil, error)
                    return
                }
                self.startPlayback(item, url: url, scope: scope)
                call.resolve()
            }
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.current != nil {
                self.player.pause()
            }
            call.resolve()
        }
    }

    @objc func resume(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.resumePlayback()
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopPlayback()
            call.resolve()
        }
    }

    @objc func seek(_ call: CAPPluginCall) {
        guard let position = call.getDouble("position"), position.isFinite else {
            call.reject("position is required")
            return
        }
        DispatchQueue.main.async {
            self.seek(to: position)
            call.resolve()
        }
    }

    @objc func getPlaybackState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(self.currentState())
        }
    }

    // MARK: Image viewer

    /** Shows an image full screen, replacing the one already shown. Playback is left alone. */
    @objc func showImage(_ call: CAPPluginCall) {
        guard let uri = call.getString("uri"), let url = URL(string: uri),
              url.isFileURL || url.scheme == "http" || url.scheme == "https" else {
            call.reject("uri must be a file or http(s) URL")
            return
        }
        let title = call.getString("title") ?? ""
        DispatchQueue.main.async {
            self.imageRequest += 1
            let request = self.imageRequest
            let show = { (file: URL?, scope: URL?, tempFile: URL?, error: Error?) in
                guard request == self.imageRequest else {
                    // A newer image replaced this one.
                    LocalMediaPlugin.removeTempFile(tempFile)
                    call.resolve()
                    return
                }
                guard let file = file, error == nil else {
                    LocalMediaPlugin.removeTempFile(tempFile)
                    call.reject("Could not open the image", nil, error)
                    return
                }
                let item = ImageItem(url: file, title: title)
                guard QLPreviewController.canPreview(item) else {
                    LocalMediaPlugin.removeTempFile(tempFile)
                    call.reject("This image can't be shown")
                    return
                }
                self.presentImage(item, scope: scope, tempFile: tempFile, call: call)
            }
            if url.isFileURL {
                self.prepareFile(url) { scope, error in
                    show(url, scope, nil, error)
                }
            } else {
                self.downloadRemoteImage(url) { file, error in
                    show(file, nil, file, error)
                }
            }
        }
    }

    private func presentImage(_ item: ImageItem, scope: URL?, tempFile: URL?, call: CAPPluginCall) {
        // Open the new scope before closing the old one, which may be the same folder.
        let opened = scope.flatMap { $0.startAccessingSecurityScopedResource() ? $0 : nil }
        imageScope?.stopAccessingSecurityScopedResource()
        imageScope = opened
        LocalMediaPlugin.removeTempFile(imageTempFile)
        imageTempFile = tempFile
        imageItem = item

        if let controller = imageController {
            controller.reloadData()
            call.resolve()
            return
        }
        guard let presenter = topViewController() else {
            closeImage()
            call.reject("No view to present the image from")
            return
        }
        let controller = QLPreviewController()
        controller.dataSource = self
        controller.delegate = self
        controller.modalPresentationStyle = .fullScreen
        imageController = controller
        presenter.present(controller, animated: true) {
            call.resolve()
        }
    }

    private func closeImage() {
        imageController = nil
        imageItem = nil
        imageScope?.stopAccessingSecurityScopedResource()
        imageScope = nil
        LocalMediaPlugin.removeTempFile(imageTempFile)
        imageTempFile = nil
    }

    private static func removeTempFile(_ file: URL?) {
        guard let file = file else { return }
        DispatchQueue.global(qos: .utility).async {
            try? FileManager.default.removeItem(at: file)
        }
    }

    private func remoteImageDirectory() -> URL {
        return FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("LocalMediaImages", isDirectory: true)
    }

    /**
     * Downloads a remote image into Caches so QuickLook can show it, keeping
     * an image extension from the URL or the response type. Calls
     * `completion` on the main thread.
     */
    private func downloadRemoteImage(_ url: URL, completion: @escaping (_ file: URL?, _ error: Error?) -> Void) {
        let maxBytes = LocalMediaPlugin.maxRemoteImageBytes
        let dir = remoteImageDirectory()
        var progressObservation: NSKeyValueObservation?
        let task = imageSession.downloadTask(with: url) { location, response, error in
            progressObservation?.invalidate()
            var result: (URL?, Error?) = (nil, error ?? URLError(.badServerResponse))
            if error == nil, let location = location {
                result = LocalMediaPlugin.keepRemoteImage(
                    location, response: response, source: url, dir: dir, maxBytes: maxBytes
                )
            }
            DispatchQueue.main.async {
                completion(result.0, result.1)
            }
        }
        // Stop early once the image is clearly too big.
        progressObservation = task.progress.observe(\.completedUnitCount) { [weak task] progress, _ in
            if progress.completedUnitCount > maxBytes {
                task?.cancel()
            }
        }
        task.resume()
    }

    private static func keepRemoteImage(
        _ location: URL,
        response: URLResponse?,
        source: URL,
        dir: URL,
        maxBytes: Int64
    ) -> (URL?, Error?) {
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            return (nil, URLError(.badServerResponse))
        }
        let size = (try? location.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        if Int64(size) > maxBytes {
            return (nil, URLError(.dataLengthExceedsMaximum))
        }
        var ext = source.pathExtension.lowercased()
        if UTType(filenameExtension: ext)?.conforms(to: .image) != true {
            ext = response?.mimeType.flatMap { UTType(mimeType: $0) }
                .flatMap { $0.conforms(to: .image) ? $0.preferredFilenameExtension : nil } ?? ext
        }
        var target = dir.appendingPathComponent(UUID().uuidString)
        if !ext.isEmpty {
            target.appendPathExtension(ext)
        }
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            try FileManager.default.moveItem(at: location, to: target)
            return (target, nil)
        } catch {
            return (nil, error)
        }
    }

    public func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
        return imageItem == nil ? 0 : 1
    }

    public func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        return imageItem ?? ImageItem(url: URL(fileURLWithPath: "/"), title: "")
    }

    public func previewControllerDidDismiss(_ controller: QLPreviewController) {
        guard controller === imageController else { return }
        closeImage()
    }

    // MARK: Downloads

    /**
     * Finds the security scope `url` needs and brings the file local, then calls
     * `completion` on the main thread. http(s) URLs pass straight through.
     */
    private func prepareFile(_ url: URL, completion: @escaping (_ scope: URL?, _ error: Error?) -> Void) {
        guard url.isFileURL else {
            completion(nil, nil)
            return
        }
        ioQueue.async {
            let scope = self.isInsideSandbox(url) ? nil : self.linkedFolder(containing: url)
            self.downloadQueue.async {
                var error: Error?
                if let scope = scope {
                    self.withScope(scope) {
                        error = self.download(url)
                    }
                } else {
                    error = self.download(url)
                }
                DispatchQueue.main.async {
                    completion(scope, error)
                }
            }
        }
    }

    /**
     * Downloads an iCloud Drive (or other file provider) item that isn't local
     * yet. A coordinated read waits until the provider has the file on disk.
     * Blocks, so call it off the main thread with the scope open.
     */
    private func download(_ url: URL) -> Error? {
        let values = try? url.resourceValues(forKeys: [.isUbiquitousItemKey, .ubiquitousItemDownloadingStatusKey])
        if values?.isUbiquitousItem == true && values?.ubiquitousItemDownloadingStatus != .current {
            try? FileManager.default.startDownloadingUbiquitousItem(at: url)
        }
        let coordinator = NSFileCoordinator()
        // Give up on a download that stalls (offline, provider not responding).
        let timeout = DispatchWorkItem {
            coordinator.cancel()
        }
        DispatchQueue.global(qos: .utility).asyncAfter(
            deadline: .now() + LocalMediaPlugin.downloadTimeout,
            execute: timeout
        )
        var coordinationError: NSError?
        var readError: Error?
        coordinator.coordinate(readingItemAt: url, options: [], error: &coordinationError) { readURL in
            if !FileManager.default.isReadableFile(atPath: readURL.path) {
                readError = CocoaError(.fileReadNoSuchFile, userInfo: [NSURLErrorKey: url])
            }
        }
        timeout.cancel()
        // cancel() makes the coordinated read fail with a user-cancelled error.
        if coordinationError?.domain == NSCocoaErrorDomain && coordinationError?.code == NSUserCancelledError {
            return URLError(.timedOut, userInfo: [NSURLErrorKey: url])
        }
        return coordinationError ?? readError
    }

    // MARK: Player (main thread)

    private func setUpPlayer() {
        playerObservers.append(player.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in
            DispatchQueue.main.async {
                self?.checkVideoDismissed()
                self?.emitState(onlyWhenChanged: true)
            }
        })
        timeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 1, preferredTimescale: 1000),
            queue: .main
        ) { [weak self] _ in
            guard let self = self, self.player.timeControlStatus == .playing else { return }
            self.emitState(onlyWhenChanged: true)
        }

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(audioSessionInterrupted(_:)),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
        )

        let commands = MPRemoteCommandCenter.shared()
        commands.playCommand.addTarget { [weak self] _ in
            guard let self = self, self.current != nil else { return .noActionableNowPlayingItem }
            self.resumePlayback()
            return .success
        }
        commands.pauseCommand.addTarget { [weak self] _ in
            guard let self = self, self.current != nil else { return .noActionableNowPlayingItem }
            self.player.pause()
            return .success
        }
        commands.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self = self, self.current != nil else { return .noActionableNowPlayingItem }
            if self.player.timeControlStatus == .paused {
                self.resumePlayback()
            } else {
                self.player.pause()
            }
            return .success
        }
        commands.stopCommand.addTarget { [weak self] _ in
            guard let self = self, self.current != nil else { return .noActionableNowPlayingItem }
            self.stopPlayback()
            return .success
        }
        commands.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let self = self, self.current != nil,
                  let event = event as? MPChangePlaybackPositionCommandEvent else {
                return .noActionableNowPlayingItem
            }
            self.seek(to: event.positionTime)
            return .success
        }
        setRemoteCommandsEnabled(false)
    }

    private func setRemoteCommandsEnabled(_ enabled: Bool) {
        let commands = MPRemoteCommandCenter.shared()
        commands.playCommand.isEnabled = enabled
        commands.pauseCommand.isEnabled = enabled
        commands.togglePlayPauseCommand.isEnabled = enabled
        commands.stopCommand.isEnabled = enabled
        commands.changePlaybackPositionCommand.isEnabled = enabled
    }

    private func startPlayback(_ item: NowPlaying, url: URL, scope: URL?) {
        // A video replacing a video keeps the open player view.
        clearItem(keepingVideo: item.kind == "video")

        if let scope = scope, scope.startAccessingSecurityScopedResource() {
            scopedFolder = scope
        }
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: item.kind == "video" ? .moviePlayback : .default)
            try session.setActive(true)
        } catch {
            CAPLog.print("LocalMedia: could not activate the audio session: \(error.localizedDescription)")
        }

        let playerItem = AVPlayerItem(url: url)
        itemObservers.append(playerItem.observe(\.status, options: [.new]) { [weak self] _, _ in
            DispatchQueue.main.async {
                self?.emitState(onlyWhenChanged: true)
            }
        })
        itemNotifications.append(NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: playerItem,
            queue: .main
        ) { [weak self] _ in
            self?.ended = true
            self?.emitState(onlyWhenChanged: true)
        })
        itemNotifications.append(NotificationCenter.default.addObserver(
            forName: .AVPlayerItemFailedToPlayToEndTime,
            object: playerItem,
            queue: .main
        ) { [weak self] notification in
            let error = notification.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? Error
            self?.errorMessage = error?.localizedDescription ?? "Playback failed"
            self?.emitState(onlyWhenChanged: true)
        })

        current = item
        player.replaceCurrentItem(with: playerItem)
        player.play()
        setRemoteCommandsEnabled(true)

        if item.kind == "video" && videoController == nil {
            presentVideo()
        }
        emitState(onlyWhenChanged: false)
    }

    private func resumePlayback() {
        guard current != nil else { return }
        if ended {
            ended = false
            player.seek(to: .zero)
        }
        try? AVAudioSession.sharedInstance().setActive(true)
        player.play()
    }

    private func seek(to position: Double) {
        guard current != nil else { return }
        ended = false
        let time = CMTime(seconds: max(0, position), preferredTimescale: 1000)
        player.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
            DispatchQueue.main.async {
                self?.emitState(onlyWhenChanged: false)
            }
        }
    }

    private func stopPlayback() {
        playRequest += 1
        let hadItem = current != nil
        clearItem()
        if hadItem {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
        emitState(onlyWhenChanged: false)
    }

    /** Unloads the current item without touching the audio session. */
    private func clearItem(keepingVideo: Bool = false) {
        if !keepingVideo {
            dismissVideo()
        }
        player.pause()
        player.replaceCurrentItem(with: nil)
        itemObservers.forEach { $0.invalidate() }
        itemObservers.removeAll()
        itemNotifications.forEach { NotificationCenter.default.removeObserver($0) }
        itemNotifications.removeAll()
        scopedFolder?.stopAccessingSecurityScopedResource()
        scopedFolder = nil
        current = nil
        ended = false
        errorMessage = nil
        resumeAfterInterruption = false
        setRemoteCommandsEnabled(false)
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    @objc private func audioSessionInterrupted(_ notification: Notification) {
        guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        let optionsRaw = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
        DispatchQueue.main.async {
            switch type {
            case .began:
                // The system has already paused the player.
                self.resumeAfterInterruption = self.current != nil && !self.ended
            case .ended:
                let shouldResume = AVAudioSession.InterruptionOptions(rawValue: optionsRaw).contains(.shouldResume)
                if self.resumeAfterInterruption && shouldResume {
                    self.resumePlayback()
                }
                self.resumeAfterInterruption = false
            @unknown default:
                break
            }
        }
    }

    // MARK: Video (main thread)

    private func presentVideo() {
        guard let presenter = topViewController() else { return }
        let controller = AVPlayerViewController()
        controller.player = player
        controller.delegate = self
        controller.allowsPictureInPicturePlayback = false
        controller.updatesNowPlayingInfoCenter = false
        controller.modalPresentationStyle = .fullScreen
        videoController = controller
        videoPresented = false
        presenter.present(controller, animated: true) { [weak self] in
            if self?.videoController === controller {
                self?.videoPresented = true
            }
        }
    }

    private func topViewController() -> UIViewController? {
        var top = bridge?.viewController
        while let presented = top?.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
    }

    private func dismissVideo() {
        guard let controller = videoController else { return }
        videoController = nil
        videoPresented = false
        // Dismissing the player also dismisses an image shown over it.
        if let image = imageController, image.presentingViewController === controller {
            closeImage()
        }
        if controller.presentingViewController != nil {
            controller.dismiss(animated: true)
        }
    }

    public func playerViewController(
        _ playerViewController: AVPlayerViewController,
        willEndFullScreenPresentationWithAnimationCoordinator coordinator: UIViewControllerTransitionCoordinator
    ) {
        coordinator.animate(alongsideTransition: nil) { [weak self] context in
            guard let self = self, !context.isCancelled, self.videoController === playerViewController else { return }
            self.videoController = nil
            self.videoPresented = false
            self.stopPlayback()
        }
    }

    /** Closing the player pauses it; stop if it was closed without the delegate noticing. */
    private func checkVideoDismissed() {
        guard let controller = videoController, videoPresented,
              controller.presentingViewController == nil, !controller.isBeingPresented else { return }
        videoController = nil
        videoPresented = false
        stopPlayback()
    }

    // MARK: Playback state (main thread)

    private func emitState(onlyWhenChanged: Bool) {
        let state = currentState()
        let status = state["status"] as? String ?? "idle"
        let key = [
            status,
            state["uri"] as? String ?? "",
            state["title"] as? String ?? "",
            state["error"] as? String ?? ""
        ].joined(separator: "|")
        // Position changes on every tick; dedupe everything else.
        if onlyWhenChanged && status != "playing" && key == lastStateKey {
            return
        }
        lastStateKey = key
        updateNowPlayingInfo(state)
        notifyListeners("playbackState", data: state)
    }

    private func currentState() -> [String: Any] {
        guard let current = current, let item = player.currentItem else {
            return ["status": "idle", "position": 0, "duration": 0]
        }
        var state: [String: Any] = [
            "kind": current.kind,
            "uri": current.uri,
            "title": current.title
        ]
        let status: String
        if let message = errorMessage {
            status = "error"
            state["error"] = message
        } else if item.status == .failed {
            status = "error"
            state["error"] = item.error?.localizedDescription ?? "Playback failed"
        } else if ended {
            status = "ended"
        } else if item.status != .readyToPlay {
            status = "loading"
        } else {
            switch player.timeControlStatus {
            case .playing:
                status = "playing"
            case .waitingToPlayAtSpecifiedRate:
                status = "loading"
            default:
                status = "paused"
            }
        }
        state["status"] = status
        state["position"] = LocalMediaPlugin.seconds(item.currentTime())
        state["duration"] = LocalMediaPlugin.seconds(item.duration)
        return state
    }

    private func updateNowPlayingInfo(_ state: [String: Any]) {
        guard let current = current else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }
        let duration = state["duration"] as? Double ?? 0
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: current.title,
            MPMediaItemPropertyMediaType: current.kind == "video"
                ? MPMediaType.anyVideo.rawValue
                : MPMediaType.music.rawValue,
            MPNowPlayingInfoPropertyMediaType: current.kind == "video"
                ? MPNowPlayingInfoMediaType.video.rawValue
                : MPNowPlayingInfoMediaType.audio.rawValue,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: state["position"] as? Double ?? 0,
            MPNowPlayingInfoPropertyPlaybackRate: state["status"] as? String == "playing" ? 1.0 : 0.0,
            MPNowPlayingInfoPropertyIsLiveStream: duration == 0 && player.currentItem?.status == .readyToPlay
        ]
        if duration > 0 {
            info[MPMediaItemPropertyPlaybackDuration] = duration
        }
        if let subtitle = current.subtitle {
            info[MPMediaItemPropertyArtist] = subtitle
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private static func seconds(_ time: CMTime) -> Double {
        guard time.isNumeric, !time.isIndefinite else { return 0 }
        let value = CMTimeGetSeconds(time)
        return value.isFinite ? max(0, value) : 0
    }

    // MARK: Folder storage (ioQueue)

    private func dataDirectory() throws -> URL {
        var dir = try FileManager.default
            .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("LocalMedia", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            // Bookmarks only resolve on this device and the index is rebuilt by a scan.
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try? dir.setResourceValues(values)
        }
        return dir
    }

    /**
     * The Documents directory, which the Files app shows as "Zaparoo". Kept
     * out of iCloud backups since it holds the user's own media.
     */
    private func appFolder() throws -> URL {
        var dir = try FileManager.default
            .url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? dir.setResourceValues(values)
        return dir
    }

    private func readFolders() -> [StoredFolder] {
        guard let file = try? dataDirectory().appendingPathComponent("folders.json"),
              let data = try? Data(contentsOf: file),
              let folders = try? JSONDecoder().decode([StoredFolder].self, from: data) else {
            return []
        }
        return folders
    }

    private func writeFolders(_ folders: [StoredFolder]) throws {
        let file = try dataDirectory().appendingPathComponent("folders.json")
        try JSONEncoder().encode(folders).write(to: file, options: .atomic)
    }

    /** Resolves every bookmark, saving refreshed ones when iOS marks them stale. */
    private func resolveLinkedFolders() -> [LinkedFolder] {
        var folders = readFolders()
        var refreshed = false
        var result: [LinkedFolder] = []
        for index in folders.indices {
            var stale = false
            guard let url = try? URL(
                resolvingBookmarkData: folders[index].bookmark,
                options: [],
                relativeTo: nil,
                bookmarkDataIsStale: &stale
            ) else {
                result.append(LinkedFolder(stored: folders[index], url: nil))
                continue
            }
            if stale {
                withScope(url) {
                    if let bookmark = try? url.bookmarkData() {
                        folders[index].bookmark = bookmark
                        refreshed = true
                    }
                }
            }
            result.append(LinkedFolder(stored: folders[index], url: url))
        }
        if refreshed {
            try? writeFolders(folders)
        }
        return result
    }

    private func link(_ url: URL, call: CAPPluginCall) {
        if let app = try? appFolder(), LocalMediaPlugin.samePath(app, url) {
            call.resolve(["folder": appFolderResult(available: true)])
            return
        }
        let accessing = url.startAccessingSecurityScopedResource()
        defer {
            if accessing {
                url.stopAccessingSecurityScopedResource()
            }
        }
        for linked in resolveLinkedFolders() {
            if let existing = linked.url, LocalMediaPlugin.samePath(existing, url) {
                call.resolve(["folder": folderResult(linked)])
                return
            }
        }
        do {
            let bookmark = try url.bookmarkData()
            let name = (try? url.resourceValues(forKeys: [.localizedNameKey]).localizedName) ?? url.lastPathComponent
            let stored = StoredFolder(id: UUID().uuidString, name: name, bookmark: bookmark)
            try writeFolders(readFolders() + [stored])
            call.resolve(["folder": folderResult(LinkedFolder(stored: stored, url: url))])
        } catch {
            call.reject("Could not keep access to the folder", nil, error)
        }
    }

    private func appFolderResult(available: Bool) -> [String: Any] {
        return [
            "id": LocalMediaPlugin.appFolderId,
            "name": LocalMediaPlugin.appFolderName,
            "kind": "app",
            "available": available
        ]
    }

    private func folderResult(_ linked: LinkedFolder) -> [String: Any] {
        var available = false
        if let url = linked.url {
            withScope(url) {
                available = (try? url.checkResourceIsReachable()) == true
            }
        }
        return ["id": linked.stored.id, "name": linked.stored.name, "kind": "linked", "available": available]
    }

    /** The linked folder whose security scope covers `file`. */
    private func linkedFolder(containing file: URL) -> URL? {
        let filePath = LocalMediaPlugin.canonicalPath(file)
        return resolveLinkedFolders().compactMap(\.url).first { folder in
            filePath.hasPrefix(LocalMediaPlugin.canonicalPath(folder) + "/")
        }
    }

    private func withScope(_ url: URL, _ body: () -> Void) {
        let accessing = url.startAccessingSecurityScopedResource()
        body()
        if accessing {
            url.stopAccessingSecurityScopedResource()
        }
    }

    /** Coordinated read, so file providers (iCloud Drive and others) bring the item local first. */
    private func coordinatedRead(_ url: URL, metadataOnly: Bool, _ body: (URL) -> Void) {
        var coordinationError: NSError?
        var ran = false
        NSFileCoordinator().coordinate(
            readingItemAt: url,
            options: metadataOnly ? .immediatelyAvailableMetadataOnly : [],
            error: &coordinationError
        ) { readURL in
            ran = true
            body(readURL)
        }
        if !ran {
            body(url)
        }
    }

    private func isInsideSandbox(_ url: URL) -> Bool {
        let home = LocalMediaPlugin.canonicalPath(URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true))
        return LocalMediaPlugin.canonicalPath(url).hasPrefix(home + "/")
    }

    private static func canonicalPath(_ url: URL) -> String {
        var path = url.standardizedFileURL.resolvingSymlinksInPath().path
        while path.count > 1 && path.hasSuffix("/") {
            path.removeLast()
        }
        return path
    }

    private static func samePath(_ lhs: URL, _ rhs: URL) -> Bool {
        return canonicalPath(lhs) == canonicalPath(rhs)
    }

    private static func millis(_ date: Date) -> Int64 {
        return Int64((date.timeIntervalSince1970 * 1000).rounded())
    }

    // MARK: Scanning (ioQueue)

    private func walk(root: URL, folderId: String, extensions: Set<String>, into files: inout [[String: Any]]) {
        let keys: [URLResourceKey] = [
            .isDirectoryKey, .isSymbolicLinkKey, .isHiddenKey,
            .fileSizeKey, .totalFileSizeKey, .contentModificationDateKey
        ]
        let keySet = Set(keys)
        var queue: [(url: URL, path: String)] = [(root, "")]
        var next = 0
        while next < queue.count {
            let dir = queue[next]
            next += 1
            // Hidden names are filtered below, because iCloud placeholders are hidden.
            guard let children = try? FileManager.default.contentsOfDirectory(
                at: dir.url,
                includingPropertiesForKeys: keys,
                options: []
            ) else {
                // Skip a directory that can't be listed.
                continue
            }
            let listed = Set(children.map(\.lastPathComponent))
            for child in children {
                let name = child.lastPathComponent
                guard !name.isEmpty,
                      let values = try? child.resourceValues(forKeys: keySet),
                      values.isSymbolicLink != true else {
                    continue
                }
                if name.hasPrefix(".") {
                    guard let placeholder = iCloudPlaceholder(child, values: values, in: dir.url),
                          !listed.contains(placeholder.name),
                          extensions.contains(placeholder.url.pathExtension.lowercased()) else {
                        continue
                    }
                    files.append(LocalMediaPlugin.indexEntry(
                        folderId: folderId,
                        path: dir.path.isEmpty ? placeholder.name : dir.path + "/" + placeholder.name,
                        url: placeholder.url,
                        size: placeholder.size,
                        modified: placeholder.modified
                    ))
                    continue
                }
                guard values.isHidden != true else { continue }
                let path = dir.path.isEmpty ? name : dir.path + "/" + name
                if values.isDirectory == true {
                    queue.append((child, path))
                    continue
                }
                guard extensions.contains(child.pathExtension.lowercased()) else { continue }
                // Items not downloaded from iCloud may only report a total size.
                files.append(LocalMediaPlugin.indexEntry(
                    folderId: folderId,
                    path: path,
                    url: child,
                    size: values.fileSize ?? values.totalFileSize ?? 0,
                    modified: values.contentModificationDate
                ))
            }
        }
    }

    /**
     * Older iOS keeps an iCloud Drive file that isn't downloaded as a hidden
     * `.Name.ext.icloud` stub, a small property list describing the item.
     * Returns the real file it stands for, or nil for other hidden files.
     */
    private func iCloudPlaceholder(_ stub: URL, values: URLResourceValues, in dir: URL) -> Placeholder? {
        let stubName = stub.lastPathComponent
        let suffix = ".icloud"
        guard stubName.count > suffix.count + 1, stubName.hasSuffix(suffix) else { return nil }
        let info = (try? Data(contentsOf: stub))
            .flatMap { try? PropertyListSerialization.propertyList(from: $0, format: nil) } as? [String: Any]
        if info?["NSURLFileResourceTypeKey"] as? String == URLFileResourceType.directory.rawValue {
            return nil
        }
        let derived = String(stubName.dropFirst().dropLast(suffix.count))
        let name = (info?["NSURLNameKey"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? derived
        guard !name.hasPrefix("."), !name.contains("/") else { return nil }
        let url = dir.appendingPathComponent(name, isDirectory: false)
        let real = try? url.resourceValues(forKeys: [.fileSizeKey, .totalFileSizeKey, .contentModificationDateKey])
        let size = real?.fileSize ?? real?.totalFileSize ?? (info?["NSURLFileSizeKey"] as? NSNumber)?.intValue ?? 0
        return Placeholder(
            name: name,
            url: url,
            size: size,
            modified: real?.contentModificationDate ?? values.contentModificationDate
        )
    }

    private static func indexEntry(folderId: String, path: String, url: URL, size: Int, modified: Date?) -> [String: Any] {
        return [
            "folderId": folderId,
            "path": path,
            "uri": url.absoluteString,
            "size": size,
            "modified": modified.map(millis) ?? 0
        ]
    }

    // MARK: Index file (ioQueue)

    private func indexFile() throws -> URL {
        return try dataDirectory().appendingPathComponent("index.json")
    }

    private func readIndex() -> [String: Any] {
        if let file = try? indexFile(),
           let data = try? Data(contentsOf: file),
           let index = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
           index["files"] is [Any] {
            return index
        }
        return ["files": [], "scannedAt": 0]
    }

    private func writeIndex(_ index: [String: Any]) throws {
        let data = try JSONSerialization.data(withJSONObject: index)
        try data.write(to: try indexFile(), options: .atomic)
    }

    private func removeFromIndex(folderId: String) {
        guard let file = try? indexFile(), FileManager.default.fileExists(atPath: file.path) else { return }
        var index = readIndex()
        let files = index["files"] as? [[String: Any]] ?? []
        index["files"] = files.filter { $0["folderId"] as? String != folderId }
        // The next scan rewrites it if this fails.
        try? writeIndex(index)
    }
}
