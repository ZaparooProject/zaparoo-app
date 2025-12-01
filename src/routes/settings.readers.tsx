import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import classNames from "classnames";
import { ToggleSwitch } from "../components/wui/ToggleSwitch";
import { useSmartSwipe } from "../hooks/useSmartSwipe";
import { useStatusStore } from "../lib/store";
import { PageFrame } from "../components/PageFrame";
import {
  usePreferencesStore,
  selectAppSettings,
  selectShakeSettings,
} from "../lib/preferencesStore";
import { BackIcon, CheckIcon } from "../lib/images";
import { HeaderButton } from "../components/wui/HeaderButton";
import { SystemSelector } from "../components/SystemSelector";
import { Button } from "../components/wui/Button";
import { useProPurchase } from "../components/ProPurchase";
import { ProBadge } from "../components/ProBadge";
import { ZapScriptInput } from "../components/ZapScriptInput";
import { CoreAPI } from "../lib/coreApi.ts";
import { UpdateSettingsRequest } from "../lib/models.ts";
import { usePageHeadingFocus } from "../hooks/usePageHeadingFocus";

interface LoaderData {
  restartScan: boolean;
  launchOnScan: boolean;
  launcherAccess: boolean;
  preferRemoteWriter: boolean;
  shakeEnabled: boolean;
  shakeMode: "random" | "custom";
  shakeZapscript: string;
}

export const Route = createFileRoute("/settings/readers")({
  loader: (): LoaderData => {
    const state = usePreferencesStore.getState();
    return {
      restartScan: state.restartScan,
      launchOnScan: state.launchOnScan,
      launcherAccess: state.launcherAccess,
      preferRemoteWriter: state.preferRemoteWriter,
      shakeEnabled: state.shakeEnabled,
      shakeMode: state.shakeMode,
      shakeZapscript: state.shakeZapscript,
    };
  },
  component: ReadersSettings,
});

function ReadersSettings() {
  const { t } = useTranslation();
  usePageHeadingFocus(t("settings.readers.title"));
  const initData = Route.useLoaderData();
  const connected = useStatusStore((state) => state.connected);
  const [systemPickerOpen, setSystemPickerOpen] = useState(false);
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

  const { PurchaseModal, setProPurchaseModalOpen } = useProPurchase(
    initData.launcherAccess,
  );

  const router = useRouter();
  const goBack = () => router.history.back();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false,
  });

  // Show blank page while loading to prevent flicker
  if (isPending) {
    return null;
  }

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
          <span id="scan-mode-label">{t("settings.readers.scanMode")}</span>
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
            >
              {coreSettings?.readersScanMode === "hold" && connected && (
                <span aria-hidden="true">
                  <CheckIcon size="28" />
                </span>
              )}
              {t("settings.insertMode")}
            </button>
          </div>
          {coreSettings?.readersScanMode === "hold" && connected && (
            <p className="pt-1 text-sm">{t("settings.insertHelp")}</p>
          )}
        </div>

        {/* Continuous Scan - from App (always shown) */}
        <ToggleSwitch
          label={t("settings.readers.continuousScan")}
          value={restartScan}
          setValue={setRestartScan}
        />

        {/* Launch On Scan - from App (native only, Pro feature) */}
        {Capacitor.isNativePlatform() && connected && (
          <ToggleSwitch
            label={
              <>
                {t("settings.readers.launchOnScan")}
                {!launcherAccess && <ProBadge />}
              </>
            }
            value={launcherAccess && launchOnScan}
            setValue={setLaunchOnScan}
            disabled={!launcherAccess}
            onDisabledClick={() => setProPurchaseModalOpen(true)}
          />
        )}

        {/* Prefer Remote Writer - from App (native + NFC) */}
        {Capacitor.isNativePlatform() && nfcAvailable && (
          <ToggleSwitch
            label={t("settings.readers.preferRemoteWriter")}
            value={preferRemoteWriter}
            setValue={setPreferRemoteWriter}
          />
        )}

        {/* Shake to Launch - from App (native + accelerometer, Pro feature) */}
        {Capacitor.isNativePlatform() && accelerometerAvailable && (
          <ToggleSwitch
            label={
              <>
                {t("settings.readers.shakeToLaunch")}
                {!launcherAccess && <ProBadge />}
              </>
            }
            value={shakeEnabled}
            setValue={setShakeEnabled}
            disabled={!launcherAccess || !connected}
            onDisabledClick={() => {
              if (!launcherAccess) {
                setProPurchaseModalOpen(true);
              }
            }}
          />
        )}

        {Capacitor.isNativePlatform() &&
          accelerometerAvailable &&
          shakeEnabled &&
          launcherAccess && (
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

        {/* Sound Effects - from Core */}
        <ToggleSwitch
          label={t("settings.readers.soundEffects")}
          value={coreSettings?.audioScanFeedback ?? false}
          setValue={(v) => updateCoreSetting.mutate({ audioScanFeedback: v })}
          disabled={!connected}
        />

        {/* Auto Detect - from Core */}
        <ToggleSwitch
          label={t("settings.readers.autoDetect")}
          value={coreSettings?.readersAutoDetect ?? false}
          setValue={(v) => updateCoreSetting.mutate({ readersAutoDetect: v })}
          disabled={!connected}
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
