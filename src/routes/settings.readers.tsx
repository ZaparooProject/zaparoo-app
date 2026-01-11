import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import classNames from "classnames";
import { ToggleSwitch } from "@/components/wui/ToggleSwitch";
import { SettingHelp } from "@/components/wui/SettingHelp";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { PageFrame } from "@/components/PageFrame";
import {
  usePreferencesStore,
  selectAppSettings,
  selectShakeSettings,
} from "@/lib/preferencesStore";
import { BackIcon, CheckIcon } from "@/lib/images";
import { Skeleton } from "@/components/ui/skeleton";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { SystemSelector } from "@/components/SystemSelector";
import { Button } from "@/components/wui/Button";
import { useProPurchase } from "@/components/ProPurchase";
import { ProBadge } from "@/components/ProBadge";
import { ZapScriptInput } from "@/components/ZapScriptInput";
import { CoreAPI } from "@/lib/coreApi.ts";
import { UpdateSettingsRequest } from "@/lib/models.ts";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";

export const Route = createFileRoute("/settings/readers")({
  component: ReadersSettings,
});

function ReadersSettings() {
  const { t } = useTranslation();
  usePageHeadingFocus(t("settings.readers.title"));
  const connected = useStatusStore((state) => state.connected);
  const connectionState = useStatusStore((state) => state.connectionState);
  const [systemPickerOpen, setSystemPickerOpen] = useState(false);

  // Determine if we're in a loading state (connecting or reconnecting)
  const isConnecting =
    connectionState === ConnectionState.CONNECTING ||
    connectionState === ConnectionState.RECONNECTING;
  const nfcAvailable = usePreferencesStore((state) => state.nfcAvailable);
  const accelerometerAvailable = usePreferencesStore(
    (state) => state.accelerometerAvailable,
  );

  // Core settings query
  const {
    data: coreSettings,
    refetch,
    isPending,
  } = useQuery({
    queryKey: ["settings"],
    queryFn: () => CoreAPI.settings(),
  });

  const updateCoreSetting = useMutation({
    mutationFn: (params: UpdateSettingsRequest) =>
      CoreAPI.settingsUpdate(params),
    onSuccess: () => refetch(),
  });

  // Get app settings from store
  const {
    restartScan,
    launchOnScan,
    launcherAccess,
    preferRemoteWriter,
    setRestartScan,
    setLaunchOnScan,
    setPreferRemoteWriter,
  } = usePreferencesStore(useShallow(selectAppSettings));

  // Get shake settings from store
  const {
    shakeEnabled,
    shakeMode,
    shakeZapscript,
    setShakeEnabled,
    setShakeMode,
    setShakeZapscript,
  } = usePreferencesStore(useShallow(selectShakeSettings));

  // Extract system name from zapscript for display
  const getSystemFromZapscript = () => {
    if (
      shakeMode === "random" &&
      shakeZapscript.startsWith("**launch.random:")
    ) {
      return shakeZapscript.replace("**launch.random:", "");
    }
    return "";
  };

  const shakeSystem = getSystemFromZapscript();

  const { PurchaseModal, setProPurchaseModalOpen } = useProPurchase();

  const router = useRouter();
  const goBack = () => router.history.back();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false,
  });

  // Show loading skeletons when connecting or when connected but data is loading
  const isLoading = isConnecting || (connected && isPending);

  return (
    <PageFrame
      {...swipeHandlers}
      headerLeft={
        <HeaderButton
          onClick={goBack}
          icon={<BackIcon size="24" />}
          aria-label={t("nav.back")}
        />
      }
      headerCenter={
        <h1 className="text-foreground text-xl">
          {t("settings.readers.title")}
        </h1>
      }
    >
      <div className="flex flex-col gap-3">
        {/* Scan Mode - from Core */}
        <div className="py-2">
          <span className="flex items-center">
            <span id="scan-mode-label">{t("settings.readers.scanMode")}</span>
            <SettingHelp
              title={t("settings.readers.scanMode")}
              description={t("settings.readers.scanModeHelp")}
            />
          </span>
          {isLoading ? (
            <div className="mt-2 flex flex-row">
              <Skeleton className="h-9 w-full rounded-s-full" />
              <Skeleton className="h-9 w-full rounded-e-full" />
            </div>
          ) : (
            <div
              className="mt-2 flex flex-row"
              role="radiogroup"
              aria-labelledby="scan-mode-label"
            >
              <button
                type="button"
                role="radio"
                aria-checked={
                  coreSettings?.readersScanMode === "tap" && connected
                }
                className={classNames(
                  "flex",
                  "flex-row",
                  "w-full",
                  "rounded-s-full",
                  "items-center",
                  "justify-center",
                  "py-1",
                  "font-medium",
                  "gap-1",
                  "tracking-[0.1px]",
                  "h-9",
                  "border",
                  "border-solid",
                  "border-bd-filled",
                  {
                    "bg-button-pattern":
                      coreSettings?.readersScanMode === "tap" && connected,
                  },
                  {
                    "bg-background": !connected,
                    "border-foreground-disabled": !connected,
                    "text-foreground-disabled": !connected,
                  },
                )}
                onClick={() =>
                  updateCoreSetting.mutate({ readersScanMode: "tap" })
                }
                disabled={!connected}
              >
                {coreSettings?.readersScanMode === "tap" && connected && (
                  <span aria-hidden="true">
                    <CheckIcon size="28" />
                  </span>
                )}
                {t("settings.tapMode")}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={
                  coreSettings?.readersScanMode === "hold" && connected
                }
                className={classNames(
                  "flex",
                  "flex-row",
                  "w-full",
                  "rounded-e-full",
                  "items-center",
                  "justify-center",
                  "py-1",
                  "font-medium",
                  "gap-1",
                  "tracking-[0.1px]",
                  "h-9",
                  "border",
                  "border-solid",
                  "border-bd-filled",
                  {
                    "bg-button-pattern":
                      coreSettings?.readersScanMode === "hold" && connected,
                  },
                  {
                    "bg-background": !connected,
                    "border-foreground-disabled": !connected,
                    "text-foreground-disabled": !connected,
                  },
                )}
                onClick={() =>
                  updateCoreSetting.mutate({ readersScanMode: "hold" })
                }
                disabled={!connected}
              >
                {coreSettings?.readersScanMode === "hold" && connected && (
                  <span aria-hidden="true">
                    <CheckIcon size="28" />
                  </span>
                )}
                {t("settings.insertMode")}
              </button>
            </div>
          )}
        </div>

        {/* Continuous Scan - from App (always shown) */}
        <ToggleSwitch
          label={
            <span className="flex items-center">
              {t("settings.readers.continuousScan")}
              <SettingHelp
                title={t("settings.readers.continuousScan")}
                description={t("settings.readers.continuousScanHelp")}
              />
            </span>
          }
          value={restartScan}
          setValue={setRestartScan}
        />

        {/* Launch On Scan - from App (native only, Pro feature) */}
        {Capacitor.isNativePlatform() && connected && (
          <ToggleSwitch
            label={
              <span className="flex items-center">
                {t("settings.readers.launchOnScan")}
                <SettingHelp
                  title={t("settings.readers.launchOnScan")}
                  description={t("settings.readers.launchOnScanHelp")}
                />
              </span>
            }
            suffix={
              <ProBadge
                onPress={() => setProPurchaseModalOpen(true)}
                show={!launcherAccess}
              />
            }
            value={launchOnScan}
            setValue={setLaunchOnScan}
          />
        )}

        {/* Prefer External Reader - from App (native + NFC) */}
        {Capacitor.isNativePlatform() && nfcAvailable && (
          <ToggleSwitch
            label={
              <span className="flex items-center">
                {t("settings.readers.preferExternalReader")}
                <SettingHelp
                  title={t("settings.readers.preferExternalReader")}
                  description={t("settings.readers.preferExternalReaderHelp")}
                />
              </span>
            }
            value={preferRemoteWriter}
            setValue={setPreferRemoteWriter}
          />
        )}

        {/* Shake to Launch - from App (native + accelerometer, Pro feature) */}
        {Capacitor.isNativePlatform() && accelerometerAvailable && (
          <ToggleSwitch
            label={
              <span className="flex items-center">
                {t("settings.readers.shakeToLaunch")}
                <SettingHelp
                  title={t("settings.readers.shakeToLaunch")}
                  description={t("settings.readers.shakeToLaunchHelp")}
                />
              </span>
            }
            suffix={
              <ProBadge
                onPress={() => setProPurchaseModalOpen(true)}
                show={!launcherAccess}
              />
            }
            value={shakeEnabled}
            setValue={setShakeEnabled}
            disabled={!connected}
            loading={isLoading}
          />
        )}

        {Capacitor.isNativePlatform() &&
          accelerometerAvailable &&
          shakeEnabled && (
            <>
              <div
                className="flex flex-row"
                role="radiogroup"
                aria-label={t("settings.app.shakeModeLabel")}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={shakeMode === "random" && connected}
                  className={classNames(
                    "flex",
                    "flex-row",
                    "w-full",
                    "rounded-s-full",
                    "items-center",
                    "justify-center",
                    "py-1",
                    "font-medium",
                    "gap-1",
                    "tracking-[0.1px]",
                    "h-9",
                    "border",
                    "border-solid",
                    "border-bd-filled",
                    {
                      "bg-button-pattern": shakeMode === "random" && connected,
                      "bg-background": shakeMode !== "random" || !connected,
                      "border-foreground-disabled": !connected,
                      "text-foreground-disabled": !connected,
                    },
                  )}
                  onClick={() => setShakeMode("random")}
                  disabled={!connected}
                >
                  {shakeMode === "random" && connected && (
                    <span aria-hidden="true">
                      <CheckIcon size="28" />
                    </span>
                  )}
                  {t("settings.app.shakeRandomMedia")}
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={shakeMode === "custom" && connected}
                  className={classNames(
                    "flex",
                    "flex-row",
                    "w-full",
                    "rounded-e-full",
                    "items-center",
                    "justify-center",
                    "py-1",
                    "font-medium",
                    "gap-1",
                    "tracking-[0.1px]",
                    "h-9",
                    "border",
                    "border-solid",
                    "border-bd-filled",
                    {
                      "bg-button-pattern": shakeMode === "custom" && connected,
                      "bg-background": shakeMode !== "custom" || !connected,
                      "border-foreground-disabled": !connected,
                      "text-foreground-disabled": !connected,
                    },
                  )}
                  onClick={() => setShakeMode("custom")}
                  disabled={!connected}
                >
                  {shakeMode === "custom" && connected && (
                    <span aria-hidden="true">
                      <CheckIcon size="28" />
                    </span>
                  )}
                  {t("settings.app.shakeCustom")}
                </button>
              </div>

              {shakeMode === "random" && (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    {shakeSystem ? (
                      <span className="text-foreground">
                        {shakeSystem === "all"
                          ? t("systemSelector.allSystems")
                          : shakeSystem}
                      </span>
                    ) : (
                      <span className="text-foreground">-</span>
                    )}
                    <Button
                      label={t("settings.app.shakeSelectSystem")}
                      onClick={() => setSystemPickerOpen(true)}
                      variant="outline"
                      size="sm"
                      disabled={!connected}
                    />
                  </div>
                </div>
              )}

              {shakeMode === "custom" && (
                <div>
                  <ZapScriptInput
                    value={shakeZapscript}
                    setValue={setShakeZapscript}
                    showPalette={false}
                    rows={2}
                  />
                </div>
              )}
            </>
          )}

        {/* Audio Feedback - from Core */}
        <ToggleSwitch
          label={
            <span className="flex items-center">
              {t("settings.readers.audioFeedback")}
              <SettingHelp
                title={t("settings.readers.audioFeedback")}
                description={t("settings.readers.audioFeedbackHelp")}
              />
            </span>
          }
          value={coreSettings?.audioScanFeedback ?? false}
          setValue={(v) => updateCoreSetting.mutate({ audioScanFeedback: v })}
          disabled={!connected}
          loading={isLoading}
        />

        {/* Auto Detect Readers - from Core */}
        <ToggleSwitch
          label={
            <span className="flex items-center">
              {t("settings.readers.autoDetectReaders")}
              <SettingHelp
                title={t("settings.readers.autoDetectReaders")}
                description={t("settings.readers.autoDetectReadersHelp")}
              />
            </span>
          }
          value={coreSettings?.readersAutoDetect ?? false}
          setValue={(v) => updateCoreSetting.mutate({ readersAutoDetect: v })}
          disabled={!connected}
          loading={isLoading}
        />
      </div>

      <SystemSelector
        isOpen={systemPickerOpen}
        onClose={() => setSystemPickerOpen(false)}
        onSelect={(systems) => {
          const selectedSystem = systems.length === 0 ? "all" : systems[0];
          setShakeZapscript(`**launch.random:${selectedSystem}`);
        }}
        selectedSystems={shakeSystem ? [shakeSystem] : []}
        mode="single"
        title={t("settings.app.shakeSelectSystem")}
        includeAllOption={true}
      />

      <PurchaseModal />
    </PageFrame>
  );
}
