import { useTranslation } from "react-i18next";
import { filenameFromPath } from "@/lib/path.ts";
import { usePreferencesStore } from "@/lib/preferencesStore.ts";
import { StopIcon } from "../../lib/images";
import { Button } from "../wui/Button";

interface NowPlayingInfoProps {
  mediaName: string;
  mediaPath?: string;
  systemName: string;
  onStop: () => void;
}

export function NowPlayingInfo({
  mediaName,
  mediaPath,
  systemName,
  onStop
}: NowPlayingInfoProps) {
  const { t } = useTranslation();
  const showFilenames = usePreferencesStore((s) => s.showFilenames);

  const displayName =
    showFilenames && mediaPath
      ? filenameFromPath(mediaPath) || mediaName
      : mediaName;

  return (
    <div className="p-3">
      <div className="flex flex-row items-center justify-between">
        <p className="font-bold text-gray-400 capitalize">
          {t("scan.nowPlayingHeading")}
        </p>
        <Button
          icon={<StopIcon size="24" />}
          variant="text"
          disabled={!mediaName}
          onClick={onStop}
          className="flex items-center"
        />
      </div>
      <div>
        <p>
          {t("scan.nowPlayingName", {
            game: displayName === "" ? "-" : displayName
          })}
        </p>
        <p>
          {t("scan.nowPlayingSystem", {
            system: systemName === "" ? "-" : systemName
          })}
        </p>
      </div>
    </div>
  );
}
