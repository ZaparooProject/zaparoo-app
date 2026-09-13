import { t } from "i18next";
import {
  Purchases,
  type PurchasesOfferings,
  type PurchasesPackage,
} from "@revenuecat/purchases-capacitor";
import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Clipboard } from "@capacitor/clipboard";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { SlideModal } from "@/components/SlideModal";
import { logger } from "@/lib/logger";
import {
  cachePurchaseErrorDiagnostics,
  clearCachedPurchaseErrorDiagnostics,
} from "@/lib/purchaseReportContext";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useStatusStore } from "@/lib/store";
import {
  getPurchaseErrorDiagnostics,
  PurchaseAlreadyOwnedError,
  PurchaseCancelledError,
  PurchaseNotAllowedError,
  PurchaseProductUnavailableError,
  wrapPurchaseError,
} from "@/lib/errors";
import {
  formatBillingDiagnostics,
  getBillingDiagnostics,
  getOfferingDiagnostics,
  getProPackage,
  getPurchaseAccess,
  loadOfferings,
  PRO_OFFERING_ID,
  reconcileStorePurchases,
  restorePurchasesForUser,
  runPurchasesOperation,
} from "@/lib/purchasesSetup";
import { Button } from "./wui/Button";

type OfferingsStatus =
  | "loading"
  | "available"
  | "missing"
  | "not_allowed"
  | "error"
  | "unsupported";

function getPurchaseBody(
  status: OfferingsStatus,
  purchasePackage: PurchasesPackage | null,
) {
  if (purchasePackage) {
    return t("scan.purchaseProP1", {
      price: purchasePackage.product.priceString,
    });
  }

  if (status === "loading") {
    return t("scan.purchaseProLoading");
  }

  if (status === "not_allowed") {
    return t("scan.purchaseProNotAllowed");
  }

  if (status === "error") {
    return t("scan.purchaseProOfferingsError");
  }

  return t("scan.purchaseProUnavailable");
}

// A shared offerings request reaches every screen that mounts while it is
// reused; report it and cache its diagnostics only once.
const handledOfferingsRequests = new WeakSet<Promise<PurchasesOfferings>>();

function claimOfferingsRequest(request: Promise<PurchasesOfferings>): boolean {
  if (handledOfferingsRequests.has(request)) return false;
  handledOfferingsRequests.add(request);
  return true;
}

function getPurchaseActionLabel(status: OfferingsStatus) {
  if (status === "loading") {
    return t("loading");
  }

  if (status === "available") {
    return t("scan.purchaseProAction");
  }

  return t("scan.purchaseProUnavailableAction");
}

