import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { NowPlayingCard } from "@/components/home/NowPlayingCard";
import type { PlayingResponse } from "@/lib/models";
import {
  stopLocalPlayback,
  toggleLocalPlayback,
} from "@/lib/localPlayback/player";
import {
  isLocalPlaybackActive,
  useLocalPlaybackStore,
} from "@/lib/localPlayback/store";

const noop = () => undefined;

/** Now Playing for audio or video the app is playing itself. */
export function LocalNowPlaying() {
  const { t } = useTranslation();
  const playback = useLocalPlaybackStore((s) => s.playback);
  if (!isLocalPlaybackActive(playback)) return null;

  const system =
    playback.system ?? (playback.kind === "video" ? "Video" : "Audio");
  const media: PlayingResponse = {
    systemId: system,
    systemName: system,
    mediaName: playback.title ?? "",
    mediaPath: "",
    launcherControls: ["toggle_pause"],
    playbackState: playback.status === "paused" ? "paused" : "playing",
  };
  const report = (e: unknown) => {
    toast.error(
      t("localMedia.controlFailed", {
        msg: e instanceof Error ? e.message : String(e),
      }),
    );
  };

  return (
    <NowPlayingCard
      local
      media={media}
      playlist={null}
      connected
      headingLabel={t("localMedia.nowPlayingHeading")}
      stopButtonLabel={t("localMedia.stop")}
      onStop={() => void stopLocalPlayback().catch(report)}
      onToggle={() => void toggleLocalPlayback().catch(report)}
      onPrevious={noop}
      onNext={noop}
    />
  );
}
