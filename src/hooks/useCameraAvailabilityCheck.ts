import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { logger } from "@/lib/logger";

/**
 * Hook to check camera/barcode scanner availability once at app startup.
 * This runs once at the App level to prevent layout shifts.
 * The result is cached in the preferences store.
 */
export function useCameraAvailabilityCheck() {
  const setCameraAvailable = usePreferencesStore(
    (state) => state.setCameraAvailable,
  );
  const setCameraAvailabilityHydrated = usePreferencesStore(
    (state) => state.setCameraAvailabilityHydrated,
  );

  useEffect(() => {
    // Skip on web platform
    if (!Capacitor.isNativePlatform()) {
      setCameraAvailable(false);
      setCameraAvailabilityHydrated(true);
      return;
    }

    const checkAndSetupScanner = async () => {
      try {
        // On Android, check if Google Barcode Scanner module is available
        // and install it if needed (runs in background)
        if (Capacitor.getPlatform() === "android") {
          const { available } =
            await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
          if (!available) {
            // Install in background - don't wait for completion
            BarcodeScanner.installGoogleBarcodeScannerModule().catch((e) => {
              logger.debug(
                "Google Barcode Scanner module installation failed:",
                e,
                {
                  category: "camera",
                  action: "installModule",
                  severity: "info",
                },
              );
            });
          }
        }

        // Check if barcode scanner is supported
        const result = await BarcodeScanner.isSupported();
        setCameraAvailable(result.supported);
      } catch (e) {
        logger.debug("Failed to check camera availability:", e, {
          category: "camera",
          action: "availabilityCheck",
          severity: "info",
        });
        // On error, assume camera not available
        setCameraAvailable(false);
      } finally {
        setCameraAvailabilityHydrated(true);
      }
    };

    checkAndSetupScanner();
  }, [setCameraAvailable, setCameraAvailabilityHydrated]);
}
