import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TTA } from "../lib/coreApi.ts";
import { Button } from "../components/wui/Button";
import { ToggleSwitch } from "../components/wui/ToggleSwitch";
import { useSwipeable } from "react-swipeable";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useStatusStore } from "../lib/store";
import { TextInput } from "../components/wui/TextInput";
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
    queryFn: () => TTA.settings()
  });

  const update = useMutation({
    mutationFn: (params: UpdateSettingsRequest) => TTA.settingsUpdate(params),
    onSuccess: () => refetch()
  });

  const { t } = useTranslation();

  const navigate = useNavigate();
  const swipeHandlers = useSwipeable({
    onSwipedRight: () => navigate({ to: "/settings" })
  });

  return (
    <div {...swipeHandlers}>
      <PageFrame
        title={t("settings.advanced.title")}
        back={() => navigate({ to: "/settings" })}
      >
        <div className="py-2">
          <ToggleSwitch
            label={t("settings.advanced.soundEffects")}
            value={!data?.disableSounds}
            setValue={(v) => update.mutate({ disableSounds: !v })}
            disabled={!connected}
          />
        </div>

        <div className="py-2">
          <ToggleSwitch
            label={t("settings.advanced.autoDetect")}
            value={data?.probeDevice}
            setValue={(v) => update.mutate({ probeDevice: v })}
            disabled={!connected}
          />
        </div>

        <div className="py-2">
          <ToggleSwitch
            label={t("settings.advanced.debug")}
            value={data?.debug}
            setValue={(v) => update.mutate({ debug: v })}
            disabled={!connected}
          />
        </div>

        <div className="flex flex-col gap-4 pt-1.5">
          <TextInput
            label={t("settings.advanced.nfcDriver")}
            placeholder="pn532_uart:/dev/ttyUSB0"
            value={data?.connectionString}
            saveValue={(v) => update.mutate({ connectionString: v })}
            disabled={!connected}
          />

          <TextInput
            label={t("settings.advanced.insertModeBlocklist")}
            placeholder="ao486,Gamate,X68000"
            value={data?.exitGameBlocklist.join(",")}
            saveValue={(v: string) =>
              update.mutate({ exitGameBlocklist: v.split(",") })
            }
            disabled={!connected}
          />
        </div>

        <Button
          label={t("settings.advanced.downloadLog")}
          disabled={true}
          className="my-5 w-full"
        />
      </PageFrame>
    </div>
  );
}
