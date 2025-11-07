import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { CoreAPI } from "../lib/coreApi.ts";
import { ToggleSwitch } from "../components/wui/ToggleSwitch";
import { useSmartSwipe } from "../hooks/useSmartSwipe";
import { useStatusStore } from "../lib/store";
import { PageFrame } from "../components/PageFrame";
import { UpdateSettingsRequest } from "../lib/models.ts";
import { BackIcon, CheckIcon } from "../lib/images";

export const Route = createFileRoute("/settings/core")({
  component: CoreSettings
});

function CoreSettings() {
  const connected = useStatusStore((state) => state.connected);

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
        <h1 className="text-foreground text-xl">{t("settings.core.title")}</h1>
      }
    >
        <div className="py-2">
          <ToggleSwitch
            label={t("settings.core.soundEffects")}
            value={data?.audioScanFeedback ?? false}
            setValue={(v) => update.mutate({ audioScanFeedback: v })}
            disabled={!connected}
          />
        </div>

        <div className="py-2">
          <ToggleSwitch
            label={t("settings.core.autoDetect")}
            value={data?.readersAutoDetect ?? false}
            setValue={(v) => update.mutate({ readersAutoDetect: v })}
            disabled={!connected}
          />
        </div>

        <div className="py-2">
          <ToggleSwitch
            label={t("settings.core.debug")}
            value={data?.debugLogging ?? false}
            setValue={(v) => update.mutate({ debugLogging: v })}
            disabled={!connected}
          />
        </div>

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
        {/*    label={t("settings.core.insertModeBlocklist")}*/}
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
