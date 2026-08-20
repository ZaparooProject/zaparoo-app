import { t } from "i18next";
import {
  Purchases,
  type PurchasesPackage,
} from "@revenuecat/purchases-capacitor";
import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import toast from "react-hot-toast";
import { SlideModal } from "@/components/SlideModal";
import { logger } from "@/lib/logger";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useStatusStore } from "@/lib/store";
import { PurchaseCancelledError, wrapPurchaseError } from "@/lib/errors";
import {
  getOfferingDiagnostics,
  getProPackage,
  getPurchaseAccess,
  PRO_OFFERING_ID,
  purchasesReady,
  runPurchasesOperation,
} from "@/lib/purchasesSetup";
import { Button } from "./wui/Button";

type OfferingsStatus =
  | "loading"
  | "available"
  | "missing"
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

// eslint-disable-next-line react-refresh/only-export-components
const ProPurchaseModal = (props: {
  proPurchaseModalOpen: boolean;
  setProPurchaseModalOpen: (open: boolean) => void;
  purchasePackage: PurchasesPackage | null;
  offeringsStatus: OfferingsStatus;
  setLifetimeProAccess: (access: boolean) => void;
}) => {
  const [isPurchasing, setIsPurchasing] = useState(false);
  const purchasePendingRef = useRef(false);

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
        const access = getPurchaseAccess(purchase.customerInfo);
        props.setLifetimeProAccess(access.lifetimePro);
        if (access.lifetimePro) {
          usePreferencesStore.getState().setLaunchOnScan(true);
        }
        props.setProPurchaseModalOpen(false);
        logger.log("Pro purchase completed", {
          platform: Capacitor.getPlatform(),
          packageIdentifier: purchasePackage.identifier,
        });
      } catch (e) {
        const wrappedError = wrapPurchaseError(e);
        if (wrappedError instanceof PurchaseCancelledError) return;

        logger.error("Pro purchase failed", wrappedError, {
          category: "purchase",
          action: "purchasePackage",
          severity: "warning",
        });
        toast.error(t("scan.purchaseProFailed"));
      } finally {
        purchasePendingRef.current = false;
        setIsPurchasing(false);
      }
    })();
  };

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
      </div>
    </SlideModal>
  );
};

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
    // what the permanent Pro action purchases.
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
        setLauncherPackage(null);
        setOfferingsStatus("error");
        logger.error("RevenueCat offerings unavailable", e, {
          category: "purchase",
          action: "getOfferings",
          severity: "warning",
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
