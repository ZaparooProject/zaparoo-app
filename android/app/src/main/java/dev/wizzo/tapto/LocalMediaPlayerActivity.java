package dev.wizzo.tapto;

import android.content.ComponentName;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import androidx.media3.ui.PlayerView;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.concurrent.ExecutionException;

/**
 * Full-screen video for local playback. It shows the shared session player
 * through its own MediaController, so LocalMediaPlugin keeps receiving state
 * events. Closing it stops the video; leaving the app pauses it.
 */
public class LocalMediaPlayerActivity extends AppCompatActivity {

    private PlayerView playerView;
    private ListenableFuture<MediaController> controllerFuture;
    private MediaController controller;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        playerView = new PlayerView(this);
        playerView.setKeepContentOnPlayerReset(false);
        root.addView(playerView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        ImageButton close = new ImageButton(this);
        close.setImageResource(R.drawable.ic_local_media_close);
        close.setBackgroundResource(android.R.color.transparent);
        close.setContentDescription(getString(R.string.local_media_close));
        int size = Math.round(48 * getResources().getDisplayMetrics().density);
        FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(size, size, Gravity.TOP | Gravity.START);
        root.addView(close, closeParams);
        close.setOnClickListener(v -> finish());
        // Keep the close button with the player controls.
        playerView.setControllerVisibilityListener(
            (PlayerView.ControllerVisibilityListener) visibility -> close.setVisibility(visibility)
        );

        // Keep video and controls clear of cutouts and of system bars when the
        // user swipes them in.
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets safe = insets.getInsetsIgnoringVisibility(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        setContentView(root);

        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        bars.hide(WindowInsetsCompat.Type.systemBars());
    }

    @Override
    protected void onStart() {
        super.onStart();
        SessionToken token = new SessionToken(this, new ComponentName(this, LocalMediaPlaybackService.class));
        ListenableFuture<MediaController> future = new MediaController.Builder(this, token).buildAsync();
        controllerFuture = future;
        future.addListener(
            () -> {
                if (controllerFuture != future) {
                    return;
                }
                try {
                    controller = future.get();
                } catch (ExecutionException | InterruptedException e) {
                    finish();
                    return;
                }
                playerView.setPlayer(controller);
            },
            ContextCompat.getMainExecutor(this)
        );
    }

    @Override
    protected void onStop() {
        if (controller != null && isVideoLoaded(controller)) {
            if (isFinishing()) {
                // Back or close: the video is done.
                controller.stop();
                controller.clearMediaItems();
            } else if (!isChangingConfigurations()) {
                controller.pause();
            }
        }
        playerView.setPlayer(null);
        if (controllerFuture != null) {
            MediaController.releaseFuture(controllerFuture);
        }
        controllerFuture = null;
        controller = null;
        super.onStop();
    }

    private static boolean isVideoLoaded(Player player) {
        MediaItem item = player.getCurrentMediaItem();
        return (
            item != null &&
            item.mediaMetadata.extras != null &&
            "video".equals(item.mediaMetadata.extras.getString(LocalMediaPlugin.EXTRA_KIND))
        );
    }
}
