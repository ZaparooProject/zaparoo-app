import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/wui/Button";
import { Segmented } from "@/components/wui/Segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { SlideModal } from "@/components/SlideModal";
import {
  useWarpSubscription,
  type WarpAction,
  type WarpPlan,
} from "@/hooks/useWarpSubscription";
import {
  getPurchasePreviewState,
  usePurchasePreviewStore,
  type PurchasePreviewState,
} from "@/lib/purchasePreviewStore";
import { usePreferencesStore } from "@/lib/preferencesStore";

interface WarpSubscriptionProps {
  appUserID: string;
}

function formatSubscriptionDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function WarpSubscription(props: WarpSubscriptionProps) {
  const configuredPurchasePreview = usePurchasePreviewStore(
    (state) => state.state,
  );
  const purchasePreview = getPurchasePreviewState(configuredPurchasePreview);

  return purchasePreview === "live" ? (
    <LiveWarpSubscription {...props} />
  ) : (
    <WarpSubscriptionPreview state={purchasePreview} />
  );
}

interface WarpPurchaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPlan: WarpPlan;
  setSelectedPlan: (plan: WarpPlan) => void;
  priceString: string | null;
  action: WarpAction;
  onPurchase: () => void;
  purchaseEnabled: boolean;
}

function WarpPurchaseModal({
  open,
  onOpenChange,
  selectedPlan,
  setSelectedPlan,
  priceString,
  action,
  onPurchase,
  purchaseEnabled,
}: WarpPurchaseModalProps) {
  const { t } = useTranslation();

  return (
    <SlideModal
      isOpen={open}
      close={() => onOpenChange(false)}
      dismissible={action !== "purchase"}
      title={t("online.warp.purchaseTitle")}
      footer={
        <Button
          label={
            action === "purchase"
              ? t("online.warp.purchasing")
              : t("online.warp.subscribe")
          }
          icon={
            action === "purchase" ? (
              <Loader2 size={20} className="animate-spin" />
            ) : undefined
          }
          onClick={onPurchase}
          disabled={action !== null || !purchaseEnabled}
          intent="primary"
          className="w-full"
        />
      }
    >
      <div className="flex flex-col gap-4 py-2">
        <p className="text-muted-foreground text-sm">
          {t("online.warp.purchaseDescription")}
        </p>

        <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
          <li>{t("online.warp.benefitBackup")}</li>
          <li>{t("online.warp.benefitPro")}</li>
          <li>{t("online.warp.benefitDevelopment")}</li>
        </ul>

        <Segmented
          label={t("online.warp.choosePlan")}
          options={[
            { value: "annual", label: t("online.warp.annual") },
            { value: "monthly", label: t("online.warp.monthly") },
          ]}
          value={selectedPlan}
          onChange={setSelectedPlan}
          disabled={action !== null}
        />

        {priceString && (
          <div className="flex flex-col gap-1 text-center">
            <p className="text-xl font-semibold text-white">{priceString}</p>
            <p className="text-muted-foreground text-sm">
              {selectedPlan === "annual"
                ? t("online.warp.billedAnnually")
                : t("online.warp.billedMonthly")}
            </p>
          </div>
        )}

        <p className="text-muted-foreground text-sm">
          {t("online.warp.autoRenewDisclosure")}
        </p>
        <p className="text-muted-foreground text-center text-xs">
          {t("online.warp.agreementPrefix")}{" "}
          <a
            href="https://zaparoo.com/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm underline focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
          >
            {t("online.termsOfService")}
          </a>{" "}
          {t("online.and")}{" "}
          <a
            href="https://zaparoo.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm underline focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
          >
            {t("online.privacyPolicy")}
          </a>
          .
        </p>
      </div>
    </SlideModal>
  );
}

