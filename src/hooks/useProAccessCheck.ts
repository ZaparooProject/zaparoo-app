import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Purchases, type CustomerInfo } from "@revenuecat/purchases-capacitor";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { logger } from "@/lib/logger";
import { getPurchaseAccess, purchasesReady } from "@/lib/purchasesSetup";
import { isNativePluginAvailable } from "@/lib/capacitorBridge";

const PRO_ACCESS_HYDRATION_TIMEOUT_MS = 5_000;

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
    let hydrationStage: "purchasesReady" | "customerInfo" = "purchasesReady";
    let hydrationTimeout: ReturnType<typeof setTimeout> | null = setTimeout(
      () => {
        hydrationTimeout = null;
        if (!active) return;

        logger.error("Pro access hydration timed out", {
          category: "purchase",
          action: "proAccessCheck",
          severity: "warning",
          timeoutMs: PRO_ACCESS_HYDRATION_TIMEOUT_MS,
          stage: hydrationStage,
        });
        setProAccessHydrated(true);
      },
      PRO_ACCESS_HYDRATION_TIMEOUT_MS,
    );

    const finishHydration = () => {
      if (!active) return;
      if (hydrationTimeout) {
        clearTimeout(hydrationTimeout);
        hydrationTimeout = null;
      }
      setProAccessHydrated(true);
    };

    const applyCustomerInfo = (customerInfo: CustomerInfo) => {
      if (!active) return;
      setLifetimeProAccess(getPurchaseAccess(customerInfo).lifetimePro);
    };

    purchasesReady
      .then(async () => {
        hydrationStage = "customerInfo";
        const info = await Purchases.getCustomerInfo();
        applyCustomerInfo(info.customerInfo);
        finishHydration();

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
        finishHydration();
      });

    return () => {
      active = false;
      if (hydrationTimeout) {
        clearTimeout(hydrationTimeout);
        hydrationTimeout = null;
      }
      if (listenerToRemove) {
        void Purchases.removeCustomerInfoUpdateListener({
          listenerToRemove,
        });
      }
    };
  }, [setLifetimeProAccess, setProAccessHydrated]);
}
