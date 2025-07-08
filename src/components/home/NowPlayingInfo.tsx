import { useTranslation } from "react-i18next";
import { StopIcon } from "../../lib/images";
import { Button } from "../wui/Button";

interface NowPlayingInfoProps {
  mediaName: string;
  systemName: string;
  onStop: () => void;
}

export function NowPlayingInfo({ mediaName, systemName, onStop }: NowPlayingInfoProps) {
  const { t } = useTranslation();

  return (
    <div className="p-3">
      <div className="flex flex-row items-center justify-between">
        <p className="font-bold capitalize text-gray-400">
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
            game: mediaName === "" ? "-" : mediaName
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