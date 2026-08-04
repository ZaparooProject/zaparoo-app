import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Purchases, type CustomerInfo } from "@revenuecat/purchases-capacitor";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { logger } from "@/lib/logger";
import { getPurchaseAccess, purchasesReady } from "@/lib/purchasesSetup";
import { isNativePluginAvailable } from "@/lib/capacitorBridge";

/**
 * Hydrates permanent Pro ownership from RevenueCat and keeps it current.
 * Account-owned online access is synchronized separately after Firebase auth.
 */
export function useProAccessCheck() {
  const setLifetimeProAccess = usePreferencesStore(
    (state) => state.setLifetimeProAccess,
  );
  const setProAccessHydrated = usePreferencesStore(
    (state) => state.setProAccessHydrated,
  );

  useEffect(() => {
    if (Capacitor.getPlatform() === "web") {
      logger.log("Web platform, skipping Pro access check");
      setProAccessHydrated(true);
      return undefined;
    }

    if (!isNativePluginAvailable("Purchases")) {
      setProAccessHydrated(true);
      return undefined;
    }

    let active = true;
    let listenerToRemove: string | null = null;

    const applyCustomerInfo = (customerInfo: CustomerInfo) => {
      if (!active) return;
      setLifetimeProAccess(getPurchaseAccess(customerInfo).lifetimePro);
    };

    purchasesReady
      .then(async () => {
        const info = await Purchases.getCustomerInfo();
        applyCustomerInfo(info.customerInfo);
        if (active) setProAccessHydrated(true);

        listenerToRemove =
          await Purchases.addCustomerInfoUpdateListener(applyCustomerInfo);
        if (!active && listenerToRemove) {
          await Purchases.removeCustomerInfoUpdateListener({
            listenerToRemove,
          });
        }
      })
      .catch((e) => {
        logger.error("Failed to check Pro access:", e, {
          category: "purchase",
          action: "proAccessCheck",
          severity: "warning",
        });
        if (active) setProAccessHydrated(true);
      });

    return () => {
      active = false;
      if (listenerToRemove) {
        void Purchases.removeCustomerInfoUpdateListener({
          listenerToRemove,
        });
      }
    };
  }, [setLifetimeProAccess, setProAccessHydrated]);
}