function WarpSubscriptionPreview({
  state,
}: {
  state: Exclude<PurchasePreviewState, "live">;
}) {
  const { t } = useTranslation();
  const [selectedPlan, setSelectedPlan] = useState<WarpPlan>("annual");
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(true);
  const previewAction = () => undefined;
  const previewDate = formatSubscriptionDate("2030-01-01T00:00:00Z");

  return (
    <section
      className="flex w-full flex-col gap-3"
      aria-labelledby="warp-title"
    >
      <div className="flex flex-col gap-1">
        <h2 id="warp-title" className="text-lg font-medium text-white">
          {t("online.warp.title")}
        </h2>
        {state === "loading" ? (
          <div
            className="flex flex-col gap-1 py-0.5"
            role="status"
            aria-label={t("online.warp.loading")}
          >
            <Skeleton className="h-5 w-24" aria-hidden="true" />
            <Skeleton className="h-4 w-64 max-w-full" aria-hidden="true" />
          </div>
        ) : state === "warp" ? (
          <div className="flex flex-col gap-1">
            <p className="font-medium text-white">
              {t("online.warp.planSummary", {
                plan: t("online.warp.annual"),
              })}
            </p>
            <p className="text-muted-foreground text-sm">
              {t("online.warp.renewsThrough", {
                date: previewDate,
                provider: t("online.warp.providerPlayStore"),
              })}
            </p>
            <p className="text-muted-foreground text-sm">
              {t("online.warp.proIncluded")}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {state === "error"
              ? t("online.warp.statusUnavailable")
              : t("online.warp.description")}
          </p>
        )}
      </div>

      {state === "loading" && (
        <>
          <Skeleton className="h-10 w-full rounded-[20px]" aria-hidden="true" />
          <Button
            label={t("online.warp.restore")}
            variant="text"
            disabled
            className="w-full"
          />
        </>
      )}

      {(state === "free" || state === "pro") && (
        <Button
          label={t("online.warp.get")}
          onClick={previewAction}
          intent="primary"
          className="w-full"
        />
      )}

      {state === "error" && (
        <Button
          label={t("online.warp.retry")}
          variant="outline"
          onClick={previewAction}
          className="w-full"
        />
      )}

      {state === "warp" && (
        <Button
          label={t("online.warp.manage")}
          variant="outline"
          onClick={previewAction}
          className="w-full"
        />
      )}

      {state !== "loading" && state !== "checkout" && (
        <Button
          label={t("online.warp.restore")}
          variant="text"
          onClick={previewAction}
          className="w-full"
        />
      )}

      <WarpPurchaseModal
        open={state === "checkout" && purchaseDialogOpen}
        onOpenChange={setPurchaseDialogOpen}
        selectedPlan={selectedPlan}
        setSelectedPlan={setSelectedPlan}
        priceString={selectedPlan === "annual" ? "$29.99" : "$3.99"}
        action={null}
        onPurchase={previewAction}
        purchaseEnabled
      />
    </section>
  );
}

