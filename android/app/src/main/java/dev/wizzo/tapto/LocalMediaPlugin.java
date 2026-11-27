package dev.wizzo.tapto;

import android.app.Activity;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.DocumentsContract;
import androidx.activity.result.ActivityResult;
import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Local media folders, scanning and playback. Folders are Storage Access
 * Framework trees kept with persisted read permissions; scans walk them with
 * DocumentsContract queries on one background thread and save the result as
 * the index. Playback runs in LocalMediaPlaybackService and is driven through
 * a MediaController, so notification and lock-screen actions report back here.
 */
@CapacitorPlugin(name = "LocalMedia")
public class LocalMediaPlugin extends Plugin {

    static final String EXTRA_KIND = "localMediaKind";

    private static final String PREFS = "LocalMedia";
    private static final String PREF_FOLDERS = "folders";
    private static final String INDEX_FILE = "local-media-index.json";
    private static final long PROGRESS_INTERVAL_MS = 1000;

    private static final String[] CHILD_PROJECTION = {
        DocumentsContract.Document.COLUMN_DOCUMENT_ID,
        DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        DocumentsContract.Document.COLUMN_MIME_TYPE,
        DocumentsContract.Document.COLUMN_SIZE,
        DocumentsContract.Document.COLUMN_LAST_MODIFIED
    };

    // Folder storage, scans and the index file are only touched on this thread.
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    // Main thread only.
    private ListenableFuture<MediaController> controllerFuture;
    private MediaController controller;
    private final List<Runnable> pendingCommands = new ArrayList<>();
    private String lastStateKey;

    private final Player.Listener playerListener = new Player.Listener() {
        @Override
        public void onEvents(@NonNull Player player, @NonNull Player.Events events) {
            if (
                events.containsAny(
                    Player.EVENT_PLAYBACK_STATE_CHANGED,
                    Player.EVENT_IS_PLAYING_CHANGED,
                    Player.EVENT_PLAY_WHEN_READY_CHANGED,
                    Player.EVENT_PLAYER_ERROR,
                    Player.EVENT_MEDIA_ITEM_TRANSITION,
                    Player.EVENT_MEDIA_METADATA_CHANGED,
                    Player.EVENT_POSITION_DISCONTINUITY,
                    Player.EVENT_TIMELINE_CHANGED
                )
            ) {
                emitState(true);
            }
            scheduleProgress();
            // Playback was cleared somewhere else, such as closing the video
            // player: unbind too so the service can stop and drop its
            // notification.
            if (isCleared(player)) {
                mainHandler.post(() -> {
                    if (controller != null && isCleared(controller)) {
                        releaseController();
                    }
                });
            }
        }
    };

    private static boolean isCleared(Player player) {
        return player.getMediaItemCount() == 0 && player.getPlaybackState() == Player.STATE_IDLE;
    }

    private final Runnable progressTick = new Runnable() {
        @Override
        public void run() {
            if (controller != null && controller.isPlaying()) {
                emitState(true);
                mainHandler.postDelayed(this, PROGRESS_INTERVAL_MS);
            }
        }
    };

