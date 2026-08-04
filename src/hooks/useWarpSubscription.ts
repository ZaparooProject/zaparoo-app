import { useCallback, useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { Purchases } from "@revenuecat/purchases-capacitor";
import type { SubscriptionResponse } from "@/lib/models";
import { getSubscriptionStatus } from "@/lib/onlineApi";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useStatusStore } from "@/lib/store";
import {
  ensurePurchasesUser,
  getOfferingDiagnostics,
  getPurchaseAccess,
  getWarpPackages,
  runPurchasesOperation,
  WARP_OFFERING_ID,
  type WarpPackages,
} from "@/lib/purchasesSetup";
import {
  PurchaseCancelledError,
  PurchaseIdentityError,
  PurchasePendingError,
  wrapPurchaseError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";

export type WarpPlan = "monthly" | "annual";
export type WarpAction = "purchase" | "restore" | "manage" | "refresh" | null;
export type WarpPurchaseResult =
  | "active"
  | "activation_pending"
  | "pending"
  | "identity_error"
  | "cancelled"
  | "busy"
  | "failed";
export type WarpRestoreResult =
  | "active"
  | "pro_restored"
  | "activation_pending"
  | "not_found"
  | "failed";
export type WarpManageResult = "opened" | "unavailable" | "failed";

const ACTIVATION_POLL_INTERVAL_MS = 2000;
export const ACTIVATION_POLL_DEADLINE_MS = 30_000;
const ACTIVATION_REQUEST_TIMEOUT_MS = 8000;

function wait(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  if (delayMs <= 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, delayMs);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

async function getSubscriptionStatusWithTimeout(
  signal: AbortSignal,
  timeoutMs = ACTIVATION_REQUEST_TIMEOUT_MS,
): Promise<SubscriptionResponse> {
  const requestController = new AbortController();
  const abortRequest = () => requestController.abort(signal.reason);
  signal.addEventListener("abort", abortRequest, { once: true });
  const timeout = window.setTimeout(
    () => requestController.abort(new Error("Subscription status timed out")),
    timeoutMs,
  );

  try {
    return await getSubscriptionStatus(requestController.signal);
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener("abort", abortRequest);
  }
}

export function useWarpSubscription(appUserID: string) {
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(
    null,
  );
  const [packages, setPackages] = useState<WarpPackages | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<WarpPlan>("annual");
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [packagesUnavailable, setPackagesUnavailable] = useState(false);
  const [revenueCatWarpActive, setRevenueCatWarpActive] = useState(false);
  const [action, setAction] = useState<WarpAction>(null);
  const [activationPending, setActivationPending] = useState(false);
  const actionRef = useRef<WarpAction>(null);
  const actionAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const setLifetimeProAccess = usePreferencesStore(
    (state) => state.setLifetimeProAccess,
  );
  const setOnlinePremiumAccess = usePreferencesStore(
    (state) => state.setOnlinePremiumAccess,
  );

  const applySubscription = useCallback(
    (nextSubscription: SubscriptionResponse) => {
      if (!mountedRef.current) return;
      setSubscription(nextSubscription);
      setOnlinePremiumAccess(nextSubscription.is_premium);
      if (nextSubscription.is_premium) setActivationPending(false);
    },
    [setOnlinePremiumAccess],
  );

  const loadAccount = useCallback(
    async (signal: AbortSignal, silent = false) => {
      if (!mountedRef.current) return;
      if (!silent) setIsLoading(true);
      setLoadFailed(false);
      setPackagesUnavailable(false);

      try {
        if (!Capacitor.isNativePlatform()) {
          const nextSubscription = await getSubscriptionStatus(signal);
          if (signal.aborted) return;
          setPackages(null);
          setRevenueCatWarpActive(false);
          applySubscription(nextSubscription);
          return;
        }

        const [customerInfo, nextSubscription] = await Promise.all([
          ensurePurchasesUser(appUserID),
          getSubscriptionStatus(signal),
        ]);
        if (signal.aborted) return;

        const access = getPurchaseAccess(customerInfo);
        setLifetimeProAccess(access.lifetimePro);
        setRevenueCatWarpActive(access.warp);
        applySubscription(nextSubscription);

        if (nextSubscription.is_premium) {
          setPackages(null);
          return;
        }

        if (access.warp) {
          setPackages(null);
          setActivationPending(true);
          return;
        }

        const offerings = await Purchases.getOfferings();
        if (signal.aborted) return;

        const warpPackages = getWarpPackages(offerings);
        setPackages(warpPackages);
        setPackagesUnavailable(!warpPackages);
        if (!warpPackages) {
          logger.error(
            "RevenueCat Warp offering is unavailable",
            getOfferingDiagnostics(offerings, WARP_OFFERING_ID),
            {
              category: "purchase",
              action: "getOfferings",
              severity: "warning",
            },
          );
        }
      } catch (e) {
        if (signal.aborted) return;
        setPackages(null);
        setLoadFailed(true);
        logger.error("Failed to load Warp subscription", e, {
          category: "purchase",
          action: "loadSubscription",
          severity: "warning",
        });
      } finally {
        if (!silent && !signal.aborted && mountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [appUserID, applySubscription, setLifetimeProAccess],
  );

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    let appStateHandle: { remove: () => Promise<void> } | null = null;

    void Promise.resolve().then(() => loadAccount(controller.signal));
    void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive || controller.signal.aborted || actionRef.current) return;
      void loadAccount(controller.signal, true);
    })
      .then((handle) => {
        if (controller.signal.aborted) {
          void handle.remove();
          return;
        }
        appStateHandle = handle;
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        logger.error("Failed to listen for subscription refresh", e, {
          category: "lifecycle",
          action: "appStateChange",
          severity: "warning",
        });
      });

    return () => {
      mountedRef.current = false;
      controller.abort();
      actionAbortRef.current?.abort();
      if (appStateHandle) void appStateHandle.remove();
    };
  }, [loadAccount]);

  const beginAction = useCallback((nextAction: Exclude<WarpAction, null>) => {
    if (actionRef.current) return null;

    const controller = new AbortController();
    actionRef.current = nextAction;
    actionAbortRef.current?.abort();
    actionAbortRef.current = controller;
    setAction(nextAction);
    return controller;
  }, []);

  const finishAction = useCallback(() => {
    actionRef.current = null;
    if (mountedRef.current) setAction(null);
  }, []);

  const pollForActivation = useCallback(
    async (signal: AbortSignal): Promise<boolean> => {
      const deadline = Date.now() + ACTIVATION_POLL_DEADLINE_MS;

      while (!signal.aborted) {
        const requestBudgetMs = deadline - Date.now();
        if (requestBudgetMs <= 0) return false;

        try {
          const nextSubscription = await getSubscriptionStatusWithTimeout(
            signal,
            Math.min(ACTIVATION_REQUEST_TIMEOUT_MS, requestBudgetMs),
          );
          applySubscription(nextSubscription);
          if (nextSubscription.is_premium) return true;
        } catch (e) {
          if (signal.aborted) throw e;
        }

        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) return false;
        await wait(Math.min(ACTIVATION_POLL_INTERVAL_MS, remainingMs), signal);
      }

      return false;
    },
    [applySubscription],
  );

  const retry = useCallback(async () => {
    const controller = beginAction("refresh");
    if (!controller) return;

    try {
      await loadAccount(controller.signal);
    } finally {
      finishAction();
    }
  }, [beginAction, finishAction, loadAccount]);

  const purchase = useCallback(async (): Promise<WarpPurchaseResult> => {
    const controller = beginAction("purchase");
    if (!controller) return "busy";
    setActivationPending(false);

    try {
      if (
        !Capacitor.isNativePlatform() ||
        useStatusStore.getState().loggedInUser?.uid !== appUserID
      ) {
        return "identity_error";
      }

      const latestSubscription = await getSubscriptionStatus(controller.signal);
      applySubscription(latestSubscription);
      if (latestSubscription.is_premium) return "active";

      const purchaseResult = await runPurchasesOperation(
        appUserID,
        async (initialCustomerInfo) => {
          if (useStatusStore.getState().loggedInUser?.uid !== appUserID) {
            throw new PurchaseIdentityError();
          }

          const initialAccess = getPurchaseAccess(initialCustomerInfo);
          if (initialAccess.warp) {
            return {
              customerInfo: initialCustomerInfo,
              packageIdentifier: null,
              purchased: false,
            };
          }

          const offerings = await Purchases.getOfferings();
          const freshPackages = getWarpPackages(offerings);
          const purchasePackage = freshPackages?.[selectedPlan];
          if (!purchasePackage) {
            logger.error(
              "RevenueCat Warp package is unavailable at checkout",
              getOfferingDiagnostics(offerings, WARP_OFFERING_ID),
              {
                category: "purchase",
                action: "purchasePackage",
                severity: "warning",
              },
            );
            throw new Error("Selected Warp package is unavailable");
          }

          const result = await Purchases.purchasePackage({
            aPackage: purchasePackage,
          });
          return {
            customerInfo: result.customerInfo,
            packageIdentifier: purchasePackage.identifier,
            purchased: true,
          };
        },
      );

      const access = getPurchaseAccess(purchaseResult.customerInfo);
      setLifetimeProAccess(access.lifetimePro);
      setRevenueCatWarpActive(access.warp);

      logger.log("Warp purchase operation completed", {
        platform: Capacitor.getPlatform(),
        packageIdentifier: purchaseResult.packageIdentifier,
        storeCheckoutCompleted: purchaseResult.purchased,
        warpEntitlementActive: access.warp,
      });

      if (await pollForActivation(controller.signal)) return "active";
      logger.error(
        "Warp activation confirmation timed out",
        new Error("Public subscription status remained inactive"),
        {
          category: "api",
          action: "activationPolling",
          severity: "warning",
        },
      );
      if (mountedRef.current) setActivationPending(true);
      return "activation_pending";
    } catch (e) {
      if (controller.signal.aborted) return "cancelled";
      const wrappedError = wrapPurchaseError(e);
      if (wrappedError instanceof PurchaseCancelledError) return "cancelled";
      if (wrappedError instanceof PurchasePendingError) return "pending";
      if (wrappedError instanceof PurchaseIdentityError) {
        return "identity_error";
      }

      logger.error("Warp purchase failed", wrappedError, {
        category: "purchase",
        action: "purchasePackage",
        severity: "warning",
      });
      return "failed";
    } finally {
      finishAction();
    }
  }, [
    appUserID,
    applySubscription,
    beginAction,
    finishAction,
    pollForActivation,
    selectedPlan,
    setLifetimeProAccess,
  ]);

  const restore = useCallback(async (): Promise<WarpRestoreResult> => {
    const controller = beginAction("restore");
    if (!controller) return "failed";

    try {
      if (
        !Capacitor.isNativePlatform() ||
        useStatusStore.getState().loggedInUser?.uid !== appUserID
      ) {
        return "failed";
      }

      const result = await runPurchasesOperation(appUserID, () =>
        Purchases.restorePurchases(),
      );
      const access = getPurchaseAccess(result.customerInfo);
      setLifetimeProAccess(access.lifetimePro);
      setRevenueCatWarpActive(access.warp);

      logger.log("Purchase restore completed", {
        hasLifetimePro: access.lifetimePro,
        hasWarp: access.warp,
      });

      const currentSubscription = await getSubscriptionStatusWithTimeout(
        controller.signal,
      );
      applySubscription(currentSubscription);
      if (currentSubscription.is_premium) return "active";

      if (access.warp) {
        if (await pollForActivation(controller.signal)) return "active";
        logger.error(
          "Restored Warp activation confirmation timed out",
          new Error("Public subscription status remained inactive"),
          {
            category: "api",
            action: "activationPolling",
            severity: "warning",
          },
        );
        if (mountedRef.current) setActivationPending(true);
        return "activation_pending";
      }

      if (access.lifetimePro) return "pro_restored";
      return "not_found";
    } catch (e) {
      if (!controller.signal.aborted) {
        logger.error("Purchase restore failed", e, {
          category: "purchase",
          action: "restorePurchases",
          severity: "warning",
        });
      }
      return "failed";
    } finally {
      finishAction();
    }
  }, [
    appUserID,
    applySubscription,
    beginAction,
    finishAction,
    pollForActivation,
    setLifetimeProAccess,
  ]);

  const manage = useCallback(async (): Promise<WarpManageResult> => {
    const controller = beginAction("manage");
    if (!controller) return "failed";

    try {
      if (
        !Capacitor.isNativePlatform() ||
        useStatusStore.getState().loggedInUser?.uid !== appUserID
      ) {
        return "failed";
      }

      const managementURL = await runPurchasesOperation(
        appUserID,
        async (customerInfo) => customerInfo.managementURL,
      );
      if (!managementURL) return "unavailable";
      await Browser.open({ url: managementURL });
      return "opened";
    } catch (e) {
      if (!controller.signal.aborted) {
        logger.error("Failed to open subscription management", e, {
          category: "purchase",
          action: "manageSubscription",
          severity: "warning",
        });
      }
      return "failed";
    } finally {
      finishAction();
    }
  }, [appUserID, beginAction, finishAction]);

  return {
    subscription,
    packages,
    selectedPlan,
    setSelectedPlan,
    isLoading,
    loadFailed,
    packagesUnavailable,
    revenueCatWarpActive,
    action,
    activationPending,
    purchase,
    restore,
    manage,
    retry,
  };
}
