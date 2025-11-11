import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Purchases } from "@revenuecat/purchases-capacitor";
import { usePreferencesStore } from "../lib/preferencesStore";

/**
 * Hook to check Pro access status from RevenueCat on app startup.
 * This runs once at the App level to prevent layout shifts.
 * The result is cached in the preferences store.
 */
export function useProAccessCheck() {
  const setLauncherAccess = usePreferencesStore((state) => state.setLauncherAccess);
  const setProAccessHydrated = usePreferencesStore((state) => state.setProAccessHydrated);

  useEffect(() => {
    // Skip on web platform
    if (Capacitor.getPlatform() === "web") {
      console.log("Web platform, skipping Pro access check");
      setProAccessHydrated(true);
      return;
    }

    // Check customer info from RevenueCat
    Purchases.getCustomerInfo()
      .then((info) => {
        if (info.customerInfo.entitlements.active.tapto_launcher) {
          setLauncherAccess(true);
        } else {
          setLauncherAccess(false);
        }
        setProAccessHydrated(true);
      })
      .catch((e) => {
        console.error("Failed to check Pro access:", e);
        // On error, mark as hydrated but keep cached value
        setProAccessHydrated(true);
      });
  }, [setLauncherAccess, setProAccessHydrated]);
}