const ProPurchaseModal = (props: {
  proPurchaseModalOpen: boolean;
  setProPurchaseModalOpen: (open: boolean) => void;
  purchasePackage: PurchasesPackage | null;
  offeringsStatus: OfferingsStatus;
  setLifetimeProAccess: (access: boolean) => void;
}) => {
  const [isPurchasing, setIsPurchasing] = useState(false);
  const purchasePendingRef = useRef(false);

  const activatePro = () => {
    props.setLifetimeProAccess(true);
    usePreferencesStore.getState().setLaunchOnScan(true);
    props.setProPurchaseModalOpen(false);
  };

  const recoverAlreadyOwnedPurchase = async (
    appUserID: string | null,
    wrappedError: PurchaseAlreadyOwnedError,
  ) => {
    try {
      const customerInfo = await reconcileStorePurchases(appUserID);
      if (getPurchaseAccess(customerInfo).lifetimePro) {
        clearCachedPurchaseErrorDiagnostics();
        activatePro();
        toast.success(t("scan.purchaseProRestored"));
        return;
      }
    } catch (reconcileError) {
      logger.error("Store ownership reconciliation failed", reconcileError, {
        category: "purchase",
        action: "syncAlreadyOwnedPurchase",
        severity: "warning",
      });
    }

    // The native store has authoritatively confirmed ownership of this known
    // non-consumable. Preserve access locally so a missing RevenueCat alias
    // cannot leave the customer permanently unable to buy or restore Pro.
    usePreferencesStore.getState().setStoreVerifiedProAccess(true);
    activatePro();
    logger.error("Pro access recovered from store ownership", wrappedError, {
      category: "purchase",
      action: "alreadyOwnedFallback",
      severity: "warning",
      recovery: "store_verified_local_access",
    });
    toast.success(t("scan.purchaseProRestored"));
  };

  const handlePurchase = () => {
    if (!props.purchasePackage || purchasePendingRef.current) return;

    purchasePendingRef.current = true;
    setIsPurchasing(true);
    const purchasePackage = props.purchasePackage;
    const user = useStatusStore.getState().loggedInUser;
    void (async () => {
      try {
        const purchase = await runPurchasesOperation(user?.uid ?? null, () =>
          Purchases.purchasePackage({
            aPackage: purchasePackage,
          }),
        );
        let access = getPurchaseAccess(purchase.customerInfo);
        if (!access.lifetimePro) {
          // The store has already charged the customer; the entitlement just
          // hasn't shown up in this response. Reconcile once before treating
          // a paid purchase as a failure.
          const reconciledInfo = await reconcileStorePurchases(
            user?.uid ?? null,
          ).catch(() => null);
          if (reconciledInfo) access = getPurchaseAccess(reconciledInfo);
        }
        if (!access.lifetimePro) {
          throw new Error("Purchase completed without a Pro entitlement");
        }

        clearCachedPurchaseErrorDiagnostics();
        activatePro();
        logger.log("Pro purchase completed", {
          platform: Capacitor.getPlatform(),
          packageIdentifier: purchasePackage.identifier,
        });
      } catch (e) {
        const wrappedError = wrapPurchaseError(e);
        if (wrappedError instanceof PurchaseCancelledError) return;

        const purchaseError = getPurchaseErrorDiagnostics(e);
        if (Object.keys(purchaseError).length > 0) {
          cachePurchaseErrorDiagnostics(purchaseError, "purchasePackage");
        }
        if (wrappedError instanceof PurchaseAlreadyOwnedError) {
          await recoverAlreadyOwnedPurchase(user?.uid ?? null, wrappedError);
          return;
        }

        logger.error("Pro purchase failed", wrappedError, {
          category: "purchase",
          action: "purchasePackage",
          severity: "warning",
          purchaseError,
        });
        toast.error(t("scan.purchaseProFailed"));
      } finally {
        purchasePendingRef.current = false;
        setIsPurchasing(false);
      }
    })();
  };

  const supportActionsVariant =
    props.offeringsStatus === "not_allowed" ||
    props.offeringsStatus === "missing" ||
    props.offeringsStatus === "error"
      ? "diagnosticsOnly"
      : null;

  return (
    <SlideModal
      isOpen={props.proPurchaseModalOpen}
      close={() => {
        if (!purchasePendingRef.current) {
          props.setProPurchaseModalOpen(false);
        }
      }}
      dismissible={!isPurchasing}
      title={t("scan.purchaseProTitle")}
      footer={
        <Button
          label={
            isPurchasing
              ? t("loading")
              : getPurchaseActionLabel(props.offeringsStatus)
          }
          icon={
            isPurchasing ? (
              <Loader2 size={20} className="animate-spin" />
            ) : undefined
          }
          disabled={!props.purchasePackage || isPurchasing}
          onClick={handlePurchase}
          intent="primary"
          className="w-full"
        />
      }
    >
      <div className="text-muted-foreground flex flex-col gap-3 py-2">
        <p>{getPurchaseBody(props.offeringsStatus, props.purchasePackage)}</p>
        <p>{t("scan.purchaseProP2")}</p>
        {supportActionsVariant && (
          <PurchaseSupportActions variant={supportActionsVariant} />
        )}
      </div>
    </SlideModal>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useProPurchase = () => {
  // Subscribe directly to the store for reactive updates
  const proAccess = usePreferencesStore(
    (state) => state.lifetimeProAccess === true,
  );
  const setLifetimeProAccess = usePreferencesStore(
    (state) => state.setLifetimeProAccess,
  );
  const proPurchaseModalOpen = useStatusStore(
    (state) => state.proPurchaseModalOpen,
  );
  const setProPurchaseModalOpen = useStatusStore(
    (state) => state.setProPurchaseModalOpen,
  );
  const [launcherPackage, setLauncherPackage] =
    useState<PurchasesPackage | null>(null);
  const [offeringsStatus, setOfferingsStatus] = useState<OfferingsStatus>(() =>
    Capacitor.isNativePlatform() ? "loading" : "unsupported",
  );
  const [offeringsReloads, setOfferingsReloads] = useState(0);
  const [previousModalOpen, setPreviousModalOpen] =
    useState(proPurchaseModalOpen);

  // Offerings are shared for the session, so opening checkout is where a
  // failed or incomplete result gets retried.
  if (proPurchaseModalOpen !== previousModalOpen) {
    setPreviousModalOpen(proPurchaseModalOpen);
    if (
      proPurchaseModalOpen &&
      (offeringsStatus === "missing" ||
        offeringsStatus === "not_allowed" ||
        offeringsStatus === "error")
    ) {
      setLauncherPackage(null);
      setOfferingsStatus("loading");
      setOfferingsReloads((count) => count + 1);
    }
  }

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      logger.log("web platform, skipping purchases");
      return;
    }

    let active = true;
    // Fetch explicit Pro offering so adding another offering cannot change
    // what the permanent Pro action purchases. Diagnostics are gathered
    // separately, on demand, so this checkout-critical fetch never waits on
    // extra bridge calls.
    const request = loadOfferings({ refresh: offeringsReloads > 0 });
    const firstHandler = claimOfferingsRequest(request);
    request
      .then((offerings) => {
        const purchasePackage = getProPackage(offerings);

        if (!purchasePackage && firstHandler) {
          logger.error(
            "RevenueCat offerings returned no packages",
            {
              platform: Capacitor.getPlatform(),
              ...getOfferingDiagnostics(offerings, PRO_OFFERING_ID),
            },
            {
              category: "purchase",
              action: "getOfferings",
              severity: "warning",
            },
          );
        }
        if (!active) return;
        setLauncherPackage(purchasePackage);
        setOfferingsStatus(purchasePackage ? "available" : "missing");
      })
      .catch((e) => {
        const wrappedError = wrapPurchaseError(e);
        if (firstHandler) {
          const purchaseError = getPurchaseErrorDiagnostics(e);
          if (Object.keys(purchaseError).length > 0) {
            cachePurchaseErrorDiagnostics(purchaseError, "getOfferings");
          }
          // Devices without usable store billing (no Play services, outdated
          // store, restricted accounts) reject every offerings fetch. That is
          // an environment state shown in the modal, not an app defect; the
          // cached diagnostics still reach support through the copy action.
          if (!(wrappedError instanceof PurchaseNotAllowedError)) {
            logger.error("RevenueCat offerings unavailable", wrappedError, {
              category: "purchase",
              action: "getOfferings",
              severity: "warning",
              purchaseError,
            });
          }
        }
        if (!active) return;
        setLauncherPackage(null);
        setOfferingsStatus(
          wrappedError instanceof PurchaseNotAllowedError
            ? "not_allowed"
            : wrappedError instanceof PurchaseProductUnavailableError
              ? "missing"
              : "error",
        );
      });

    return () => {
      active = false;
    };
  }, [offeringsReloads]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Skip customer info check if already hydrated (initial state already set)
    const proAccessHydrated = usePreferencesStore.getState()._proAccessHydrated;
    if (proAccessHydrated) {
      return;
    }

    // Fallback if not hydrated yet (shouldn't happen normally)
    Purchases.getCustomerInfo()
      .then((info) => {
        setLifetimeProAccess(getPurchaseAccess(info.customerInfo).lifetimePro);
      })
      .catch((e) => {
        logger.error("customer info error", e, {
          category: "purchase",
          action: "getCustomerInfo",
          severity: "warning",
        });
      });
  }, [setLifetimeProAccess]);

  return {
    proAccess,
    purchaseModal: (
      <ProPurchaseModal
        proPurchaseModalOpen={proPurchaseModalOpen}
        setProPurchaseModalOpen={setProPurchaseModalOpen}
        purchasePackage={launcherPackage}
        offeringsStatus={offeringsStatus}
        setLifetimeProAccess={setLifetimeProAccess}
      />
    ),
    proPurchaseModalOpen,
    setProPurchaseModalOpen,
  };
};

