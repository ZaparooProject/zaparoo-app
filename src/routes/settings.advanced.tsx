import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import classNames from "classnames";
import { CoreAPI } from "@/lib/coreApi.ts";
import { ToggleSwitch } from "@/components/wui/ToggleSwitch";
import { SettingHelp } from "@/components/wui/SettingHelp";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { PageFrame } from "@/components/PageFrame";
import { UpdateSettingsRequest } from "@/lib/models.ts";
import { BackIcon, NextIcon } from "@/lib/images";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { RestorePuchasesButton } from "@/components/ProPurchase";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";

export const Route = createFileRoute("/settings/advanced")({
  component: AdvancedSettings,
});

function AdvancedSettings() {
  const { t } = useTranslation();
  usePageHeadingFocus(t("settings.advanced.title"));
  const connected = useStatusStore((state) => state.connected);
  const connectionState = useStatusStore((state) => state.connectionState);
  const showFilenames = usePreferencesStore((s) => s.showFilenames);
  const setShowFilenames = usePreferencesStore((s) => s.setShowFilenames);

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
          {t("settings.advanced.title")}
        </h1>
      }
    >
      <div className="flex flex-col gap-5">
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
          disabled={!connected}
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

        {Capacitor.isNativePlatform() && <RestorePuchasesButton />}
      </div>
    </PageFrame>
  );
}
