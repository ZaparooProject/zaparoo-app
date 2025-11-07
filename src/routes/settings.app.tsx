import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { Preferences } from "@capacitor/preferences";
import { ToggleSwitch } from "../components/wui/ToggleSwitch";
import { useSmartSwipe } from "../hooks/useSmartSwipe";
import { useStatusStore } from "../lib/store";
import { PageFrame } from "../components/PageFrame";
import { useAppSettings } from "../hooks/useAppSettings";
import { BackIcon } from "../lib/images";
import { ScanSettings } from "../components/home/ScanSettings.tsx";

interface LoaderData {
  restartScan: boolean;
  launchOnScan: boolean;
  launcherAccess: boolean;
  preferRemoteWriter: boolean;
}

export const Route = createFileRoute("/settings/app")({
  loader: async (): Promise<LoaderData> => {
    const [restartResult, launchResult, accessResult, remoteWriterResult] =
      await Promise.all([
        Preferences.get({ key: "restartScan" }),
        Preferences.get({ key: "launchOnScan" }),
        Preferences.get({ key: "launcherAccess" }),
        Preferences.get({ key: "preferRemoteWriter" }),
      ]);

    return {
      restartScan: restartResult.value === "true",
      launchOnScan: launchResult.value !== "false",
      launcherAccess: accessResult.value === "true",
      preferRemoteWriter: remoteWriterResult.value === "true",
    };
  },
  component: AppSettings
});

function AppSettings() {
  const initData = Route.useLoaderData();
  const connected = useStatusStore((state) => state.connected);
  const [hasLocalNFC, setHasLocalNFC] = useState(false);

  const { preferRemoteWriter, setPreferRemoteWriter, restartScan, setRestartScan, launchOnScan, setLaunchOnScan } = useAppSettings({ initData });

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
        <button onClick={() => navigate({ to: "/settings" })} className="cursor-pointer">
          <BackIcon size="24" />
        </button>
      }
      headerCenter={
        <h1 className="text-foreground text-xl">{t("settings.app.title")}</h1>
      }
    >
        <ScanSettings
          connected={connected}
          restartScan={restartScan}
          setRestartScan={setRestartScan}
          launchOnScan={launchOnScan}
          setLaunchOnScan={setLaunchOnScan}
        />

        {Capacitor.isNativePlatform() && hasLocalNFC && (
          <div className="py-2">
            <ToggleSwitch
              label={t("settings.app.preferRemoteWriter")}
              value={preferRemoteWriter}
              setValue={setPreferRemoteWriter}
            />
          </div>
        )}
      </PageFrame>
  );
}
