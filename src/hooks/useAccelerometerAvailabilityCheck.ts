import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { CapacitorShake } from "@capgo/capacitor-shake";
import { usePreferencesStore } from "../lib/preferencesStore";
import { logger } from "../lib/logger";

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
    // Skip on web platform
    if (!Capacitor.isNativePlatform()) {
      setAccelerometerAvailable(false);
      setAccelerometerAvailabilityHydrated(true);
      return;
    }

    // Try to add a test listener to see if shake/accelerometer is available
    const checkAvailability = async () => {
      try {
        const listener = await CapacitorShake.addListener("shake", () => {
          // Test listener - do nothing
        });

        // If we got here, accelerometer is available
        setAccelerometerAvailable(true);
        setAccelerometerAvailabilityHydrated(true);

        // Clean up test listener
        await listener.remove();
      } catch (e) {
        logger.error("Failed to check accelerometer availability:", e, {
          category: "accelerometer",
          action: "availabilityCheck",
          severity: "warning",
        });
        // On error, assume accelerometer not available
        setAccelerometerAvailable(false);
        setAccelerometerAvailabilityHydrated(true);
      }
    };

    checkAvailability();
  }, [setAccelerometerAvailable, setAccelerometerAvailabilityHydrated]);
}
