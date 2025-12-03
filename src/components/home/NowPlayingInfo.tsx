import { useTranslation } from "react-i18next";
import { filenameFromPath } from "@/lib/path.ts";
import { usePreferencesStore } from "@/lib/preferencesStore.ts";
import { StopIcon } from "@/lib/images";
import { Button } from "../wui/Button";

interface NowPlayingInfoProps {
  mediaName: string;
  mediaPath?: string;
  systemName: string;
  onStop: () => void;
  connected?: boolean;
}

export function NowPlayingInfo({
  mediaName,
  mediaPath,
  systemName,
  onStop,
  connected = true,
}: NowPlayingInfoProps) {
  const { t } = useTranslation();
  const showFilenames = usePreferencesStore((s) => s.showFilenames);

  const displayName =
    showFilenames && mediaPath
      ? filenameFromPath(mediaPath) || mediaName
      : mediaName;

  return (
    <section className="p-3" aria-labelledby="now-playing-heading">
      <div className="flex flex-row items-center justify-between">
        <h2
          id="now-playing-heading"
          className="font-bold text-gray-400 capitalize"
        >
          {t("scan.nowPlayingHeading")}
        </h2>
        <Button
          icon={<StopIcon size="24" />}
          variant="text"
          disabled={!connected || !mediaName}
          onClick={onStop}
          className="flex items-center"
          aria-label={t("scan.stopPlayingButton")}
        />
      </div>
      <div>
        <p>
          {t("scan.nowPlayingName", { game: "" })}
          {displayName === "" ? (
            <>
              <span aria-hidden="true">—</span>
              <span className="sr-only">{t("none")}</span>
            </>
          ) : (
            displayName
          )}
        </p>
        <p>
          {t("scan.nowPlayingSystem", { system: "" })}
          {systemName === "" ? (
            <>
              <span aria-hidden="true">—</span>
              <span className="sr-only">{t("none")}</span>
            </>
          ) : (
            systemName
          )}
        </p>
      </div>
    </section>
  );
}