    @Override
    public void load() {
        // Audio can outlive the activity; reattach so its events reach JS again.
        mainHandler.post(() -> {
            if (LocalMediaPlaybackService.isRunning()) {
                withController(null, null);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        mainHandler.post(this::releaseController);
        executor.shutdown();
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", true);
        call.resolve(result);
    }

    // Folders

    @PluginMethod
    public void listFolders(PluginCall call) {
        executor.execute(() -> {
            JSArray folders = new JSArray();
            for (JSONObject stored : readFolders()) {
                folders.put(folderResult(stored));
            }
            JSObject result = new JSObject();
            result.put("folders", folders);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void addFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION |
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION |
                Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        try {
            startActivityForResult(call, intent, "folderPicked");
        } catch (android.content.ActivityNotFoundException e) {
            call.reject("No folder picker is available", e);
        }
    }

    @ActivityCallback
    private void folderPicked(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        Intent data = result.getData();
        Uri tree = data == null ? null : data.getData();
        if (result.getResultCode() != Activity.RESULT_OK || tree == null) {
            call.resolve(new JSObject());
            return;
        }
        try {
            getContext().getContentResolver().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException e) {
            call.reject("Could not keep access to the folder", e);
            return;
        }
        executor.execute(() -> {
            try {
                List<JSONObject> folders = readFolders();
                String treeString = tree.toString();
                for (JSONObject stored : folders) {
                    if (treeString.equals(stored.optString("uri"))) {
                        resolveFolder(call, stored);
                        return;
                    }
                }
                JSONObject stored = new JSONObject();
                stored.put("id", UUID.randomUUID().toString());
                stored.put("name", treeDisplayName(tree));
                stored.put("uri", treeString);
                folders.add(stored);
                writeFolders(folders);
                resolveFolder(call, stored);
            } catch (JSONException e) {
                call.reject("Could not save the folder", e);
            }
        });
    }

    @PluginMethod
    public void removeFolder(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("id is required");
            return;
        }
        executor.execute(() -> {
            List<JSONObject> folders = readFolders();
            List<JSONObject> kept = new ArrayList<>();
            for (JSONObject stored : folders) {
                if (id.equals(stored.optString("id"))) {
                    try {
                        getContext()
                            .getContentResolver()
                            .releasePersistableUriPermission(Uri.parse(stored.optString("uri")), Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    } catch (SecurityException ignored) {
                        // Already revoked.
                    }
                } else {
                    kept.add(stored);
                }
            }
            writeFolders(kept);
            removeFromIndex(id);
            call.resolve();
        });
    }

    // Index

    @PluginMethod
    public void scan(PluginCall call) {
        JSArray extensionArray = call.getArray("extensions", new JSArray());
        Set<String> extensions = new HashSet<>();
        for (int i = 0; i < extensionArray.length(); i++) {
            String ext = extensionArray.optString(i, "").toLowerCase(Locale.ROOT);
            if (ext.startsWith(".")) {
                ext = ext.substring(1);
            }
            if (!ext.isEmpty()) {
                extensions.add(ext);
            }
        }
        executor.execute(() -> {
            JSArray files = new JSArray();
            for (JSONObject stored : readFolders()) {
                Uri tree = Uri.parse(stored.optString("uri"));
                if (isFolderAvailable(tree)) {
                    walkTree(stored.optString("id"), tree, extensions, files);
                }
            }
            JSObject index = new JSObject();
            index.put("files", files);
            index.put("scannedAt", System.currentTimeMillis());
            try {
                writeIndex(index);
            } catch (IOException e) {
                call.reject("Could not save the media index", e);
                return;
            }
            call.resolve(index);
        });
    }

    @PluginMethod
    public void getIndex(PluginCall call) {
        executor.execute(() -> call.resolve(readIndex()));
    }

    @PluginMethod
    public void showImage(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null || uri.isEmpty()) {
            call.reject("uri is required");
            return;
        }
        String title = call.getString("title", "");
        getBridge()
            .executeOnMainThread(() -> {
                Context context = getActivity() != null ? getActivity() : getContext();
                Intent intent = new Intent(context, LocalMediaImageActivity.class)
                    .putExtra(LocalMediaImageActivity.EXTRA_URI, uri)
                    .putExtra(LocalMediaImageActivity.EXTRA_TITLE, title);
                if (!(context instanceof Activity)) {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                }
                context.startActivity(intent);
                call.resolve();
            });
    }

    // Playback

    @PluginMethod
    public void play(PluginCall call) {
        String uri = call.getString("uri");
        String kind = call.getString("kind");
        String title = call.getString("title", "");
        String subtitle = call.getString("subtitle");
        if (uri == null || uri.isEmpty()) {
            call.reject("uri is required");
            return;
        }
        if (!"audio".equals(kind) && !"video".equals(kind)) {
            call.reject("kind must be audio or video");
            return;
        }

        Bundle extras = new Bundle();
        extras.putString(EXTRA_KIND, kind);
        MediaMetadata.Builder metadata = new MediaMetadata.Builder()
            .setTitle(title)
            .setDisplayTitle(title)
            .setMediaType("video".equals(kind) ? MediaMetadata.MEDIA_TYPE_VIDEO : MediaMetadata.MEDIA_TYPE_MUSIC)
            .setExtras(extras);
        if (subtitle != null && !subtitle.isEmpty()) {
            metadata.setArtist(subtitle).setSubtitle(subtitle);
        }
        Uri mediaUri = Uri.parse(uri);
        MediaItem item = new MediaItem.Builder()
            .setMediaId(uri)
            .setUri(mediaUri)
            .setRequestMetadata(new MediaItem.RequestMetadata.Builder().setMediaUri(mediaUri).build())
            .setMediaMetadata(metadata.build())
            .build();

        getBridge()
            .executeOnMainThread(() ->
                withController(
                    player -> {
                        player.setMediaItem(item);
                        player.prepare();
                        player.play();
                        if ("video".equals(kind)) {
                            Context context = getActivity() != null ? getActivity() : getContext();
                            Intent intent = new Intent(context, LocalMediaPlayerActivity.class);
                            if (!(context instanceof Activity)) {
                                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            }
                            context.startActivity(intent);
                        }
                        call.resolve();
                    },
                    call
                )
            );
    }

    @PluginMethod
    public void pause(PluginCall call) {
        getBridge().executeOnMainThread(() -> withExistingController(call, Player::pause));
    }

    @PluginMethod
    public void resume(PluginCall call) {
        getBridge()
            .executeOnMainThread(() ->
                withExistingController(call, player -> {
                    if (player.getPlaybackState() == Player.STATE_IDLE) {
                        player.prepare();
                    } else if (player.getPlaybackState() == Player.STATE_ENDED) {
                        player.seekToDefaultPosition();
                    }
                    player.play();
                })
            );
    }

    @PluginMethod
    public void seek(PluginCall call) {
        double position = call.getData().optDouble("position", Double.NaN);
        if (Double.isNaN(position)) {
            call.reject("position is required");
            return;
        }
        long positionMs = Math.max(0, Math.round(position * 1000));
        getBridge().executeOnMainThread(() -> withExistingController(call, player -> player.seekTo(positionMs)));
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getBridge()
            .executeOnMainThread(() -> {
                if (!hasPlayback()) {
                    emitState(false);
                    call.resolve();
                    return;
                }
                withController(
                    player -> {
                        player.stop();
                        player.clearMediaItems();
                        // Unbinding lets the service drop its notification and stop.
                        releaseController();
                        emitState(false);
                        call.resolve();
                    },
                    call
                );
            });
    }

    @PluginMethod
    public void getPlaybackState(PluginCall call) {
        getBridge().executeOnMainThread(() -> call.resolve(currentState()));
    }

    // Controller

    private interface PlayerCommand {
        void run(Player player);
    }

    /** Runs the command once connected, connecting (and starting the service) if needed. */
    private void withController(PlayerCommand command, PluginCall call) {
        if (controller != null && !controller.isConnected()) {
            // The service went away (stopped or killed); connect again.
            releaseController();
        }
        if (controller != null) {
            if (command != null) {
                command.run(controller);
            }
            return;
        }
        if (command != null) {
            pendingCommands.add(() -> command.run(controller));
        }
        if (controllerFuture != null) {
            return;
        }
        SessionToken token = new SessionToken(getContext(), new ComponentName(getContext(), LocalMediaPlaybackService.class));
        ListenableFuture<MediaController> future = new MediaController.Builder(getContext(), token).buildAsync();
        controllerFuture = future;
        future.addListener(
            () -> {
                if (controllerFuture != future) {
                    return;
                }
                try {
                    controller = future.get();
                } catch (ExecutionException | InterruptedException e) {
                    controllerFuture = null;
                    pendingCommands.clear();
                    if (call != null) {
                        call.reject("Could not start the media player", e);
                    }
                    return;
                }
                controller.addListener(playerListener);
                List<Runnable> commands = new ArrayList<>(pendingCommands);
                pendingCommands.clear();
                for (Runnable pending : commands) {
                    pending.run();
                }
                emitState(true);
                scheduleProgress();
            },
            ContextCompat.getMainExecutor(getContext())
        );
    }

    /** Controls existing playback; does nothing when nothing is loaded. */
    private void withExistingController(PluginCall call, PlayerCommand command) {
        if (!hasPlayback()) {
            call.resolve();
            return;
        }
        withController(
            player -> {
                command.run(player);
                call.resolve();
            },
            call
        );
    }

    /** Whether a controller is connected or connecting, or the service is alive to connect to. */
    private boolean hasPlayback() {
        return (controllerFuture != null && (controller == null || controller.isConnected())) || LocalMediaPlaybackService.isRunning();
    }

    private void releaseController() {
        mainHandler.removeCallbacks(progressTick);
        pendingCommands.clear();
        if (controller != null) {
            controller.removeListener(playerListener);
        }
        if (controllerFuture != null) {
            MediaController.releaseFuture(controllerFuture);
        }
        controllerFuture = null;
        controller = null;
    }

    private void scheduleProgress() {
        mainHandler.removeCallbacks(progressTick);
        if (controller != null && controller.isPlaying()) {
            mainHandler.postDelayed(progressTick, PROGRESS_INTERVAL_MS);
        }
    }

    // Playback state

    private void emitState(boolean onlyWhenChanged) {
        JSObject state = currentState();
        // Position changes on every tick; dedupe everything else.
        String key = state.optString("status") + "|" + state.optString("uri") + "|" + state.optString("title") + "|" + state.optString("error");
        boolean progress = "playing".equals(state.optString("status"));
        if (onlyWhenChanged && !progress && key.equals(lastStateKey)) {
            return;
        }
        lastStateKey = key;
        notifyListeners("playbackState", state);
    }

    private JSObject currentState() {
        JSObject state = new JSObject();
        Player player = controller;
        MediaItem item = player == null ? null : player.getCurrentMediaItem();
        if (item == null) {
            state.put("status", "idle");
            state.put("position", 0);
            state.put("duration", 0);
            return state;
        }

        PlaybackException error = player.getPlayerError();
        String status;
        if (error != null) {
            status = "error";
            String message = error.getMessage();
            state.put("error", message == null || message.isEmpty() ? error.getErrorCodeName() : message);
        } else {
            switch (player.getPlaybackState()) {
                case Player.STATE_BUFFERING:
                    status = "loading";
                    break;
                case Player.STATE_READY:
                    status = player.isPlaying() ? "playing" : "paused";
                    break;
                case Player.STATE_ENDED:
                    status = "ended";
                    break;
                default:
                    status = "idle";
                    break;
            }
        }
        state.put("status", status);

        MediaMetadata metadata = item.mediaMetadata;
        String kind = metadata.extras == null ? null : metadata.extras.getString(EXTRA_KIND);
        if (kind == null) {
            kind = metadata.mediaType != null && metadata.mediaType == MediaMetadata.MEDIA_TYPE_VIDEO ? "video" : "audio";
        }
        state.put("kind", kind);
        state.put("uri", item.mediaId);
        if (metadata.title != null) {
            state.put("title", metadata.title.toString());
        }
        state.put("position", Math.max(0, player.getCurrentPosition()) / 1000.0);
        long duration = player.getDuration();
        state.put("duration", duration == C.TIME_UNSET || player.isCurrentMediaItemLive() ? 0 : duration / 1000.0);
        return state;
    }

    // Folder storage (executor thread)

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private List<JSONObject> readFolders() {
        List<JSONObject> folders = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(prefs().getString(PREF_FOLDERS, "[]"));
            for (int i = 0; i < array.length(); i++) {
                JSONObject stored = array.optJSONObject(i);
                if (stored != null) {
                    folders.add(stored);
                }
            }
        } catch (JSONException ignored) {
            // Corrupt storage reads as no folders.
        }
        return folders;
    }

    private void writeFolders(List<JSONObject> folders) {
        JSONArray array = new JSONArray();
        for (JSONObject stored : folders) {
            array.put(stored);
        }
        prefs().edit().putString(PREF_FOLDERS, array.toString()).commit();
    }

    private void resolveFolder(PluginCall call, JSONObject stored) {
        JSObject result = new JSObject();
        result.put("folder", folderResult(stored));
        call.resolve(result);
    }

    private JSObject folderResult(JSONObject stored) {
        JSObject folder = new JSObject();
        folder.put("id", stored.optString("id"));
        folder.put("name", stored.optString("name"));
        folder.put("kind", "linked");
        folder.put("available", isFolderAvailable(Uri.parse(stored.optString("uri"))));
        return folder;
    }

    private boolean isFolderAvailable(Uri tree) {
        boolean held = false;
        for (UriPermission permission : getContext().getContentResolver().getPersistedUriPermissions()) {
            if (permission.isReadPermission() && permission.getUri().equals(tree)) {
                held = true;
                break;
            }
        }
        if (!held) {
            return false;
        }
        try (Cursor cursor = queryRoot(tree, new String[] { DocumentsContract.Document.COLUMN_DOCUMENT_ID })) {
            return cursor != null && cursor.moveToFirst();
        } catch (RuntimeException e) {
            // SecurityException, IllegalArgumentException or a dead provider.
            return false;
        }
    }

    private String treeDisplayName(Uri tree) {
        try (Cursor cursor = queryRoot(tree, new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME })) {
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null && !name.isEmpty()) {
                    return name;
                }
            }
        } catch (RuntimeException ignored) {
            // Fall back to the document id below.
        }
        String docId = DocumentsContract.getTreeDocumentId(tree);
        int split = Math.max(docId.lastIndexOf('/'), docId.lastIndexOf(':'));
        return split >= 0 && split < docId.length() - 1 ? docId.substring(split + 1) : docId;
    }

