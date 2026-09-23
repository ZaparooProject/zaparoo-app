import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/wui/Card";
import { LibraryArtworkFrame } from "@/components/library/LibraryArtworkFrame";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useNowPlayingArtwork } from "@/hooks/useNowPlayingArtwork";
import { useSystemName } from "@/hooks/useSystemName";
import { filenameFromPath } from "@/lib/path";
import { usePreferencesStore } from "@/lib/preferencesStore";
import type {
  MediaBrowseEntry,
  PlayingResponse,
  PlaylistState,
} from "@/lib/models";
import { NowPlayingTransport } from "./NowPlayingTransport";
import { PlaylistQueue } from "./PlaylistQueue";

interface NowPlayingCardProps {
  media: PlayingResponse;
  playlist: PlaylistState | null;
  connected: boolean;
  headingLabel?: string;
  stopButtonLabel?: string;
  canPausePlaylist?: boolean;
  lastPlayed?: MediaBrowseEntry | null;
  replayingLast?: boolean;
  onStop: () => void;
  onPlaylistPrevious: () => void;
  onPlaylistToggle: () => void;
  onPlaylistNext: () => void;
  onPlaylistSelect?: (index: number) => void;
  onReplayLast?: () => void;
}

export function NowPlayingCard({
  media,
  playlist,
  connected,
  headingLabel,
  stopButtonLabel,
  canPausePlaylist = false,
  lastPlayed = null,
  replayingLast = false,
  onStop,
  onPlaylistPrevious,
  onPlaylistToggle,
  onPlaylistNext,
  onPlaylistSelect,
  onReplayLast,
}: NowPlayingCardProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const deviceKey = useActiveDeviceKey();
  const showFilenames = usePreferencesStore((s) => s.showFilenames);
  const displaySystemName = useSystemName(media.systemId, media.systemName);
  const artwork = useNowPlayingArtwork(media);

  const displayName =
    showFilenames && media.mediaPath
      ? filenameFromPath(media.mediaPath) || media.mediaName
      : media.mediaName;
  const isIdle = displayName === "";
  const sectionLabel = headingLabel ?? t("scan.nowPlayingHeading");
  const isPlaying =
    !isIdle && (playlist ? playlist.playing : media.playbackState !== "paused");
  return (
    <section aria-labelledby={headingId}>
      <h2
        id={headingId}
        className="text-muted-foreground mb-2 font-bold capitalize"
      >
        {sectionLabel}
      </h2>
      <Card>
        {isIdle ? (
          <div className="min-w-0">
            <p
              className="text-muted-foreground text-sm font-medium"
              role="status"
            >
              {t("scan.nowPlayingIdle")}
            </p>
            {lastPlayed && !playlist && (
              <p className="text-foreground mt-1 truncate text-sm font-medium">
                {t("scan.lastPlayed", { media: lastPlayed.name })}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-row items-center gap-3">
            <LibraryArtworkFrame
              entry={artwork}
              systemId={media.systemId}
              deviceKey={deviceKey}
              maxSize={256}
              priority="detail"
              className="h-20 w-15"
            />

            <div className="flex min-w-0 grow flex-col gap-0.5">
              <p className="line-clamp-2 font-semibold">{displayName}</p>
              {displaySystemName !== "" && (
                <p className="text-muted-foreground truncate text-sm">
                  {displaySystemName}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-row items-center justify-between gap-2">
          <NowPlayingTransport
            media={media}
            playlist={playlist}
            connected={connected}
            canPausePlaylist={canPausePlaylist}
            sectionLabel={sectionLabel}
            stopButtonLabel={stopButtonLabel ?? t("scan.stopPlayingButton")}
            isPlaying={isPlaying}
            canReplayLast={Boolean(lastPlayed)}
            replayingLast={replayingLast}
            replayLastLabel={
              lastPlayed
                ? t("scan.playLastPlayed", { media: lastPlayed.name })
                : t("scan.playLastPlayedUnavailable")
            }
            onStop={onStop}
            onPrevious={onPlaylistPrevious}
            onToggle={onPlaylistToggle}
            onNext={onPlaylistNext}
            onReplayLast={onReplayLast}
          />
        </div>

        {playlist && playlist.items.length > 0 && onPlaylistSelect && (
          <PlaylistQueue
            playlist={playlist}
            connected={connected}
            onSelect={onPlaylistSelect}
          />
        )}
      </Card>
    </section>
  );
}
