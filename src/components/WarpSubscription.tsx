import { useEffect, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import {
  canSubscribeToWarp,
  getPaidWarpSubscription,
  getWarpTrialView,
  isPaidWarpActive,
} from "@/lib/warpSubscription";
import { Button } from "@/components/wui/Button";
import { Card } from "@/components/wui/Card";
import { RadioGroup } from "@/components/wui/RadioGroup";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
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
import { formatAppDate } from "@/lib/formatDate";

interface WarpSubscriptionProps {
  appUserID: string;
}

interface WarpPanelProps {
  loading: boolean;
  /** Status copy beneath the heading once loaded. */
  summary: ReactNode;
  /** Notices, actions and dialogs once loaded. */
  children: ReactNode;
}

/** The Warp settings panel shell shared by the live and preview states. */
function WarpPanel({ loading, summary, children }: WarpPanelProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <section
        className="flex w-full flex-col gap-4"
        aria-labelledby="warp-title"
      >
        <div className="flex flex-col gap-1">
          <h2 id="warp-title" className="text-foreground text-lg font-semibold">
            {t("online.warp.title")}
          </h2>
          {loading ? (
            <div
              className="flex flex-col gap-1 py-0.5"
              role="status"
              aria-label={t("online.warp.loading")}
            >
              <Skeleton className="h-5 w-24" aria-hidden="true" />
              <Skeleton className="h-4 w-64 max-w-full" aria-hidden="true" />
            </div>
          ) : (
            summary
          )}
        </div>

        {loading && (
          <>
            <Skeleton className="h-12 w-full rounded-md" aria-hidden="true" />
            <Button
              label={t("online.warp.restore")}
              variant="text"
              disabled
              disabledAppearance="busy"
              className="w-full"
            />
          </>
        )}

        {children}
      </section>
    </Card>
  );
}

