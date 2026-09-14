import Capacitor
import CoreMotion
import UIKit

extension UIWindow {
    override open func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        // While shake-to-launch is on, shaking is for launching. Passing the
        // system shake gesture up the responder chain would also open the
        // "Undo Typing" alert. When it is off, iOS keeps shake-to-undo.
        if motion == .motionShake && ShakeDetectorPlugin.isDetecting {
            return
        }
        super.motionEnded(motion, with: event)
    }
}

/**
 * Shake detection from the accelerometer, matching the Android plugin (Square's
 * Seismic detector at about 15 Hz) so continuous shaking reports repeatedly on
 * both platforms. The system shake gesture is not used: it only fires after the
 * phone stops moving and cancels long shakes.
 *
 * Sampling only runs between start() and stop() while the app is active.
 */
@objc(ShakeDetectorPlugin)
public class ShakeDetectorPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShakeDetectorPlugin"
    public let jsName = "ShakeDetector"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    // Whether JS has asked for shake detection. Only touched on the main thread.
    static var isDetecting = false

    private static let sampleInterval: TimeInterval = 1.0 / 15.0
    // Seismic's SENSITIVITY_MEDIUM, in m/s² including gravity.
    private static let accelerationThreshold = 13.0
    private static let standardGravity = 9.80665

    private let motionManager = CMMotionManager()
    private let samples = ShakeSampleQueue()
    private var appActive = true

    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appWillResignActive),
            name: UIApplication.willResignActiveNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        motionManager.stopAccelerometerUpdates()
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": motionManager.isAccelerometerAvailable])
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            ShakeDetectorPlugin.isDetecting = true
            if self.appActive {
                self.startSampling()
            }
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            ShakeDetectorPlugin.isDetecting = false
            self.stopSampling()
            call.resolve()
        }
    }

    @objc private func appWillResignActive() {
        appActive = false
        stopSampling()
    }

    @objc private func appDidBecomeActive() {
        appActive = true
        if ShakeDetectorPlugin.isDetecting {
            startSampling()
        }
    }

    private func startSampling() {
        guard motionManager.isAccelerometerAvailable, !motionManager.isAccelerometerActive else {
            return
        }
        samples.clear()
        motionManager.accelerometerUpdateInterval = ShakeDetectorPlugin.sampleInterval
        motionManager.startAccelerometerUpdates(to: OperationQueue.main) { [weak self] data, _ in
            guard let self = self, let data = data else { return }
            self.handle(data)
        }
    }

    private func stopSampling() {
        motionManager.stopAccelerometerUpdates()
        samples.clear()
    }

    private func handle(_ data: CMAccelerometerData) {
        let gravity = ShakeDetectorPlugin.standardGravity
        let x = data.acceleration.x * gravity
        let y = data.acceleration.y * gravity
        let z = data.acceleration.z * gravity
        let threshold = ShakeDetectorPlugin.accelerationThreshold
        let accelerating = x * x + y * y + z * z > threshold * threshold

        samples.add(timestamp: data.timestamp, accelerating: accelerating)
        if samples.isShaking {
            samples.clear()
            notifyListeners("shake", data: [:])
        }
    }
}

/// Port of Seismic's SampleQueue: a shake is at least a quarter second of
/// samples, within the last half second, where three quarters or more exceed
/// the acceleration threshold.
private final class ShakeSampleQueue {
    private struct Sample {
        let timestamp: TimeInterval
        let accelerating: Bool
    }

    private static let maxWindow: TimeInterval = 0.5
    private static let minWindow: TimeInterval = 0.25
    private static let minQueueSize = 4

    private var samples: [Sample] = []
    private var acceleratingCount = 0

    func add(timestamp: TimeInterval, accelerating: Bool) {
        purge(olderThan: timestamp - ShakeSampleQueue.maxWindow)
        samples.append(Sample(timestamp: timestamp, accelerating: accelerating))
        if accelerating {
            acceleratingCount += 1
        }
    }

    func clear() {
        samples.removeAll()
        acceleratingCount = 0
    }

    var isShaking: Bool {
        guard let oldest = samples.first, let newest = samples.last else {
            return false
        }
        let count = samples.count
        return newest.timestamp - oldest.timestamp >= ShakeSampleQueue.minWindow
            && acceleratingCount >= (count >> 1) + (count >> 2)
    }

    private func purge(olderThan cutoff: TimeInterval) {
        while samples.count >= ShakeSampleQueue.minQueueSize,
              let oldest = samples.first,
              cutoff - oldest.timestamp > 0 {
            if oldest.accelerating {
                acceleratingCount -= 1
            }
            samples.removeFirst()
        }
    }
}
