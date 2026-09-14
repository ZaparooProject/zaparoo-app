import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Purchases, type CustomerInfo } from "@revenuecat/purchases-capacitor";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { logger } from "@/lib/logger";
import { getPurchaseAccess, purchasesReady } from "@/lib/purchasesSetup";
import { isNativePluginAvailable } from "@/lib/capacitorBridge";

const PRO_ACCESS_HYDRATION_TIMEOUT_MS = 5_000;
// Customer info that arrives after the splash timeout is still applied, so a
// slow answer is only worth reporting when it never arrives.
const PRO_ACCESS_REPORT_TIMEOUT_MS = 30_000;

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
    const startedAt = Date.now();
    let hydrationTimeout: ReturnType<typeof setTimeout> | null = setTimeout(
      () => {
        hydrationTimeout = null;
        if (!active) return;

        // Stop holding the splash; cached access applies until RevenueCat
        // answers.
        logger.log(
          `Pro access still loading at ${hydrationStage} after ${PRO_ACCESS_HYDRATION_TIMEOUT_MS}ms`,
        );
        setProAccessHydrated(true);
      },
      PRO_ACCESS_HYDRATION_TIMEOUT_MS,
    );
    let reportTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      reportTimeout = null;
      if (!active) return;

      logger.error("Pro access check did not complete", {
        category: "purchase",
        action: "proAccessCheck",
        severity: "warning",
        elapsedMs: Date.now() - startedAt,
        stage: hydrationStage,
      });
    }, PRO_ACCESS_REPORT_TIMEOUT_MS);

    const clearTimers = () => {
      if (hydrationTimeout) {
        clearTimeout(hydrationTimeout);
        hydrationTimeout = null;
      }
      if (reportTimeout) {
        clearTimeout(reportTimeout);
        reportTimeout = null;
      }
    };

    const finishHydration = () => {
      if (!active) return;
      clearTimers();
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
      clearTimers();
      if (listenerToRemove) {
        void Purchases.removeCustomerInfoUpdateListener({
          listenerToRemove,
        });
      }
    };
  }, [setLifetimeProAccess, setProAccessHydrated]);
}
