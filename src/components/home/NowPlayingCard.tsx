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
  onReplayLast,
}: NowPlayingCardProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const deviceKey = useActiveDeviceKey();
  const showFilenames = usePreferencesStore((s) => s.showFilenames);
  const displaySystemName = useSystemName(media.systemId, media.systemName);
  const artwork = useNowPlayingArtwork(media);

  const activePlaylistItem = playlist?.items[playlist.index];
  const playlistItemName =
    activePlaylistItem?.name || activePlaylistItem?.zapScript || "";
  const displayName =
    (showFilenames && media.mediaPath
      ? filenameFromPath(media.mediaPath) || media.mediaName
      : media.mediaName) || playlistItemName;
  const isIdle = displayName === "";
  const sectionLabel = headingLabel ?? t("scan.nowPlayingHeading");
  const isPlaying =
    !isIdle && (playlist ? playlist.playing : media.playbackState !== "paused");
  const playlistPosition =
    playlist && playlist.total > 0 ? playlist.index + 1 : 0;

  return (
    <section aria-labelledby={headingId}>
      <h2
        id={headingId}
        className="text-muted-foreground mb-2 font-bold capitalize"
      >
        {sectionLabel}
      </h2>
      <Card>
        {isIdle && !playlist ? (
          <div className="min-w-0">
            <p
              className="text-muted-foreground text-sm font-medium"
              role="status"
            >
              {t("scan.nowPlayingIdle")}
            </p>
            {lastPlayed && (
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
              {playlist && (
                <>
                  <p className="text-muted-foreground truncate text-sm">
                    {t("scan.playlistName", {
                      playlist: playlist.name || playlist.id,
                    })}
                    {" · "}
                    {t("scan.playlistPosition", {
                      current: playlistPosition,
                      total: playlist.total,
                    })}
                  </p>
                  {/* Playlist position is the only total Core reports for
                      every launcher, so it is the only honest determinate
                      bar here. */}
                  <div
                    role="progressbar"
                    aria-valuenow={playlistPosition}
                    aria-valuemin={0}
                    aria-valuemax={playlist.total}
                    aria-label={t("scan.playlistProgressLabel")}
                    className="border-bd-filled bg-background mt-1 h-[10px] w-full rounded-full border border-solid"
                  >
                    <div
                      className="border-background bg-button-pattern h-[8px] rounded-full border border-solid"
                      style={{
                        width: `${
                          playlist.total > 0
                            ? (
                                (playlistPosition / playlist.total) *
                                100
                              ).toFixed(2)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </>
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
      </Card>
    </section>
  );
}
