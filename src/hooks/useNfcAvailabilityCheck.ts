import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { usePreferencesStore } from "../lib/preferencesStore";

/**
 * Hook to check NFC availability once at app startup.
 * This runs once at the App level to prevent layout shifts.
 * The result is cached in the preferences store.
 */
export function useNfcAvailabilityCheck() {
  const setNfcAvailable = usePreferencesStore((state) => state.setNfcAvailable);
  const setNfcAvailabilityHydrated = usePreferencesStore((state) => state.setNfcAvailabilityHydrated);

  useEffect(() => {
    // Skip on web platform
    if (!Capacitor.isNativePlatform()) {
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
        console.error("Failed to check NFC availability:", e);
        // On error, assume NFC not available
        setNfcAvailable(false);
        setNfcAvailabilityHydrated(true);
      });
  }, [setNfcAvailable, setNfcAvailabilityHydrated]);
}
