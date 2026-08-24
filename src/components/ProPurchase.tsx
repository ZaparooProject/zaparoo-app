import { t } from "i18next";
import {
  Purchases,
  type PurchasesPackage,
} from "@revenuecat/purchases-capacitor";
import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Clipboard } from "@capacitor/clipboard";
import toast from "react-hot-toast";
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
  PRO_OFFERING_ID,
  purchasesReady,
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

  // RevenueCat can report an already-owned iOS product as cancellation. Keep
  // cancellation non-authoritative, but leave explicit restoration available.
  const supportActionsVariant =
    props.offeringsStatus === "available"
      ? "restoreOnly"
      : props.offeringsStatus === "not_allowed" ||
          props.offeringsStatus === "missing" ||
          props.offeringsStatus === "error"
        ? "full"
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

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      logger.log("web platform, skipping purchases");
      return;
    }

    // Fetch explicit Pro offering so adding another offering cannot change
    // what the permanent Pro action purchases. Diagnostics are gathered
    // separately, on demand, so this checkout-critical fetch never waits on
    // extra bridge calls.
    purchasesReady
      .then(() => Purchases.getOfferings())
      .then((offerings) => {
        const purchasePackage = getProPackage(offerings);

        if (purchasePackage) {
          setLauncherPackage(purchasePackage);
          setOfferingsStatus("available");
          return;
        }

        setLauncherPackage(null);
        setOfferingsStatus("missing");
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
      })
      .catch((e) => {
        const wrappedError = wrapPurchaseError(e);
        const purchaseError = getPurchaseErrorDiagnostics(e);
        if (Object.keys(purchaseError).length > 0) {
          cachePurchaseErrorDiagnostics(purchaseError, "getOfferings");
        }
        setLauncherPackage(null);
        setOfferingsStatus(
          wrappedError instanceof PurchaseNotAllowedError
            ? "not_allowed"
            : wrappedError instanceof PurchaseProductUnavailableError
              ? "missing"
              : "error",
        );
        logger.error("RevenueCat offerings unavailable", wrappedError, {
          category: "purchase",
          action: "getOfferings",
          severity: "warning",
          purchaseError,
        });
      });

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
      if (!access.lifetimePro) {
        // A clean restore that found no Pro entitlement means the store no
        // longer backs the earlier "already owned" local fallback either.
        usePreferencesStore.getState().setStoreVerifiedProAccess(false);
      }
      setLifetimeProAccess(access.lifetimePro);
      if (access.warp && loggedInUser) {
        setOnlinePremiumAccess(true);
      }

      if (access.warp && !loggedInUser) {
        toast(t("settings.app.restoreWarpSignIn"));
        return;
      }
      if (access.lifetimePro || access.warp) {
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

  return (
    <div className="flex flex-col gap-1">
      {showRestore && (
        <Button
          label={
            isRestoring
              ? t("online.warp.restoring")
              : t("settings.app.restorePurchases")
          }
          variant="text"
          onClick={() => void handleRestore()}
          disabled={isRestoring || isCopyingDiagnostics}
          className="w-full"
        />
      )}
      {showDiagnostics && (
        <Button
          label={
            isCopyingDiagnostics
              ? t("loading")
              : t("settings.app.copyBillingDiagnostics")
          }
          variant="text"
          onClick={() => void handleCopyDiagnostics()}
          disabled={isRestoring || isCopyingDiagnostics}
          className="w-full"
        />
      )}
    </div>
  );
}
