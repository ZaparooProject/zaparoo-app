package dev.wizzo.tapto;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.squareup.seismic.ShakeDetector;

/**
 * Shake detection that only samples the accelerometer while JS has asked for
 * it and the activity is in the foreground. Nothing starts in load(): a sensor
 * registered for the process lifetime keeps the accelerometer streaming even
 * when shake-to-launch is off.
 */
@CapacitorPlugin(name = "ShakeDetector")
public class ShakeDetectorPlugin extends Plugin implements ShakeDetector.Listener {

    // About 15 Hz. Tested on device to detect shakes as reliably as the 50 Hz
    // game rate the previous plugin used, with a third of the sensor events.
    private static final int SENSOR_DELAY = SensorManager.SENSOR_DELAY_UI;

    private ShakeDetector detector;
    // Whether JS wants detection. Only touched on the main thread.
    private boolean requested = false;
    private boolean paused = false;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", accelerometer() != null);
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        getBridge().executeOnMainThread(() -> {
            requested = true;
            if (!paused) {
                startDetector();
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getBridge().executeOnMainThread(() -> {
            requested = false;
            stopDetector();
            call.resolve();
        });
    }

    @Override
    protected void handleOnPause() {
        paused = true;
        stopDetector();
    }

    @Override
    protected void handleOnResume() {
        paused = false;
        if (requested) {
            startDetector();
        }
    }

    @Override
    protected void handleOnDestroy() {
        requested = false;
        stopDetector();
    }

    @Override
    public void hearShake() {
        notifyListeners("shake", new JSObject());
    }

    private void startDetector() {
        SensorManager sensorManager = sensorManager();
        if (sensorManager == null || detector != null) {
            return;
        }
        ShakeDetector next = new ShakeDetector(this);
        if (next.start(sensorManager, SENSOR_DELAY)) {
            detector = next;
        }
    }

    private void stopDetector() {
        if (detector != null) {
            detector.stop();
            detector = null;
        }
    }

    private SensorManager sensorManager() {
        return (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
    }

    private Sensor accelerometer() {
        SensorManager sensorManager = sensorManager();
        return sensorManager == null ? null : sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
    }
}
