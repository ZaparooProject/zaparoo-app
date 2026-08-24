import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { Capacitor } from "@capacitor/core";
import { PurchaseSupportActions } from "@/components/ProPurchase";
import { CoreAPI } from "@/lib/coreApi";
import { ToggleSwitch } from "@/components/wui/ToggleSwitch";
import { SettingHelp } from "@/components/wui/SettingHelp";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { PageFrame } from "@/components/PageFrame";
import { UpdateSettingsRequest } from "@/lib/models.ts";
import { BackIcon, NextIcon } from "@/lib/images";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { useClientCapability } from "@/hooks/useClientCapability";
import { SlideModal } from "@/components/SlideModal";
import { appBackNavigationOptions } from "@/lib/tabSessionStore";
import { Button } from "@/components/wui/Button";
import { ClientCapability } from "@/lib/models";
import { isNativePluginAvailable } from "@/lib/capacitorBridge";
import {
  isPurchasePreviewEnabled,
  usePurchasePreviewStore,
  type PurchasePreviewState,
} from "@/lib/purchasePreviewStore";

export const Route = createFileRoute("/settings/advanced")({
  component: AdvancedSettings,
});

export function AdvancedSettings() {
  const { t } = useTranslation();
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("settings.advanced.title"),
  );
  const connected = useStatusStore((state) => state.connected);
  const connectionState = useStatusStore((state) => state.connectionState);
  const canWriteCoreSettings = useClientCapability(
    ClientCapability.SettingsWrite,
  );
  const showFilenames = usePreferencesStore((s) => s.showFilenames);
  const setShowFilenames = usePreferencesStore((s) => s.setShowFilenames);
  const appBadgeEnabled = usePreferencesStore((s) => s.appBadgeEnabled);
  const setAppBadgeEnabled = usePreferencesStore((s) => s.setAppBadgeEnabled);
  const purchasePreviewState = usePurchasePreviewStore((state) => state.state);
  const setPurchasePreviewState = usePurchasePreviewStore(
    (state) => state.setPreviewState,
  );

  const [showErrorReportingModal, setShowErrorReportingModal] = useState(false);

  // Determine if we're in a loading state (connecting or fetching data)
  const isConnecting =
    connectionState === ConnectionState.CONNECTING ||
    connectionState === ConnectionState.RECONNECTING;

  const { data, refetch, isPending } = useQuery({
    queryKey: ["settings"],
    queryFn: () => CoreAPI.settings(),
  });

  const update = useMutation({
    mutationFn: (params: UpdateSettingsRequest) =>
      CoreAPI.settingsUpdate(params),
    onSuccess: () => refetch(),
  });

  const handleErrorReportingToggle = (value: boolean) => {
    if (!canWriteCoreSettings) return;
    if (value) {
      setShowErrorReportingModal(true);
    } else {
      update.mutate({ errorReporting: false });
    }
  };

  const confirmEnableErrorReporting = () => {
    if (!canWriteCoreSettings) return;
    update.mutate({ errorReporting: true });
    setShowErrorReportingModal(false);
  };

  const router = useRouter();
  const goBack = () =>
    void router.navigate(appBackNavigationOptions("/settings"));

  // Show loading skeletons when connecting or when connected but data is loading
  const isLoading = isConnecting || (connected && isPending);

  return (
    <PageFrame
      onSwipeBack={goBack}
      headerLeft={
        <HeaderButton
          onClick={goBack}
          icon={<BackIcon size="24" />}
          aria-label={t("nav.back")}
        />
      }
      headerCenter={
        <h1 ref={headingRef} className="text-foreground text-xl">
          {t("settings.advanced.title")}
        </h1>
      }
    >
      <div className="flex flex-col gap-5">
        <ToggleSwitch
          label={
            <span className="flex items-center">
              {t("settings.advanced.errorReporting")}
              <SettingHelp
                title={t("settings.advanced.errorReporting")}
                description={t("settings.advanced.errorReportingHelp")}
              />
            </span>
          }
          value={data?.errorReporting ?? false}
          setValue={handleErrorReportingToggle}
          disabled={!canWriteCoreSettings}
          loading={isLoading}
        />

        <ToggleSwitch
          label={
            <span className="flex items-center">
              {t("settings.advanced.debugLogging")}
              <SettingHelp
                title={t("settings.advanced.debugLogging")}
                description={t("settings.advanced.debugLoggingHelp")}
              />
            </span>
          }
          value={data?.debugLogging ?? false}
          setValue={(v) => update.mutate({ debugLogging: v })}
          disabled={!canWriteCoreSettings}
          loading={isLoading}
        />

        <ToggleSwitch
          label={
            <span className="flex items-center">
              {t("settings.advanced.showFilenames")}
              <SettingHelp
                title={t("settings.advanced.showFilenames")}
                description={t("settings.advanced.showFilenamesHelp")}
              />
            </span>
          }
          value={showFilenames}
          setValue={setShowFilenames}
        />

        {Capacitor.getPlatform() === "ios" &&
          isNativePluginAvailable("Badge") && (
            <ToggleSwitch
              label={
                <span className="flex items-center">
                  {t("settings.advanced.appIconBadges")}
                  <SettingHelp
                    title={t("settings.advanced.appIconBadges")}
                    description={t("settings.advanced.appIconBadgesHelp")}
                  />
                </span>
              }
              value={appBadgeEnabled}
              setValue={setAppBadgeEnabled}
            />
          )}

        {isPurchasePreviewEnabled() && (
          <div className="flex flex-col">
            <label className="text-white" htmlFor="purchase-preview-state">
              {t("settings.advanced.purchasePreview")}
            </label>
            <select
              id="purchase-preview-state"
              className="border-bd-input bg-background text-foreground rounded-md border border-solid p-3"
              value={purchasePreviewState}
              onChange={(event) =>
                setPurchasePreviewState(
                  event.target.value as PurchasePreviewState,
                )
              }
            >
              <option value="live">
                {t("settings.advanced.purchasePreviewLive")}
              </option>
              <option value="free">
                {t("settings.advanced.purchasePreviewFree")}
              </option>
              <option value="checkout">
                {t("settings.advanced.purchasePreviewCheckout")}
              </option>
              <option value="pro">
                {t("settings.advanced.purchasePreviewPro")}
              </option>
              <option value="warp">
                {t("settings.advanced.purchasePreviewWarp")}
              </option>
              <option value="loading">
                {t("settings.advanced.purchasePreviewLoading")}
              </option>
              <option value="error">
                {t("settings.advanced.purchasePreviewError")}
              </option>
            </select>
          </div>
        )}

        {connected ? (
          <Link to="/settings/logs">
            <div className="flex flex-row items-center justify-between">
              <p>{t("settings.advanced.viewLogs")}</p>
              <NextIcon size="20" />
            </div>
          </Link>
        ) : (
          <div
            className={classNames(
              "flex flex-row items-center justify-between",
              "text-foreground-disabled",
            )}
          >
            <p>{t("settings.advanced.viewLogs")}</p>
            <NextIcon size="20" />
          </div>
        )}

        {Capacitor.isNativePlatform() && (
          <PurchaseSupportActions variant="diagnosticsOnly" />
        )}
      </div>

      <SlideModal
        isOpen={showErrorReportingModal}
        close={() => setShowErrorReportingModal(false)}
        title={t("settings.advanced.errorReportingConfirmTitle")}
        footer={
          <div className="flex flex-row justify-center gap-4">
            <Button
              label={t("nav.cancel")}
              variant="outline"
              onClick={() => setShowErrorReportingModal(false)}
            />
            <Button
              label={t("yes")}
              intent="primary"
              onClick={confirmEnableErrorReporting}
              disabled={!canWriteCoreSettings}
            />
          </div>
        }
      >
        <div className="p-4">
          <p className="text-center">
            {t("settings.advanced.errorReportingConfirmText")}
          </p>
        </div>
      </SlideModal>
    </PageFrame>
  );
}
