import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/**
 * App-local shake detection bridge (`ShakeDetectorPlugin` on Android and iOS).
 *
 * Detection only runs between `start()` and `stop()`, and native code also
 * suspends it while the app is backgrounded. Android samples the
 * accelerometer only in that window; iOS forwards the system shake gesture.
 */
export interface ShakeDetectorPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener(
    eventName: "shake",
    listener: () => void,
  ): Promise<PluginListenerHandle>;
}

export const ShakeDetector =
  registerPlugin<ShakeDetectorPlugin>("ShakeDetector");
