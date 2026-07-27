import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { logger } from "@/lib/logger";
import {
  isCapacitorPluginUnavailableError,
  isNativePluginAvailable,
} from "@/lib/capacitorBridge";

/**
 * Hook to check NFC availability once at app startup.
 * This runs once at the App level to prevent layout shifts.
 * The result is cached in the preferences store.
 */
export function useNfcAvailabilityCheck() {
  const setNfcAvailable = usePreferencesStore((state) => state.setNfcAvailable);
  const setNfcAvailabilityHydrated = usePreferencesStore(
    (state) => state.setNfcAvailabilityHydrated,
  );

  useEffect(() => {
    // Skip on web platform or when the native plugin bridge is unavailable
    if (!Capacitor.isNativePlatform() || !isNativePluginAvailable("Nfc")) {
      setNfcAvailable(false);
      setNfcAvailabilityHydrated(true);
      return;
    }

    // Check NFC availability from native plugin
    Nfc.isAvailable()
      .then((result) => {
        setNfcAvailable(result.nfc);
        setNfcAvailabilityHydrated(true);
      })
      .catch((e) => {
        if (!isCapacitorPluginUnavailableError(e)) {
          logger.error("Failed to check NFC availability:", e, {
            category: "nfc",
            action: "availabilityCheck",
            severity: "warning",
          });
        }
        // On error, assume NFC not available
        setNfcAvailable(false);
        setNfcAvailabilityHydrated(true);
      });
  }, [setNfcAvailable, setNfcAvailabilityHydrated]);
}