function WarpActiveSummary({
  title,
  lines,
}: {
  title: string;
  lines: (string | null | false | undefined)[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-foreground font-medium">{title}</p>
      {lines.map(
        (line) =>
          line && (
            <p key={line} className="text-muted-foreground text-sm">
              {line}
            </p>
          ),
      )}
    </div>
  );
}

function WarpStatusText({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
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
  lifetimeProOwned: boolean;
  trialActive?: boolean;
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
  lifetimeProOwned,
  trialActive = false,
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
              <LoadingSpinner size={20} decorative />
            ) : undefined
          }
          onClick={onPurchase}
          disabled={action !== null || !purchaseEnabled}
          disabledAppearance={action !== null ? "busy" : "unavailable"}
          intent="pro"
          className="w-full"
        />
      }
    >
      <div className="flex flex-col gap-4 py-2">
        <p className="text-muted-foreground text-sm">
          {t("online.warp.purchaseDescription")}
        </p>
        {trialActive && (
          <p className="text-muted-foreground text-sm">
            {t("online.warp.trialImmediateBilling")}
          </p>
        )}

        <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
          <li>{t("online.warp.benefitBackup")}</li>
          <li>
            {lifetimeProOwned
              ? t("online.warp.proOwned")
              : t("online.warp.benefitPro")}
          </li>
          <li>{t("online.warp.benefitDevelopment")}</li>
        </ul>

        <RadioGroup
          label={t("online.warp.choosePlan")}
          layout="inline"
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
            <p className="text-foreground text-xl font-semibold">
              {priceString}
            </p>
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
            className="focus-visible:ring-ring rounded-sm underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {t("online.termsOfService")}
          </a>{" "}
          {t("online.and")}{" "}
          <a
            href="https://zaparoo.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="focus-visible:ring-ring rounded-sm underline focus-visible:ring-2 focus-visible:outline-none"
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
  const previewDate = formatAppDate("2030-01-01T00:00:00Z");

  return (
    <WarpPanel
      loading={state === "loading"}
      summary={
        state === "warp" ? (
          <WarpActiveSummary
            title={t("online.warp.planSummary", {
              plan: t("online.warp.annual"),
            })}
            lines={[
              t("online.warp.renewsThrough", {
                date: previewDate,
                provider: t("online.warp.providerPlayStore"),
              }),
              t("online.warp.proIncluded"),
            ]}
          />
        ) : (
          <WarpStatusText>
            {state === "error"
              ? t("online.warp.statusUnavailable")
              : t("online.warp.description")}
          </WarpStatusText>
        )
      }
    >
      {(state === "free" || state === "pro") && (
        <Button
          label={t("online.warp.get")}
          onClick={previewAction}
          intent="pro"
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
        lifetimeProOwned={false}
      />
    </WarpPanel>
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
    purchasesNotAllowed,
    revenueCatWarpActive,
    action,
    activationPending,
    purchase,
    restore,
    manage,
    retry,
  } = useWarpSubscription(appUserID);

  const isPremium = subscription?.is_premium === true;
  const revenueCatSubscription = getPaidWarpSubscription(subscription);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const trial = getWarpTrialView(subscription, now);
  const subscriptionDate = formatAppDate(revenueCatSubscription?.expires_at);
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
    purchasesNotAllowed ||
    !canSubscribeToWarp(subscription) ||
    revenueCatWarpActive ||
    activationPending;

  const handlePurchase = async () => {
    const result = await purchase();
    switch (result) {
      case "active":
        setPurchaseDialogOpen(false);
        toast.success(t("online.warp.purchaseSuccess"));
        break;
      case "pending":
        setPurchaseDialogOpen(false);
        toast(t("online.warp.paymentPending"));
        break;
      case "activation_pending":
        setPurchaseDialogOpen(false);
        toast(t("online.warp.activationPending"));
        break;
      case "identity_error":
        toast.error(t("online.warp.accountMismatch"));
        break;
      case "failed":
        toast.error(t("online.warp.purchaseFailed"));
        break;
      case "busy":
        // The account can no longer start checkout, so the offer on screen is
        // stale: leave it and show the current subscription state instead.
        setPurchaseDialogOpen(false);
        void retry();
        break;
      // For requirements, the modal has taken over and completing it reloads.
      case "cancelled":
      case "requirements":
        setPurchaseDialogOpen(false);
        break;
    }
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

  const showRetry = (loadFailed || packagesUnavailable) && !isPremium;
  // Both actions reload the account, so only one of them is offered.
  const showRefresh =
    !showRetry && (activationPending || (!isPremium && revenueCatWarpActive));

  return (
    <WarpPanel
      loading={isLoading}
      summary={
        isPremium ? (
          <WarpActiveSummary
            title={
              trial?.status === "active"
                ? t("online.warp.trialActive")
                : planLabel
                  ? t("online.warp.planSummary", { plan: planLabel })
                  : t("online.warp.active")
            }
            lines={[
              trial?.status === "active" &&
                trial.expiresAt &&
                t("online.warp.trialEnds", {
                  date: formatAppDate(trial.expiresAt),
                }),
              renewalSummary,
              lifetimeProAccess !== null &&
                t(
                  lifetimeProAccess
                    ? "online.warp.proOwned"
                    : "online.warp.proIncluded",
                ),
            ]}
          />
        ) : (
          <WarpStatusText>
            {trial?.status === "pending"
              ? t("online.warp.trialPending")
              : trial?.status === "expired"
                ? t("online.warp.trialExpired")
                : activationPending || revenueCatWarpActive
                  ? t("online.warp.activationPending")
                  : loadFailed
                    ? t("online.warp.statusUnavailable")
                    : t("online.warp.description")}
          </WarpStatusText>
        )
      }
    >
      {trial?.notice && (
        <p className="text-muted-foreground text-sm">
          {t(
            trial.notice === "last-day"
              ? "online.warp.trialLastDay"
              : "online.warp.trialEnding",
          )}
        </p>
      )}
      {!checkoutSuppressed && packages && (
        <Button
          label={t("online.warp.get")}
          onClick={() => {
            if (action === null) setPurchaseDialogOpen(true);
          }}
          disabled={action !== null}
          disabledAppearance="busy"
          intent="pro"
          className="w-full"
        />
      )}

      {showRetry && (
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
            disabledAppearance="busy"
            className="w-full"
          />
        </div>
      )}

      {purchasesNotAllowed && !isPremium && (
        <p className="text-muted-foreground text-sm" role="status">
          {t("online.warp.purchasesNotAllowed")}
        </p>
      )}

      {showRefresh && (
        <Button
          label={
            action === "refresh"
              ? t("online.warp.refreshing")
              : t("online.warp.refresh")
          }
          variant="outline"
          onClick={retry}
          disabled={action !== null}
          disabledAppearance="busy"
          className="w-full"
        />
      )}

      {isPaidWarpActive(subscription) && (
        <Button
          label={
            action === "manage"
              ? t("online.warp.openingManagement")
              : t("online.warp.manage")
          }
          variant="outline"
          onClick={handleManage}
          disabled={action !== null}
          disabledAppearance="busy"
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
          disabledAppearance="busy"
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
        lifetimeProOwned={lifetimeProAccess === true}
        trialActive={trial?.status === "active"}
      />
    </WarpPanel>
  );
}
