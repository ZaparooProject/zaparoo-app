package dev.wizzo.tapto;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.ImageDecoder;
import android.graphics.Matrix;
import android.graphics.RectF;
import android.graphics.drawable.Animatable;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.view.ViewGroup;
import android.view.accessibility.AccessibilityManager;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.AppCompatImageView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Full-screen image for local playback, with pinch and double-tap zoom. A tap
 * shows or hides the close button and system bars. Images decode off the main
 * thread at about screen size; audio playback carries on underneath.
 */
public class LocalMediaImageActivity extends AppCompatActivity {

    static final String EXTRA_URI = "uri";
    static final String EXTRA_TITLE = "title";

    private static final int MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;
    private static final int MAX_DECODE_SIDE = 4096;

    private final ExecutorService decoder = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private ZoomImageView image;
    private TextView message;
    private ImageButton close;
    private WindowInsetsControllerCompat bars;
    private boolean chromeShown = true;
    private int loadId = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        image = new ZoomImageView(this);
        image.setOnSingleTap(() -> setChromeShown(!chromeShown));
        root.addView(image, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        message = new TextView(this);
        message.setTextColor(Color.WHITE);
        message.setTextSize(16);
        message.setGravity(Gravity.CENTER);
        message.setVisibility(View.GONE);
        root.addView(message, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // The close button sits in its own layer so it clears cutouts and
        // system bars while the image stays edge to edge.
        FrameLayout chrome = new FrameLayout(this);
        close = new ImageButton(this);
        close.setImageResource(R.drawable.ic_local_media_close);
        close.setBackgroundResource(android.R.color.transparent);
        close.setContentDescription(getString(R.string.local_media_close));
        close.setOnClickListener(v -> finish());
        int size = Math.round(48 * getResources().getDisplayMetrics().density);
        chrome.addView(close, new FrameLayout.LayoutParams(size, size, Gravity.TOP | Gravity.START));
        root.addView(chrome, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        ViewCompat.setOnApplyWindowInsetsListener(chrome, (view, insets) -> {
            Insets safe = insets.getInsetsIgnoringVisibility(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(safe.left, safe.top, safe.right, 0);
            return insets;
        });

        setContentView(root);
        bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);

        load(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        load(intent);
    }

    @Override
    protected void onDestroy() {
        decoder.shutdownNow();
        main.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    private void setChromeShown(boolean shown) {
        // Screen reader users keep the close button reachable.
        AccessibilityManager accessibility = (AccessibilityManager) getSystemService(Context.ACCESSIBILITY_SERVICE);
        if (!shown && accessibility != null && accessibility.isTouchExplorationEnabled()) {
            return;
        }
        chromeShown = shown;
        close.setVisibility(shown ? View.VISIBLE : View.GONE);
        if (shown) {
            bars.show(WindowInsetsCompat.Type.systemBars());
        } else {
            bars.hide(WindowInsetsCompat.Type.systemBars());
        }
    }

    private void load(Intent intent) {
        String uri = intent.getStringExtra(EXTRA_URI);
        String title = intent.getStringExtra(EXTRA_TITLE);
        setTitle(title != null ? title : "");
        image.setContentDescription(title);
        image.setImageDrawable(null);
        message.setVisibility(View.GONE);
        setChromeShown(true);
        int id = ++loadId;
        if (uri == null) {
            showFailure();
            return;
        }
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        int target = Math.min(MAX_DECODE_SIDE, 2 * Math.max(metrics.widthPixels, metrics.heightPixels));
        Context context = getApplicationContext();
        decoder.execute(() -> {
            Drawable drawable;
            try {
                drawable = decode(context, Uri.parse(uri), target);
            } catch (IOException | RuntimeException e) {
                drawable = null;
            }
            Drawable result = drawable;
            main.post(() -> {
                if (id != loadId || isDestroyed()) {
                    return;
                }
                if (result == null) {
                    showFailure();
                    return;
                }
                image.setImageDrawable(result);
                if (result instanceof Animatable) {
                    ((Animatable) result).start();
                }
            });
        });
    }

    private void showFailure() {
        message.setText(R.string.local_media_image_failed);
        message.setVisibility(View.VISIBLE);
        message.announceForAccessibility(message.getText());
    }

    private static Drawable decode(Context context, Uri uri, int target) throws IOException {
        String scheme = uri.getScheme();
        boolean remote = "http".equals(scheme) || "https".equals(scheme);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            ImageDecoder.Source source = remote
                ? ImageDecoder.createSource(ByteBuffer.wrap(download(uri)))
                : ImageDecoder.createSource(context.getContentResolver(), uri);
            return ImageDecoder.decodeDrawable(source, (decoder, info, src) -> {
                int width = info.getSize().getWidth();
                int height = info.getSize().getHeight();
                int longest = Math.max(width, height);
                if (longest > target) {
                    float scale = (float) target / longest;
                    decoder.setTargetSize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
                }
            });
        }
        byte[] bytes;
        if (remote) {
            bytes = download(uri);
        } else {
            try (InputStream in = context.getContentResolver().openInputStream(uri)) {
                if (in == null) {
                    throw new IOException("cannot open " + uri);
                }
                bytes = readAll(in, Integer.MAX_VALUE);
            }
        }
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / (options.inSampleSize * 2) >= target) {
            options.inSampleSize *= 2;
        }
        Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        if (bitmap == null) {
            throw new IOException("cannot decode " + uri);
        }
        return new BitmapDrawable(context.getResources(), bitmap);
    }

    private static byte[] download(Uri uri) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(uri.toString()).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        try {
            if (connection.getResponseCode() / 100 != 2) {
                throw new IOException("HTTP " + connection.getResponseCode());
            }
            try (InputStream in = connection.getInputStream()) {
                return readAll(in, MAX_DOWNLOAD_BYTES);
            }
        } finally {
            connection.disconnect();
        }
    }

    private static byte[] readAll(InputStream in, int limit) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[64 * 1024];
        int read;
        while ((read = in.read(buffer)) != -1) {
            if (out.size() + read > limit) {
                throw new IOException("image too large");
            }
            out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }

    /** An ImageView that fits its image and pans and zooms it with gestures. */
    static class ZoomImageView extends AppCompatImageView {

        private static final float MAX_ZOOM = 5f;
        private static final float DOUBLE_TAP_ZOOM = 2.5f;

        private final Matrix base = new Matrix();
        private final Matrix zoom = new Matrix();
        private final Matrix drawMatrix = new Matrix();
        private final RectF bounds = new RectF();
        private final ScaleGestureDetector scaleDetector;
        private final GestureDetector gestureDetector;
        private Runnable onSingleTap;

        ZoomImageView(Context context) {
            super(context);
            setScaleType(ImageView.ScaleType.MATRIX);
            scaleDetector = new ScaleGestureDetector(
                context,
                new ScaleGestureDetector.SimpleOnScaleGestureListener() {
                    @Override
                    public boolean onScale(@NonNull ScaleGestureDetector detector) {
                        zoomBy(detector.getScaleFactor(), detector.getFocusX(), detector.getFocusY());
                        return true;
                    }
                }
            );
            gestureDetector = new GestureDetector(
                context,
                new GestureDetector.SimpleOnGestureListener() {
                    @Override
                    public boolean onDown(@NonNull MotionEvent e) {
                        return true;
                    }

                    @Override
                    public boolean onSingleTapConfirmed(@NonNull MotionEvent e) {
                        if (onSingleTap != null) {
                            onSingleTap.run();
                        }
                        return true;
                    }

                    @Override
                    public boolean onDoubleTap(@NonNull MotionEvent e) {
                        if (currentZoom() > 1.01f) {
                            zoom.reset();
                            apply();
                        } else {
                            zoomBy(DOUBLE_TAP_ZOOM, e.getX(), e.getY());
                        }
                        return true;
                    }

                    @Override
                    public boolean onScroll(MotionEvent e1, @NonNull MotionEvent e2, float dx, float dy) {
                        zoom.postTranslate(-dx, -dy);
                        apply();
                        return true;
                    }
                }
            );
        }

        void setOnSingleTap(Runnable listener) {
            onSingleTap = listener;
        }

        @Override
        public void setImageDrawable(Drawable drawable) {
            super.setImageDrawable(drawable);
            if (zoom != null) {
                zoom.reset();
                fit();
            }
        }

        @Override
        protected void onSizeChanged(int w, int h, int oldw, int oldh) {
            super.onSizeChanged(w, h, oldw, oldh);
            zoom.reset();
            fit();
        }

        @Override
        public boolean onTouchEvent(MotionEvent event) {
            if (getDrawable() == null) {
                return super.onTouchEvent(event);
            }
            scaleDetector.onTouchEvent(event);
            gestureDetector.onTouchEvent(event);
            // Let a parent see horizontal drags only while not zoomed in.
            getParent().requestDisallowInterceptTouchEvent(currentZoom() > 1.01f);
            return true;
        }

        private float currentZoom() {
            float[] values = new float[9];
            zoom.getValues(values);
            return values[Matrix.MSCALE_X];
        }

        private void zoomBy(float factor, float x, float y) {
            float current = currentZoom();
            float next = Math.max(1f, Math.min(MAX_ZOOM, current * factor));
            zoom.postScale(next / current, next / current, x, y);
            apply();
        }

        private void fit() {
            Drawable drawable = getDrawable();
            int width = getWidth();
            int height = getHeight();
            base.reset();
            if (drawable != null && width > 0 && height > 0 && drawable.getIntrinsicWidth() > 0 && drawable.getIntrinsicHeight() > 0) {
                RectF source = new RectF(0, 0, drawable.getIntrinsicWidth(), drawable.getIntrinsicHeight());
                base.setRectToRect(source, new RectF(0, 0, width, height), Matrix.ScaleToFit.CENTER);
            }
            apply();
        }

        /** Keeps the image on screen: centred when smaller, edges held when larger. */
        private void apply() {
            Drawable drawable = getDrawable();
            if (drawable == null) {
                return;
            }
            drawMatrix.set(base);
            drawMatrix.postConcat(zoom);
            bounds.set(0, 0, drawable.getIntrinsicWidth(), drawable.getIntrinsicHeight());
            drawMatrix.mapRect(bounds);
            float dx = correction(bounds.left, bounds.right, getWidth());
            float dy = correction(bounds.top, bounds.bottom, getHeight());
            if (dx != 0 || dy != 0) {
                zoom.postTranslate(dx, dy);
                drawMatrix.postTranslate(dx, dy);
            }
            setImageMatrix(drawMatrix);
        }

        private static float correction(float start, float end, int size) {
            float length = end - start;
            if (length <= size) {
                return (size - length) / 2f - start;
            }
            if (start > 0) {
                return -start;
            }
            if (end < size) {
                return size - end;
            }
            return 0;
        }
    }
}