export function PurchaseSupportActions({
  variant = "full",
}: {
  variant?: "full" | "restoreOnly" | "diagnosticsOnly";
} = {}) {
  const [isRestoring, setIsRestoring] = useState(false);
  const [isCopyingDiagnostics, setIsCopyingDiagnostics] = useState(false);
  const setLifetimeProAccess = usePreferencesStore(
    (state) => state.setLifetimeProAccess,
  );
  const setOnlinePremiumAccess = usePreferencesStore(
    (state) => state.setOnlinePremiumAccess,
  );
  const loggedInUser = useStatusStore((state) => state.loggedInUser);

  const handleRestore = async () => {
    if (isRestoring) return;
    setIsRestoring(true);

    try {
      const customerInfo = await restorePurchasesForUser(
        loggedInUser?.uid ?? null,
      );
      const access = getPurchaseAccess(customerInfo);
      clearCachedPurchaseErrorDiagnostics();
      const storeVerifiedProAccess =
        usePreferencesStore.getState().storeVerifiedProAccess;
      setLifetimeProAccess(access.lifetimePro || storeVerifiedProAccess);
      if (access.warp && loggedInUser) {
        setOnlinePremiumAccess(true);
      }

      if (access.warp && !loggedInUser) {
        toast(t("settings.app.restoreWarpSignIn"));
        return;
      }
      if (access.lifetimePro || access.warp || storeVerifiedProAccess) {
        toast.success(t("settings.app.restoreSuccess"));
        return;
      }

      logger.error(
        "Purchase restore found no active entitlements",
        new Error("No active purchases found after store restore"),
        {
          category: "purchase",
          action: "restorePurchasesNotFound",
          severity: "warning",
        },
      );
      toast.error(t("settings.app.restoreNotFound"));
    } catch (error) {
      const purchaseError = getPurchaseErrorDiagnostics(error);
      if (Object.keys(purchaseError).length > 0) {
        cachePurchaseErrorDiagnostics(purchaseError, "restorePurchases");
      }
      logger.error("Purchase restore failed", error, {
        category: "purchase",
        action: "restorePurchases",
        severity: "warning",
        purchaseError,
      });
      toast.error(t("settings.app.restoreFail"));
    } finally {
      setIsRestoring(false);
    }
  };

  const handleCopyDiagnostics = async () => {
    if (isCopyingDiagnostics) return;
    setIsCopyingDiagnostics(true);

    try {
      const diagnostics = await getBillingDiagnostics(
        loggedInUser?.uid ?? null,
      );
      await Clipboard.write({ string: formatBillingDiagnostics(diagnostics) });
      toast.success(t("settings.app.billingDiagnosticsCopied"));
    } catch (error) {
      logger.error("Failed to copy billing diagnostics", error, {
        category: "purchase",
        action: "copyBillingDiagnostics",
        severity: "warning",
      });
      toast.error(t("settings.app.billingDiagnosticsCopyFailed"));
    } finally {
      setIsCopyingDiagnostics(false);
    }
  };

  const showRestore = variant !== "diagnosticsOnly";
  const showDiagnostics = variant !== "restoreOnly";
  const useOutlineButtons = variant !== "restoreOnly";

  return (
    <div className="flex flex-col gap-2">
      {showDiagnostics && (
        <Button
          label={t("settings.app.copyBillingDiagnostics")}
          variant={useOutlineButtons ? "outline" : "text"}
          onClick={() => void handleCopyDiagnostics()}
          disabled={isRestoring || isCopyingDiagnostics}
          className="w-full"
        />
      )}
      {showRestore && (
        <Button
          label={
            isRestoring
              ? t("online.warp.restoring")
              : t("settings.app.restorePurchases")
          }
          variant={useOutlineButtons ? "outline" : "text"}
          onClick={() => void handleRestore()}
          disabled={isRestoring || isCopyingDiagnostics}
          className="w-full"
        />
      )}
    </div>
  );
}