    private Cursor queryRoot(Uri tree, String[] projection) {
        Uri root = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        return getContext().getContentResolver().query(root, projection, null, null, null);
    }

    // Scanning (executor thread)

    private static class PendingDir {

        final String documentId;
        final String path;

        PendingDir(String documentId, String path) {
            this.documentId = documentId;
            this.path = path;
        }
    }

    private void walkTree(String folderId, Uri tree, Set<String> extensions, JSArray files) {
        ContentResolver resolver = getContext().getContentResolver();
        ArrayDeque<PendingDir> queue = new ArrayDeque<>();
        Set<String> visited = new HashSet<>();
        String rootId = DocumentsContract.getTreeDocumentId(tree);
        queue.add(new PendingDir(rootId, ""));
        visited.add(rootId);

        while (!queue.isEmpty()) {
            PendingDir dir = queue.poll();
            Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, dir.documentId);
            try (Cursor cursor = resolver.query(children, CHILD_PROJECTION, null, null, null)) {
                if (cursor == null) {
                    continue;
                }
                while (cursor.moveToNext()) {
                    String documentId = cursor.getString(0);
                    String name = cursor.getString(1);
                    if (documentId == null || name == null || name.isEmpty() || name.startsWith(".")) {
                        continue;
                    }
                    String path = dir.path.isEmpty() ? name : dir.path + "/" + name;
                    if (DocumentsContract.Document.MIME_TYPE_DIR.equals(cursor.getString(2))) {
                        if (visited.add(documentId)) {
                            queue.add(new PendingDir(documentId, path));
                        }
                        continue;
                    }
                    int dot = name.lastIndexOf('.');
                    if (dot < 0 || !extensions.contains(name.substring(dot + 1).toLowerCase(Locale.ROOT))) {
                        continue;
                    }
                    JSObject file = new JSObject();
                    file.put("folderId", folderId);
                    file.put("path", path);
                    file.put("uri", DocumentsContract.buildDocumentUriUsingTree(tree, documentId).toString());
                    file.put("size", cursor.isNull(3) ? 0 : cursor.getLong(3));
                    file.put("modified", cursor.isNull(4) ? 0 : cursor.getLong(4));
                    files.put(file);
                }
            } catch (RuntimeException e) {
                // Skip a directory the provider refuses to list.
            }
        }
    }

    // Index file (executor thread)

    private File indexFile() {
        return new File(getContext().getFilesDir(), INDEX_FILE);
    }

    private JSObject readIndex() {
        File file = indexFile();
        if (file.exists()) {
            try {
                JSObject index = new JSObject(new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
                if (index.has("files")) {
                    return index;
                }
            } catch (IOException | JSONException ignored) {
                // Unreadable index reads as no scan.
            }
        }
        JSObject empty = new JSObject();
        empty.put("files", new JSArray());
        empty.put("scannedAt", 0);
        return empty;
    }

    private void writeIndex(JSONObject index) throws IOException {
        File file = indexFile();
        File temp = new File(file.getParentFile(), INDEX_FILE + ".tmp");
        try (FileOutputStream out = new FileOutputStream(temp)) {
            out.write(index.toString().getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        }
        if (!temp.renameTo(file)) {
            throw new IOException("Could not replace " + file);
        }
    }

    private void removeFromIndex(String folderId) {
        File file = indexFile();
        if (!file.exists()) {
            return;
        }
        JSObject index = readIndex();
        JSONArray files = index.optJSONArray("files");
        if (files == null) {
            return;
        }
        JSArray kept = new JSArray();
        for (int i = 0; i < files.length(); i++) {
            JSONObject entry = files.optJSONObject(i);
            if (entry != null && !folderId.equals(entry.optString("folderId"))) {
                kept.put(entry);
            }
        }
        index.put("files", kept);
        try {
            writeIndex(index);
        } catch (IOException ignored) {
            // The next scan rewrites it.
        }
    }
}
