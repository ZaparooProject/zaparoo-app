import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import { usePreferencesStore } from "../lib/preferencesStore";

/**
 * Hook to check camera/barcode scanner availability once at app startup.
 * This runs once at the App level to prevent layout shifts.
 * The result is cached in the preferences store.
 */
export function useCameraAvailabilityCheck() {
  const setCameraAvailable = usePreferencesStore((state) => state.setCameraAvailable);
  const setCameraAvailabilityHydrated = usePreferencesStore((state) => state.setCameraAvailabilityHydrated);

  useEffect(() => {
    // Skip on web platform
    if (!Capacitor.isNativePlatform()) {
      setCameraAvailable(false);
      setCameraAvailabilityHydrated(true);
      return;
    }

    // Check if barcode scanner is supported
    BarcodeScanner.isSupported()
      .then((result) => {
        setCameraAvailable(result.supported);
        setCameraAvailabilityHydrated(true);
      })
      .catch((e) => {
        console.error("Failed to check camera availability:", e);
        // On error, assume camera not available
        setCameraAvailable(false);
        setCameraAvailabilityHydrated(true);
      });
  }, [setCameraAvailable, setCameraAvailabilityHydrated]);
}