function LiveWarpSubscription({ appUserID }: WarpSubscriptionProps) {
  const { t } = useTranslation();
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const lifetimeProAccess = usePreferencesStore((state) =>
    state._hasHydrated ? state.lifetimeProAccess === true : null,
  );
  const {
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
  } = useWarpSubscription(appUserID);

  const isPremium = subscription?.is_premium === true;
  const revenueCatSubscription = subscription?.revenuecat;
  const subscriptionDate = formatSubscriptionDate(
    revenueCatSubscription?.expires_at,
  );
  const selectedPackage = packages?.[selectedPlan] ?? null;
  const providerLabel =
    revenueCatSubscription?.store === "APP_STORE"
      ? t("online.warp.providerAppStore")
      : revenueCatSubscription?.store === "PLAY_STORE"
        ? t("online.warp.providerPlayStore")
        : revenueCatSubscription?.store === "PADDLE"
          ? t("online.warp.providerPaddle")
          : null;
  const planLabel =
    revenueCatSubscription?.billing_period === "annual"
      ? t("online.warp.annual")
      : revenueCatSubscription?.billing_period === "monthly"
        ? t("online.warp.monthly")
        : null;
  const renewalSummary = subscriptionDate
    ? revenueCatSubscription?.will_renew
      ? providerLabel
        ? t("online.warp.renewsThrough", {
            date: subscriptionDate,
            provider: providerLabel,
          })
        : t("online.warp.renewsOn", { date: subscriptionDate })
      : providerLabel
        ? t("online.warp.expiresThrough", {
            date: subscriptionDate,
            provider: providerLabel,
          })
        : t("online.warp.expiresOn", { date: subscriptionDate })
    : providerLabel
      ? t("online.warp.billedThrough", { provider: providerLabel })
      : null;
  const checkoutSuppressed =
    isLoading ||
    loadFailed ||
    packagesUnavailable ||
    isPremium ||
    revenueCatWarpActive ||
    activationPending;

  const handlePurchase = async () => {
    const result = await purchase();
    if (result === "cancelled") {
      setPurchaseDialogOpen(false);
      return;
    }
    if (result === "active") {
      setPurchaseDialogOpen(false);
      toast.success(t("online.warp.purchaseSuccess"));
    }
    if (result === "pending") {
      setPurchaseDialogOpen(false);
      toast(t("online.warp.paymentPending"));
    }
    if (result === "activation_pending") {
      setPurchaseDialogOpen(false);
      toast(t("online.warp.activationPending"));
    }
    if (result === "identity_error") {
      toast.error(t("online.warp.accountMismatch"));
    }
    if (result === "failed") toast.error(t("online.warp.purchaseFailed"));
  };

  const handleRestore = async () => {
    const result = await restore();
    if (result === "active") toast.success(t("online.warp.restoreSuccess"));
    if (result === "pro_restored") {
      toast.success(t("online.warp.restoreProSuccess"));
    }
    if (result === "activation_pending") {
      toast(t("online.warp.activationPending"));
    }
    if (result === "not_found") toast.error(t("online.warp.restoreNotFound"));
    if (result === "failed") toast.error(t("online.warp.restoreFailed"));
  };

  const handleManage = async () => {
    const result = await manage();
    if (result === "unavailable") {
      toast.error(t("online.warp.manageUnavailable"));
    }
    if (result === "failed") toast.error(t("online.warp.manageFailed"));
  };

  return (
    <section
      className="flex w-full flex-col gap-3"
      aria-labelledby="warp-title"
    >
      <div className="flex flex-col gap-1">
        <h2 id="warp-title" className="text-lg font-medium text-white">
          {t("online.warp.title")}
        </h2>
        {isLoading ? (
          <div
            className="flex flex-col gap-1 py-0.5"
            role="status"
            aria-label={t("online.warp.loading")}
          >
            <Skeleton className="h-5 w-24" aria-hidden="true" />
            <Skeleton className="h-4 w-64 max-w-full" aria-hidden="true" />
          </div>
        ) : isPremium ? (
          <div className="flex flex-col gap-1">
            <p className="font-medium text-white">
              {planLabel
                ? t("online.warp.planSummary", { plan: planLabel })
                : t("online.warp.active")}
            </p>
            {renewalSummary && (
              <p className="text-muted-foreground text-sm">{renewalSummary}</p>
            )}
            {lifetimeProAccess !== null && (
              <p className="text-muted-foreground text-sm">
                {t(
                  lifetimeProAccess
                    ? "online.warp.proOwned"
                    : "online.warp.proIncluded",
                )}
              </p>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {activationPending || revenueCatWarpActive
              ? t("online.warp.activationPending")
              : loadFailed
                ? t("online.warp.statusUnavailable")
                : t("online.warp.description")}
          </p>
        )}
      </div>

      {isLoading && (
        <>
          <Skeleton className="h-10 w-full rounded-[20px]" aria-hidden="true" />
          <Button
            label={t("online.warp.restore")}
            variant="text"
            disabled
            className="w-full"
          />
        </>
      )}

      {!checkoutSuppressed && packages && (
        <Button
          label={t("online.warp.get")}
          onClick={() => {
            if (action === null) setPurchaseDialogOpen(true);
          }}
          disabled={action !== null}
          intent="primary"
          className="w-full"
        />
      )}

      {(loadFailed || packagesUnavailable) && !isPremium && (
        <div className="flex flex-col gap-2">
          {packagesUnavailable && (
            <p className="text-muted-foreground text-sm" role="status">
              {t("online.warp.unavailable")}
            </p>
          )}
          <Button
            label={
              action === "refresh"
                ? t("online.warp.refreshing")
                : t("online.warp.retry")
            }
            variant="outline"
            onClick={retry}
            disabled={action !== null}
            className="w-full"
          />
        </div>
      )}

      {(activationPending || (!isPremium && revenueCatWarpActive)) && (
        <Button
          label={
            action === "refresh"
              ? t("online.warp.refreshing")
              : t("online.warp.refresh")
          }
          variant="outline"
          onClick={retry}
          disabled={action !== null}
          className="w-full"
        />
      )}

      {isPremium && revenueCatSubscription?.active && (
        <Button
          label={
            action === "manage"
              ? t("online.warp.openingManagement")
              : t("online.warp.manage")
          }
          variant="outline"
          onClick={handleManage}
          disabled={action !== null}
          className="w-full"
        />
      )}

      {!isLoading && (
        <Button
          label={
            action === "restore"
              ? t("online.warp.restoring")
              : t("online.warp.restore")
          }
          variant="text"
          onClick={handleRestore}
          disabled={action !== null}
          className="w-full"
        />
      )}

      <WarpPurchaseModal
        open={purchaseDialogOpen && Boolean(packages)}
        onOpenChange={(open) => {
          if (action !== "purchase") setPurchaseDialogOpen(open);
        }}
        selectedPlan={selectedPlan}
        setSelectedPlan={setSelectedPlan}
        priceString={selectedPackage?.product.priceString ?? null}
        action={action}
        onPurchase={handlePurchase}
        purchaseEnabled={Boolean(selectedPackage)}
      />
    </section>
  );
}
