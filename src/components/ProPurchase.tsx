import { t } from "i18next";
import {
  Purchases,
  type PurchasesOfferings,
  type PurchasesPackage,
} from "@revenuecat/purchases-capacitor";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { logger } from "@/lib/logger";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useStatusStore } from "@/lib/store";
import { useHaptics } from "@/hooks/useHaptics";
import { PurchaseCancelledError, wrapPurchaseError } from "@/lib/errors";
import { Button } from "./wui/Button";

export const RestorePuchasesButton = () => {
  const setLauncherAccess = usePreferencesStore.getState().setLauncherAccess;
  const { notification } = useHaptics();

  return (
    <Button
      label={t("settings.app.restorePurchases")}
      className="w-full"
      onClick={async () => {
        logger.log("Restore button clicked");
        try {
          await Purchases.restorePurchases();
          const info = await Purchases.getCustomerInfo();
          logger.log("Restore purchases - customer info:", {
            entitlements: info.customerInfo.entitlements,
            activeEntitlements: Object.keys(
              info.customerInfo.entitlements?.active || {},
            ),
            hasTaptoLauncher:
              !!info.customerInfo.entitlements?.active?.tapto_launcher,
          });
          if (info.customerInfo.entitlements?.active?.tapto_launcher) {
            setLauncherAccess(true);
            notification("success");
            toast.success(t("settings.app.restoreSuccess"));
          } else {
            // No active Pro entitlement found - inform user
            toast.error(t("settings.app.restoreNotFound"));
          }
        } catch (e) {
          logger.error("restore purchases error", e, {
            category: "purchase",
            action: "restore",
            severity: "warning",
          });
          toast.error(t("settings.app.restoreFail"));
        }
      }}
    />
  );
};

type OfferingsStatus =
  | "loading"
  | "available"
  | "missing"
  | "error"
  | "unsupported";

function getOfferingDiagnostics(offerings: PurchasesOfferings) {
  const allOfferings = Object.values(offerings.all ?? {});

  return {
    platform: Capacitor.getPlatform(),
    hasCurrentOffering: !!offerings.current,
    packageCount: offerings.current?.availablePackages.length ?? 0,
    offeringIdentifiers: allOfferings.map((offering) => offering.identifier),
  };
}

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

const ProPurchaseModal = (props: {
  proPurchaseModalOpen: boolean;
  setProPurchaseModalOpen: (open: boolean) => void;
  purchasePackage: PurchasesPackage | null;
  offeringsStatus: OfferingsStatus;
  setProAccess: (access: boolean) => void;
}) => {
  return (
    <Dialog
      open={props.proPurchaseModalOpen}
      onOpenChange={props.setProPurchaseModalOpen}
    >
      <DialogContent onOpenChange={props.setProPurchaseModalOpen}>
        <DialogHeader>
          <DialogTitle>{t("scan.purchaseProTitle")}</DialogTitle>
        </DialogHeader>
        <div>
          {getPurchaseBody(props.offeringsStatus, props.purchasePackage)}
        </div>
        <div className="pb-2">{t("scan.purchaseProP2")}</div>
        <Button
          label={getPurchaseActionLabel(props.offeringsStatus)}
          disabled={!props.purchasePackage}
          onClick={() => {
            if (props.purchasePackage) {
              Purchases.purchasePackage({ aPackage: props.purchasePackage })
                .then((purchase) => {
                  logger.log("purchase success", purchase);
                  props.setProAccess(true);
                  usePreferencesStore.getState().setLaunchOnScan(true);
                  props.setProPurchaseModalOpen(false);
                })
                .catch((e: Error) => {
                  // Wrap RevenueCat errors to get typed errors
                  const wrappedError = wrapPurchaseError(e);

                  // User canceling the purchase is not an error
                  if (wrappedError instanceof PurchaseCancelledError) {
                    return;
                  }
                  logger.error("purchase error", wrappedError, {
                    category: "purchase",
                    action: "purchasePackage",
                    severity: "warning",
                  });
                });
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useProPurchase = () => {
  // Subscribe directly to the store for reactive updates
  const proAccess = usePreferencesStore((state) => state.launcherAccess);
  const setProAccess = usePreferencesStore((state) => state.setLauncherAccess);
  const proPurchaseModalOpen = useStatusStore(
    (state) => state.proPurchaseModalOpen,
  );
  const setProPurchaseModalOpen = useStatusStore(
    (state) => state.setProPurchaseModalOpen,
  );
  const [launcherPackage, setLauncherPackage] =
    useState<PurchasesPackage | null>(null);
  const [offeringsStatus, setOfferingsStatus] = useState<OfferingsStatus>(() =>
    Capacitor.getPlatform() === "web" ? "unsupported" : "loading",
  );

  useEffect(() => {
    if (Capacitor.getPlatform() === "web") {
      logger.log("web platform, skipping purchases");
      return;
    }

    // Fetch offerings for purchase flow UI
    Purchases.getOfferings()
      .then((offerings) => {
        const purchasePackage = offerings.current?.availablePackages[0] ?? null;

        if (purchasePackage) {
          setLauncherPackage(purchasePackage);
          setOfferingsStatus("available");
          return;
        }

        setLauncherPackage(null);
        setOfferingsStatus("missing");
        logger.warn(
          "RevenueCat offerings returned no packages",
          getOfferingDiagnostics(offerings),
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
        if (info.customerInfo.entitlements?.active?.tapto_launcher) {
          setProAccess(true);
        } else {
          setProAccess(false);
        }
      })
      .catch((e) => {
        logger.error("customer info error", e, {
          category: "purchase",
          action: "getCustomerInfo",
          severity: "warning",
        });
      });
  }, [setProAccess]);

  return {
    proAccess,
    PurchaseModal: () => (
      <ProPurchaseModal
        proPurchaseModalOpen={proPurchaseModalOpen}
        setProPurchaseModalOpen={setProPurchaseModalOpen}
        purchasePackage={launcherPackage}
        offeringsStatus={offeringsStatus}
        setProAccess={setProAccess}
      />
    ),
    proPurchaseModalOpen,
    setProPurchaseModalOpen,
  };
};
