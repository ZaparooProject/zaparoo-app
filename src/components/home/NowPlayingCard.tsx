import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/wui/Card";
import { LibraryArtworkFrame } from "@/components/library/LibraryArtworkFrame";
import { LibraryMediaDetailsModal } from "@/components/library/LibraryMediaDetailsModal";
import { useMetadataDetailsReturn } from "@/hooks/useMetadataDetailsReturn";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { useHapticPress } from "@/hooks/useHapticPress";
import { useNowPlayingArtwork } from "@/hooks/useNowPlayingArtwork";
import { useSystemName } from "@/hooks/useSystemName";
import { CoreAPI } from "@/lib/coreApi";
import { LIBRARY_QUERY_KEYS } from "@/lib/libraryMedia";
import { filenameFromPath } from "@/lib/path";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useStatusStore } from "@/lib/store";
import { NextIcon } from "@/lib/images";
import type {
  MediaBrowseEntry,
  PlayingResponse,
  PlaylistState,
} from "@/lib/models";
import { NowPlayingPreferences } from "./NowPlayingPreferences";
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
  onPrevious: () => void;
  onToggle: () => void;
  onNext: () => void;
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
  onPrevious,
  onToggle,
  onNext,
  onPlaylistSelect,
  onReplayLast,
}: NowPlayingCardProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const deviceKey = useActiveDeviceKey();
  const showFilenames = usePreferencesStore((s) => s.showFilenames);
  const displaySystemName = useSystemName(media.systemId, media.systemName);
  const artwork = useNowPlayingArtwork(media);
  const handleHapticPress = useHapticPress();
  const returnOwner = `now-playing:${media.systemId}:${media.mediaPath}`;
  const detailsReturn = useMetadataDetailsReturn(returnOwner, deviceKey);
  // Details belong to the media they were opened for: when something else
  // starts playing they are closed, not carried over to the new media.
  const [detailsOwner, setDetailsOwner] = useState<string | null>(() =>
    detailsReturn.entry !== null ? returnOwner : null,
  );
  const detailsOpen = detailsOwner === returnOwner;
  const gamesIndexExists = useStatusStore((state) => state.gamesIndex.exists);
  const favoritesFeature = useCoreFeature("mediaFavorites", {
    requireKnownSupport: true,
  });

  const displayName =
    (showFilenames && media.mediaPath
      ? filenameFromPath(media.mediaPath) || media.mediaName
      : media.mediaName) ||
    (media.mediaPath ? filenameFromPath(media.mediaPath) : "");
  const canLoadMetadata = Boolean(
    connected &&
    gamesIndexExists &&
    favoritesFeature.available &&
    deviceKey &&
    media.systemId &&
    media.mediaPath,
  );
  const metadataQuery = useQuery({
    queryKey: [
      LIBRARY_QUERY_KEYS.meta,
      deviceKey,
      null,
      media.systemId,
      media.mediaPath,
    ],
    queryFn: ({ signal }) =>
      CoreAPI.mediaMeta(
        { system: media.systemId, path: media.mediaPath },
        signal,
      ),
    enabled: canLoadMetadata,
    refetchOnMount: "always",
    retry: false,
  });
  const hasDetails = metadataQuery.isSuccess && canLoadMetadata;
  const isIdle = displayName === "";
  const sectionLabel = headingLabel ?? t("scan.nowPlayingHeading");
  const isPlaying =
    !isIdle && (playlist ? playlist.playing : media.playbackState !== "paused");
  const artworkFrame = (
    <LibraryArtworkFrame
      entry={artwork}
      systemId={media.systemId}
      deviceKey={deviceKey}
      maxSize={256}
      priority="detail"
      className="now-playing-artwork"
    />
  );
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
          <div className="relative flex flex-row items-center gap-3">
            {artworkFrame}

            <div className="flex min-w-0 grow flex-col gap-0.5">
              {hasDetails ? (
                // One control for the whole summary: its hit area stretches
                // over the artwork instead of adding a second tab stop.
                <button
                  type="button"
                  className="focus-visible:ring-ring -my-3 inline-flex max-w-full items-center gap-1 self-start rounded-md py-3 text-left before:absolute before:inset-0 before:content-[''] focus-visible:ring-2 focus-visible:outline-none"
                  aria-label={`${t("library.details")}: ${displayName}`}
                  onPointerUp={handleHapticPress}
                  onClick={() => setDetailsOwner(returnOwner)}
                >
                  <span className="line-clamp-2 min-w-0 font-semibold">
                    {displayName}
                  </span>
                  <span
                    className="text-muted-foreground shrink-0"
                    aria-hidden="true"
                  >
                    <NextIcon size="16" />
                  </span>
                </button>
              ) : (
                <p className="line-clamp-2 font-semibold">{displayName}</p>
              )}
              {displaySystemName !== "" && (
                <p className="text-muted-foreground truncate text-sm">
                  {displaySystemName}
                </p>
              )}
              {canLoadMetadata && (
                <NowPlayingPreferences
                  key={`${deviceKey}:${media.systemId}:${media.mediaPath}`}
                  deviceKey={deviceKey}
                  systemId={media.systemId}
                  mediaPath={media.mediaPath}
                  mediaName={media.mediaName}
                  metadataTags={metadataQuery.data?.media?.tags}
                  ready={metadataQuery.isSuccess && !metadataQuery.isFetching}
                />
              )}
            </div>
          </div>
        )}

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
          onPrevious={onPrevious}
          onToggle={onToggle}
          onNext={onNext}
          onReplayLast={onReplayLast}
        />

        {playlist && playlist.items.length > 0 && onPlaylistSelect && (
          <PlaylistQueue
            playlist={playlist}
            connected={connected}
            onSelect={onPlaylistSelect}
          />
        )}
      </Card>
      {hasDetails && (
        <LibraryMediaDetailsModal
          isOpen={detailsOpen}
          close={() => {
            detailsReturn.forget();
            setDetailsOwner(null);
          }}
          entry={detailsOpen ? artwork : null}
          systemId={media.systemId}
          deviceKey={deviceKey}
          context="nowPlaying"
          returnOwner={returnOwner}
        />
      )}
    </section>
  );
}
