import { t } from "i18next";
import { Purchases, PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { logger } from "../lib/logger";
import { usePreferencesStore } from "../lib/preferencesStore";
import { useStatusStore } from "../lib/store";
import { Button } from "./wui/Button";

export const RestorePuchasesButton = () => {
  const setLauncherAccess = usePreferencesStore.getState().setLauncherAccess;

  return (
    <Button
      label={t("settings.app.restorePurchases")}
      className="w-full"
      onClick={() => {
        Purchases.restorePurchases()
          .then(() => {
            Purchases.getCustomerInfo()
              .then((info) => {
                if (info.customerInfo.entitlements.active.tapto_launcher) {
                  setLauncherAccess(true);
                } else {
                  setLauncherAccess(false);
                }
                location.reload();
              })
              .catch((e) => {
                logger.error("customer info error", e, { category: "purchase", action: "getCustomerInfo", severity: "warning" });
              });
            toast.success((to) => (
              <span
                className="flex grow flex-col"
                onClick={() => toast.dismiss(to.id)}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") && toast.dismiss(to.id)
                }
                role="button"
                tabIndex={0}
              >
                {t("settings.app.restoreSuccess")}
              </span>
            ));
          })
          .catch((e) => {
            logger.error("restore purchases error", e, { category: "purchase", action: "restore", severity: "warning" });
            toast.error((to) => (
              <span
                className="flex grow flex-col"
                onClick={() => toast.dismiss(to.id)}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") && toast.dismiss(to.id)
                }
                role="button"
                tabIndex={0}
              >
                {t("settings.app.restoreFail")}
              </span>
            ));
          });
      }}
    />
  );
};

const ProPurchaseModal = (props: {
  proPurchaseModalOpen: boolean;
  setProPurchaseModalOpen: (open: boolean) => void;
  purchasePackage: PurchasesPackage | null;
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
          {t("scan.purchaseProP1", {
            price: props.purchasePackage
              ? props.purchasePackage.product.priceString
              : "$6.99 USD"
          })}
        </div>
        <div className="pb-2">{t("scan.purchaseProP2")}</div>
        <Button
          label={t("scan.purchaseProAction")}
          disabled={!props.purchasePackage}
          onClick={() => {
            if (props.purchasePackage) {
              Purchases.purchasePackage({ aPackage: props.purchasePackage })
                .then((purchase) => {
                  logger.log("purchase success", purchase);
                  props.setProAccess(true);
                  usePreferencesStore.getState().setLauncherAccess(true);
                  usePreferencesStore.getState().setLaunchOnScan(true);
                  props.setProPurchaseModalOpen(false);
                })
                .catch((e: Error) => {
                  if (e.message.includes("Purchase was cancelled")) {
                    return;
                  }
                  logger.error("purchase error", e, { category: "purchase", action: "purchasePackage", severity: "warning" });
                });
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useProPurchase = (initialProAccess: boolean = false) => {
  const [proAccess, setProAccess] = useState(initialProAccess);
  const proPurchaseModalOpen = useStatusStore((state) => state.proPurchaseModalOpen);
  const setProPurchaseModalOpen = useStatusStore((state) => state.setProPurchaseModalOpen);
  const [launcherPackage, setLauncherPackage] =
    useState<PurchasesPackage | null>(null);

  useEffect(() => {
    if (Capacitor.getPlatform() === "web") {
      logger.log("web platform, skipping purchases");
      return;
    }

    // Fetch offerings for purchase flow UI
    Purchases.getOfferings()
      .then((offerings) => {
        if (
          offerings.current &&
          offerings.current.availablePackages.length > 0
        ) {
          setLauncherPackage(offerings.current.availablePackages[0]);
        } else {
          logger.error("no launcher purchase package found");
        }
      })
      .catch((e) => {
        logger.error("offerings error", e, { category: "purchase", action: "getOfferings", severity: "warning" });
        toast.error(t("settings.app.offeringsError"));
      });

    // Skip customer info check if already hydrated in App.tsx
    const proAccessHydrated = usePreferencesStore.getState()._proAccessHydrated;
    if (proAccessHydrated) {
      // Use cached value from preferences store
      const cachedLauncherAccess =
        usePreferencesStore.getState().launcherAccess;
      setProAccess(cachedLauncherAccess);
      return;
    }

    // Fallback if not hydrated yet (shouldn't happen normally)
    Purchases.getCustomerInfo()
      .then((info) => {
        if (info.customerInfo.entitlements.active.tapto_launcher) {
          setProAccess(true);
          usePreferencesStore.getState().setLauncherAccess(true);
        } else {
          setProAccess(false);
          usePreferencesStore.getState().setLauncherAccess(false);
        }
      })
      .catch((e) => {
        logger.error("customer info error", e, { category: "purchase", action: "getCustomerInfo", severity: "warning" });
      });
  }, [setProAccess]);

  return {
    proAccess,
    PurchaseModal: () => (
      <ProPurchaseModal
        proPurchaseModalOpen={proPurchaseModalOpen}
        setProPurchaseModalOpen={setProPurchaseModalOpen}
        purchasePackage={launcherPackage}
        setProAccess={setProAccess}
      />
    ),
    proPurchaseModalOpen,
    setProPurchaseModalOpen
  };
};
