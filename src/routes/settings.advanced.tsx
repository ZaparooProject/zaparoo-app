import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CoreAPI } from "../lib/coreApi.ts";
import { ToggleSwitch } from "../components/wui/ToggleSwitch";
import { useSmartSwipe } from "../hooks/useSmartSwipe";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useStatusStore } from "../lib/store";
import { PageFrame } from "../components/PageFrame";
import { useTranslation } from "react-i18next";
import { UpdateSettingsRequest } from "../lib/models.ts";

export const Route = createFileRoute("/settings/advanced")({
  component: Advanced
});

function Advanced() {
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
    <div {...swipeHandlers} className="h-full w-full overflow-y-auto">
      <PageFrame
        title={t("settings.advanced.title")}
        back={() => navigate({ to: "/settings" })}
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
    </div>
  );
}
