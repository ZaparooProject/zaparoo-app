import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { Preferences } from "@capacitor/preferences";
import classNames from "classnames";
import { CoreAPI } from "../lib/coreApi.ts";
import { ToggleSwitch } from "../components/wui/ToggleSwitch";
import { useSmartSwipe } from "../hooks/useSmartSwipe";
import { useStatusStore } from "../lib/store";
import { PageFrame } from "../components/PageFrame";
import { UpdateSettingsRequest } from "../lib/models.ts";
import { useAppSettings } from "../hooks/useAppSettings";
import { BackIcon, CheckIcon } from "../lib/images";

interface LoaderData {
  restartScan: boolean;
  launchOnScan: boolean;
  launcherAccess: boolean;
  preferRemoteWriter: boolean;
}

export const Route = createFileRoute("/settings/advanced")({
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
  component: Advanced
});

function Advanced() {
  const initData = Route.useLoaderData();
  const connected = useStatusStore((state) => state.connected);
  const [hasLocalNFC, setHasLocalNFC] = useState(false);

  const { preferRemoteWriter, setPreferRemoteWriter } = useAppSettings({ initData });

  useEffect(() => {
    // Check if local NFC is available on native platforms
    if (Capacitor.isNativePlatform()) {
      Nfc.isAvailable()
        .then((result) => setHasLocalNFC(result.nfc))
        .catch(() => setHasLocalNFC(false));
    }
  }, []);

  const { data, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: () => CoreAPI.settings()
  });

  const update = useMutation({
    mutationFn: (params: UpdateSettingsRequest) =>
      CoreAPI.settingsUpdate(params),
    onSuccess: () => refetch()
  });

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
        <h1 className="text-foreground text-xl">{t("settings.advanced.title")}</h1>
      }
    >
        <div className="py-2">
          <ToggleSwitch
            label={t("settings.advanced.soundEffects")}
            value={data?.audioScanFeedback}
            setValue={(v) => update.mutate({ audioScanFeedback: v })}
            disabled={!connected}
          />
        </div>

        <div className="py-2">
          <ToggleSwitch
            label={t("settings.advanced.autoDetect")}
            value={data?.readersAutoDetect}
            setValue={(v) => update.mutate({ readersAutoDetect: v })}
            disabled={!connected}
          />
        </div>

        <div className="py-2">
          <ToggleSwitch
            label={t("settings.advanced.debug")}
            value={data?.debugLogging}
            setValue={(v) => update.mutate({ debugLogging: v })}
            disabled={!connected}
          />
        </div>

        {Capacitor.isNativePlatform() && hasLocalNFC && (
          <div className="py-2">
            <ToggleSwitch
              label={t("settings.advanced.preferRemoteWriter")}
              value={preferRemoteWriter}
              setValue={setPreferRemoteWriter}
            />
          </div>
        )}

        <div className="py-2">
          <span>{t("settings.modeLabel")}</span>
          <div className="flex flex-row mt-2" role="group">
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
                  "bg-button-pattern":
                    data?.readersScanMode === "tap" && connected
                },
                {
                  "bg-background": !connected,
                  "border-foreground-disabled": !connected,
                  "text-foreground-disabled": !connected
                }
              )}
              onClick={() => update.mutate({ readersScanMode: "tap" })}
            >
              {data?.readersScanMode === "tap" && connected && (
                <CheckIcon size="28" />
              )}
              {t("settings.tapMode")}
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
                  "bg-button-pattern":
                    data?.readersScanMode === "hold" && connected
                },
                {
                  "bg-background": !connected,
                  "border-foreground-disabled": !connected,
                  "text-foreground-disabled": !connected
                }
              )}
              onClick={() => update.mutate({ readersScanMode: "hold" })}
            >
              {data?.readersScanMode === "hold" && connected && (
                <CheckIcon size="28" />
              )}
              {t("settings.insertMode")}
            </button>
          </div>
          {data?.readersScanMode === "hold" && connected && (
            <p className="pt-1 text-sm">{t("settings.insertHelp")}</p>
          )}
        </div>

        {/*<div className="flex flex-col gap-4 pt-1.5">*/}
        {/*  <TextInput*/}
        {/*    label={t("settings.advanced.insertModeBlocklist")}*/}
        {/*    placeholder="ao486,Gamate,X68000"*/}
        {/*    value={data?.readersScanIgnoreSystems.join(",")}*/}
        {/*    saveValue={(v: string) =>*/}
        {/*      update.mutate({ readersScanIgnoreSystems: v.split(",") })*/}
        {/*    }*/}
        {/*    disabled={!connected}*/}
        {/*  />*/}
        {/*</div>*/}
      </PageFrame>
  );
}
