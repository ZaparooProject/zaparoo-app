import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { CoreAPI } from "../lib/coreApi.ts";
import { ToggleSwitch } from "../components/wui/ToggleSwitch";
import { useSmartSwipe } from "../hooks/useSmartSwipe";
import { useStatusStore } from "../lib/store";
import { usePreferencesStore } from "../lib/preferencesStore";
import { PageFrame } from "../components/PageFrame";
import { UpdateSettingsRequest } from "../lib/models.ts";
import { BackIcon, NextIcon } from "../lib/images";
import { HeaderButton } from "../components/wui/HeaderButton";
import { RestorePuchasesButton } from "../components/ProPurchase";

export const Route = createFileRoute("/settings/advanced")({
  component: AdvancedSettings
});

function AdvancedSettings() {
  const connected = useStatusStore((state) => state.connected);
  const showFilenames = usePreferencesStore((s) => s.showFilenames);
  const setShowFilenames = usePreferencesStore((s) => s.setShowFilenames);

  const { data, refetch, isPending } = useQuery({
    queryKey: ["settings"],
    queryFn: () => CoreAPI.settings()
  });

  const update = useMutation({
    mutationFn: (params: UpdateSettingsRequest) =>
      CoreAPI.settingsUpdate(params),
    onSuccess: () => refetch()
  });

  const { t } = useTranslation();

  const router = useRouter();
  const goBack = () => router.history.back();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false
  });

  // Show blank page while loading to prevent flicker
  if (isPending) {
    return null;
  }

  return (
    <PageFrame
      {...swipeHandlers}
      headerLeft={
        <HeaderButton onClick={goBack} icon={<BackIcon size="24" />} />
      }
      headerCenter={
        <h1 className="text-foreground text-xl">{t("settings.advanced.title")}</h1>
      }
    >
      <div className="flex flex-col gap-5">
        <ToggleSwitch
          label={t("settings.advanced.debugLogging")}
          value={data?.debugLogging ?? false}
          setValue={(v) => update.mutate({ debugLogging: v })}
          disabled={!connected}
        />

        <ToggleSwitch
          label={t("settings.advanced.showFilenames")}
          value={showFilenames}
          setValue={setShowFilenames}
        />

        <Link to="/settings/logs">
          <div className="flex flex-row items-center justify-between">
            <p>{t("settings.advanced.viewLogs")}</p>
            <NextIcon size="20" />
          </div>
        </Link>

        {Capacitor.isNativePlatform() && <RestorePuchasesButton />}
      </div>
    </PageFrame>
  );
}
