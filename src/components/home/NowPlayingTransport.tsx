import { useTranslation } from "react-i18next";
import {
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SquareIcon,
} from "lucide-react";
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
    className:
      "min-[1024px]:min-h-16 min-[1024px]:w-auto min-[1024px]:max-w-20 min-[1024px]:flex-1",
  };

  return (
    <div
      className="wui-transport-deck mt-3"
      role="group"
      aria-label={t(playlist ? "scan.playlistControls" : "scan.mediaControls", {
        section: sectionLabel,
      })}
    >
      <Button
        {...keyProps}
        icon={<SkipBackIcon size={20} fill="currentColor" />}
        disabled={!connected || !canStepPrevious}
        onClick={onPrevious}
        aria-label={t("scan.playlistPrevious")}
      />
      <Button
        {...keyProps}
        icon={<SquareIcon size={20} fill="currentColor" />}
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
            <PauseIcon size={20} fill="currentColor" />
          ) : (
            <PlayIcon size={20} fill="currentColor" />
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
            ? t(
                playlist
                  ? isPlaying
                    ? "scan.playlistPause"
                    : "scan.playlistPlay"
                  : isPlaying
                    ? "scan.mediaPause"
                    : "scan.mediaResume",
              )
            : replayLastLabel
        }
      />
      <Button
        {...keyProps}
        icon={<SkipForwardIcon size={20} fill="currentColor" />}
        disabled={!connected || !canStepNext}
        onClick={onNext}
        aria-label={t("scan.playlistNext")}
      />
    </div>
  );
}
