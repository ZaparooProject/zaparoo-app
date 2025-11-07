import { Preferences } from "@capacitor/preferences";
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
import { Button } from "./wui/Button";

export const RestorePuchasesButton = () => {
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
                  Preferences.set({
                    key: "launcherAccess",
                    value: "true"
                  });
                } else {
                  Preferences.set({
                    key: "launcherAccess",
                    value: "false"
                  });
                }
                location.reload();
              })
              .catch((e) => {
                console.error("customer info error", e);
              });
            toast.success((to) => (
              <span
                className="flex grow flex-col"
                onClick={() => toast.dismiss(to.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toast.dismiss(to.id)}
                role="button"
                tabIndex={0}
              >
                {t("settings.app.restoreSuccess")}
              </span>
            ));
          })
          .catch(() => {
            toast.error((to) => (
              <span
                className="flex grow flex-col"
                onClick={() => toast.dismiss(to.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toast.dismiss(to.id)}
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
                  console.log("purchase success", purchase);
                  props.setProAccess(true);
                  Preferences.set({
                    key: "launcherAccess",
                    value: "true"
                  });
                  Preferences.set({
                    key: "launchOnScan",
                    value: "true"
                  });
                  props.setProPurchaseModalOpen(false);
                })
                .catch((e: Error) => {
                  if (e.message.includes("Purchase was cancelled")) {
                    return;
                  }
                  console.error("purchase error", e);
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
  const [proPurchaseModalOpen, setProPurchaseModalOpen] = useState(false);
  const [launcherPackage, setLauncherPackage] =
    useState<PurchasesPackage | null>(null);

  useEffect(() => {
    if (Capacitor.getPlatform() === "web") {
      console.log("web platform, skipping purchases");
      return;
    }

    Purchases.getOfferings()
      .then((offerings) => {
        if (
          offerings.current &&
          offerings.current.availablePackages.length > 0
        ) {
          setLauncherPackage(offerings.current.availablePackages[0]);
        } else {
          console.error("no launcher purchase package found");
        }
      })
      .catch((e) => {
        console.error("offerings error", e);
      });

    Purchases.getCustomerInfo()
      .then((info) => {
        if (info.customerInfo.entitlements.active.tapto_launcher) {
          setProAccess(true);
          Preferences.set({
            key: "launcherAccess",
            value: "true"
          });
        } else {
          setProAccess(false);
          Preferences.set({
            key: "launcherAccess",
            value: "false"
          });
        }
      })
      .catch((e) => {
        console.error("customer info error", e);
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
