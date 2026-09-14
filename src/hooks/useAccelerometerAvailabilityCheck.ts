import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { ShakeDetector } from "@/lib/shakeDetector";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { logger } from "@/lib/logger";
import {
  isCapacitorPluginUnavailableError,
  isNativePluginAvailable,
} from "@/lib/capacitorBridge";

/**
 * Hook to check accelerometer/shake detection availability once at app startup.
 * This runs once at the App level to prevent layout shifts.
 * The result is cached in the preferences store.
 */
export function useAccelerometerAvailabilityCheck() {
  const setAccelerometerAvailable = usePreferencesStore(
    (state) => state.setAccelerometerAvailable,
  );
  const setAccelerometerAvailabilityHydrated = usePreferencesStore(
    (state) => state.setAccelerometerAvailabilityHydrated,
  );

  useEffect(() => {
    // Skip on web platform or when the native plugin bridge is unavailable
    if (
      !Capacitor.isNativePlatform() ||
      !isNativePluginAvailable("ShakeDetector")
    ) {
      setAccelerometerAvailable(false);
      setAccelerometerAvailabilityHydrated(true);
      return;
    }

    // Ask native whether shake detection is possible; this does not start it
    const checkAvailability = async () => {
      try {
        const { available } = await ShakeDetector.isAvailable();
        setAccelerometerAvailable(available);
        setAccelerometerAvailabilityHydrated(true);
      } catch (e) {
        if (!isCapacitorPluginUnavailableError(e)) {
          logger.error("Failed to check accelerometer availability:", e, {
            category: "accelerometer",
            action: "availabilityCheck",
            severity: "warning",
          });
        }
        // On error, assume accelerometer not available
        setAccelerometerAvailable(false);
        setAccelerometerAvailabilityHydrated(true);
      }
    };

    checkAvailability();
  }, [setAccelerometerAvailable, setAccelerometerAvailabilityHydrated]);
}
