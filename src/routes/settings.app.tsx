import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { Preferences } from "@capacitor/preferences";
import classNames from "classnames";
import { ToggleSwitch } from "../components/wui/ToggleSwitch";
import { useSmartSwipe } from "../hooks/useSmartSwipe";
import { useStatusStore } from "../lib/store";
import { PageFrame } from "../components/PageFrame";
import { useAppSettings } from "../hooks/useAppSettings";
import { BackIcon, CheckIcon } from "../lib/images";
import { ScanSettings } from "../components/home/ScanSettings.tsx";
import { SystemsSearchModal } from "../components/SystemsSearchModal";
import { Button } from "../components/wui/Button";
import { useProPurchase } from "../components/ProPurchase";
import { ZapScriptInput } from "../components/ZapScriptInput";

interface LoaderData {
  restartScan: boolean;
  launchOnScan: boolean;
  launcherAccess: boolean;
  preferRemoteWriter: boolean;
  shakeEnabled: boolean;
  shakeMode: "random" | "custom";
  shakeZapscript: string;
}

export const Route = createFileRoute("/settings/app")({
  loader: async (): Promise<LoaderData> => {
    const [
      restartResult,
      launchResult,
      accessResult,
      remoteWriterResult,
      shakeEnabledResult,
      shakeModeResult,
      shakeZapscriptResult
    ] = await Promise.all([
      Preferences.get({ key: "restartScan" }),
      Preferences.get({ key: "launchOnScan" }),
      Preferences.get({ key: "launcherAccess" }),
      Preferences.get({ key: "preferRemoteWriter" }),
      Preferences.get({ key: "shakeEnabled" }),
      Preferences.get({ key: "shakeMode" }),
      Preferences.get({ key: "shakeZapscript" })
    ]);

    return {
      restartScan: restartResult.value === "true",
      launchOnScan: launchResult.value !== "false",
      launcherAccess: accessResult.value === "true",
      preferRemoteWriter: remoteWriterResult.value === "true",
      shakeEnabled: shakeEnabledResult.value === "true",
      shakeMode: (shakeModeResult.value as "random" | "custom") || "random",
      shakeZapscript: shakeZapscriptResult.value || ""
    };
  },
  staleTime: 0,
  gcTime: 0,
  component: AppSettings
});

function AppSettings() {
  const initData = Route.useLoaderData();
  const connected = useStatusStore((state) => state.connected);
  const [hasLocalNFC, setHasLocalNFC] = useState(false);
  const [systemPickerOpen, setSystemPickerOpen] = useState(false);

  const {
    preferRemoteWriter,
    setPreferRemoteWriter,
    restartScan,
    setRestartScan,
    launchOnScan,
    setLaunchOnScan,
    shakeEnabled,
    setShakeEnabled,
    shakeMode,
    setShakeMode,
    shakeZapscript,
    setShakeZapscript,
    launcherAccess
  } = useAppSettings({ initData });

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
    initData.launcherAccess
  );

  useEffect(() => {
    // Check if local NFC is available on native platforms
    if (Capacitor.isNativePlatform()) {
      Nfc.isAvailable()
        .then((result) => setHasLocalNFC(result.nfc))
        .catch(() => setHasLocalNFC(false));
    }
  }, []);

  const { t } = useTranslation();

  const navigate = useNavigate();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: () => navigate({ to: "/settings" }),
    preventScrollOnSwipe: false
  });

  return (
    <PageFrame
      {...swipeHandlers}
      headerLeft={
        <button
          onClick={() => navigate({ to: "/settings" })}
          className="cursor-pointer"
        >
          <BackIcon size="24" />
        </button>
      }
      headerCenter={
        <h1 className="text-foreground text-xl">{t("settings.app.title")}</h1>
      }
    >
      <div className="flex flex-col gap-3">
        <ScanSettings
          connected={connected}
          restartScan={restartScan}
          setRestartScan={setRestartScan}
          launchOnScan={launchOnScan}
          setLaunchOnScan={setLaunchOnScan}
        />

        {Capacitor.isNativePlatform() && hasLocalNFC && (
          <ToggleSwitch
            label={t("settings.app.preferRemoteWriter")}
            value={preferRemoteWriter}
            setValue={setPreferRemoteWriter}
          />
        )}

        {Capacitor.isNativePlatform() && (
          <ToggleSwitch
            label={
              <>
                {t("settings.app.shakeToLaunch")}
                {!launcherAccess && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({t("settings.app.proFeature")})
                  </span>
                )}
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

        {Capacitor.isNativePlatform() && shakeEnabled && launcherAccess && (
          <>
            <div>
              <div className="flex flex-row" role="group">
                <button
                  type="button"
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
                      "text-foreground-disabled": !connected
                    }
                  )}
                  onClick={() => setShakeMode("random")}
                  disabled={!connected}
                >
                  {shakeMode === "random" && connected && (
                    <CheckIcon size="28" />
                  )}
                  {t("settings.app.shakeRandomMedia")}
                </button>

                <button
                  type="button"
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
                      "text-foreground-disabled": !connected
                    }
                  )}
                  onClick={() => setShakeMode("custom")}
                  disabled={!connected}
                >
                  {shakeMode === "custom" && connected && (
                    <CheckIcon size="28" />
                  )}
                  {t("settings.app.shakeCustom")}
                </button>
              </div>
            </div>

            {shakeMode === "random" && (
              <div>
                <div className="flex items-center justify-between gap-2">
                  {shakeSystem ? (
                    <span className="text-foreground">{shakeSystem}</span>
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
      </div>

      <SystemsSearchModal
        isOpen={systemPickerOpen}
        close={() => setSystemPickerOpen(false)}
        onSelect={(systemId) => {
          setShakeZapscript(`**launch.random:${systemId}`);
          setSystemPickerOpen(false);
        }}
      />

      <PurchaseModal />
    </PageFrame>
  );
}
