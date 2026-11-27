package dev.wizzo.tapto;

import android.app.PendingIntent;
import android.content.Intent;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.ArrayList;
import java.util.List;

/**
 * Owns the one ExoPlayer and MediaSession used for local playback. The plugin
 * and the video activity drive it through MediaControllers, so the media
 * notification, lock screen and both controllers all see the same player.
 * Media3 moves the service in and out of the foreground as playback starts and
 * stops.
 */
public class LocalMediaPlaybackService extends MediaSessionService {

    // Only touched on the main thread.
    private static boolean running = false;

    private MediaSession session;

    /** Whether the service exists, so the plugin can reattach without starting it. */
    static boolean isRunning() {
        return running;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;

        ExoPlayer player = new ExoPlayer.Builder(this)
            .setAudioAttributes(
                new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
                true
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build();
        player.addListener(
            new Player.Listener() {
                @Override
                public void onEvents(@NonNull Player player, @NonNull Player.Events events) {
                    // Once playback is stopped and cleared, let the service go
                    // as soon as the last controller unbinds.
                    if (player.getMediaItemCount() == 0 && player.getPlaybackState() == Player.STATE_IDLE) {
                        stopSelf();
                    }
                }
            }
        );

        session = new MediaSession.Builder(this, player).setCallback(new SessionCallback()).setSessionActivity(appIntent()).build();
    }

    @Nullable
    @Override
    public MediaSession onGetSession(@NonNull MediaSession.ControllerInfo controllerInfo) {
        return session;
    }

    @Override
    public void onTaskRemoved(@Nullable Intent rootIntent) {
        Player player = session == null ? null : session.getPlayer();
        if (player == null || !player.getPlayWhenReady() || player.getMediaItemCount() == 0) {
            stopSelf();
        }
    }

    @Override
    public void onDestroy() {
        running = false;
        if (session != null) {
            session.getPlayer().release();
            session.release();
            session = null;
        }
        super.onDestroy();
    }

    private PendingIntent appIntent() {
        Intent intent = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private class SessionCallback implements MediaSession.Callback {

        @NonNull
        @Override
        public MediaSession.ConnectionResult onConnect(@NonNull MediaSession session, @NonNull MediaSession.ControllerInfo controller) {
            if (session.isMediaNotificationController(controller) || controller.getPackageName().equals(getPackageName())) {
                return new MediaSession.ConnectionResult.AcceptedResultBuilder(session, controller).build();
            }
            // Other apps and system surfaces (Bluetooth, lock screen) may control
            // playback but not load URIs, which would read files with this app's
            // folder permissions.
            Player.Commands commands = MediaSession.ConnectionResult.DEFAULT_PLAYER_COMMANDS.buildUpon()
                .remove(Player.COMMAND_SET_MEDIA_ITEM)
                .remove(Player.COMMAND_CHANGE_MEDIA_ITEMS)
                .build();
            return new MediaSession.ConnectionResult.AcceptedResultBuilder(session, controller).setAvailablePlayerCommands(commands).build();
        }

        @NonNull
        @Override
        public ListenableFuture<List<MediaItem>> onAddMediaItems(
            @NonNull MediaSession mediaSession,
            @NonNull MediaSession.ControllerInfo controller,
            @NonNull List<MediaItem> mediaItems
        ) {
            List<MediaItem> resolved = new ArrayList<>();
            for (MediaItem item : mediaItems) {
                if (item.localConfiguration != null) {
                    resolved.add(item);
                } else if (item.requestMetadata.mediaUri != null) {
                    resolved.add(item.buildUpon().setUri(item.requestMetadata.mediaUri).build());
                } else {
                    return Futures.immediateFailedFuture(new IllegalArgumentException("Media item has no URI"));
                }
            }
            return Futures.immediateFuture(resolved);
        }
    }
}
