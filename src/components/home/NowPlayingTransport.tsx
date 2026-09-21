import { useTranslation } from "react-i18next";
import { Pause, Play, SkipBack, SkipForward, Square } from "lucide-react";
import { Button } from "@/components/wui/Button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { asMediaControlAction } from "@/lib/models";
import type {
  MediaControlAction,
  PlayingResponse,
  PlaylistState,
} from "@/lib/models";

/** What the running media says it accepts, narrowed to actions we render. */
function advertisedControls(media: PlayingResponse): Set<MediaControlAction> {
  const controls = new Set<MediaControlAction>();
  for (const control of media.launcherControls ?? []) {
    const action = asMediaControlAction(control);
    if (action) controls.add(action);
  }
  return controls;
}

interface NowPlayingTransportProps {
  media: PlayingResponse;
  playlist: PlaylistState | null;
  connected: boolean;
  canPausePlaylist: boolean;
  sectionLabel: string;
  stopButtonLabel: string;
  isPlaying: boolean;
  canReplayLast?: boolean;
  replayingLast?: boolean;
  replayLastLabel?: string;
  onStop: () => void;
  onPrevious: () => void;
  onToggle: () => void;
  onNext: () => void;
  onReplayLast?: () => void;
}

export function NowPlayingTransport({
  media,
  playlist,
  connected,
  canPausePlaylist,
  sectionLabel,
  stopButtonLabel,
  isPlaying,
  canReplayLast = false,
  replayingLast = false,
  replayLastLabel,
  onStop,
  onPrevious,
  onToggle,
  onNext,
  onReplayLast,
}: NowPlayingTransportProps) {
  const { t } = useTranslation();
  const controls = advertisedControls(media);

  const hasMedia = Boolean(playlist || media.mediaName);
  const canStepPrevious = playlist
    ? playlist.total >= 2
    : hasMedia && controls.has("previous");
  const canStepNext = playlist
    ? playlist.total >= 2
    : hasMedia && controls.has("next");
  const canToggle = playlist
    ? !playlist.playing || canPausePlaylist
    : hasMedia &&
      (controls.has("toggle_pause") ||
        (controls.has("pause") && controls.has("resume")));
  const replayLastAvailable =
    !hasMedia && canReplayLast && Boolean(onReplayLast);

  const keyProps = {
    variant: "outline" as const,
    shape: "square" as const,
    size: "sm" as const,
  };

  return (
    <div
      className="wui-transport-deck"
      role="group"
      aria-label={t("scan.playlistControls", { section: sectionLabel })}
    >
      <Button
        {...keyProps}
        icon={<SkipBack size={20} fill="currentColor" />}
        disabled={!connected || !canStepPrevious}
        onClick={onPrevious}
        aria-label={t("scan.playlistPrevious")}
      />
      <Button
        {...keyProps}
        icon={<Square size={20} fill="currentColor" />}
        disabled={!connected || !hasMedia}
        onClick={onStop}
        aria-label={stopButtonLabel}
      />
      <Button
        {...keyProps}
        icon={
          replayingLast ? (
            <LoadingSpinner size={20} decorative />
          ) : isPlaying ? (
            <Pause size={20} fill="currentColor" />
          ) : (
            <Play size={20} fill="currentColor" />
          )
        }
        disabled={
          !connected ||
          replayingLast ||
          (hasMedia ? !canToggle : !replayLastAvailable)
        }
        disabledAppearance={replayingLast ? "busy" : "unavailable"}
        onClick={hasMedia ? onToggle : onReplayLast}
        aria-label={
          hasMedia
            ? isPlaying
              ? t("scan.playlistPause")
              : t("scan.playlistPlay")
            : replayLastLabel
        }
      />
      <Button
        {...keyProps}
        icon={<SkipForward size={20} fill="currentColor" />}
        disabled={!connected || !canStepNext}
        onClick={onNext}
        aria-label={t("scan.playlistNext")}
      />
    </div>
  );
}
