import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Film,
  Gamepad2,
  Music2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { CoreAPI } from "@/lib/coreApi";
import { filenameFromPath } from "@/lib/path.ts";
import { usePreferencesStore } from "@/lib/preferencesStore.ts";
import { useSystemName } from "@/hooks/useSystemName";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { useHapticPress } from "@/hooks/useHapticPress";
import { useStatusStore } from "@/lib/store";
import { LIBRARY_QUERY_KEYS } from "@/lib/libraryMedia";
import { NextIcon } from "@/lib/images.tsx";
import type { MediaBrowseEntry, PlaylistState } from "@/lib/models";
import { LibraryArtwork } from "@/components/library/LibraryArtwork";
import { LibraryMediaDetailsModal } from "@/components/library/LibraryMediaDetailsModal";
import { Button } from "../wui/Button";
import { NowPlayingPreferences } from "./NowPlayingPreferences";

interface NowPlayingInfoProps {
  mediaName: string;
  mediaPath?: string;
  deviceKey?: string;
  systemName: string;
  systemId?: string;
  onStop: () => void;
  connected?: boolean;
  headingLabel?: string;
  stopButtonLabel?: string;
  playlist?: PlaylistState | null;
  canPausePlaylist?: boolean;
  onPlaylistPrevious?: () => void;
  onPlaylistToggle?: () => void;
  onPlaylistNext?: () => void;
}

export function NowPlayingInfo({
  mediaName,
  mediaPath,
  deviceKey = "",
  systemName,
  systemId = "",
  onStop,
  connected = true,
  headingLabel,
  stopButtonLabel,
  playlist,
  canPausePlaylist = false,
  onPlaylistPrevious,
  onPlaylistToggle,
  onPlaylistNext,
}: NowPlayingInfoProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const handleHapticPress = useHapticPress();
  const [detailsSelection, setDetailsSelection] = useState<{
    entry: MediaBrowseEntry;
    systemId: string;
    deviceKey: string;
  } | null>(null);
  const showFilenames = usePreferencesStore((s) => s.showFilenames);
  const displaySystemName = useSystemName(systemId, systemName);
  const gamesIndexExists = useStatusStore((state) => state.gamesIndex.exists);
  const favoritesFeature = useCoreFeature("mediaFavorites", {
    requireKnownSupport: true,
  });
  const canLoadMetadata = Boolean(
    connected &&
    gamesIndexExists &&
    favoritesFeature.available &&
    deviceKey &&
    systemId &&
    mediaPath,
  );
  const metadataQuery = useQuery({
    queryKey: [
      LIBRARY_QUERY_KEYS.meta,
      deviceKey,
      null,
      systemId,
      mediaPath ?? "",
    ],
    queryFn: ({ signal }) =>
      CoreAPI.mediaMeta({ system: systemId, path: mediaPath }, signal),
    enabled: canLoadMetadata,
    refetchOnMount: "always",
    retry: false,
  });
  const metadata = metadataQuery.data?.media;
  const activePlaylistItem = playlist?.items[playlist.index];
  const playlistItemName =
    activePlaylistItem?.name || activePlaylistItem?.zapScript || "";
  const displayName =
    (showFilenames && mediaPath
      ? filenameFromPath(mediaPath) || mediaName
      : mediaName) ||
    playlistItemName ||
    (mediaPath ? filenameFromPath(mediaPath) : "");
  const hasCurrentMedia = Boolean(displayName || playlist);
  const hasPlaylistControls = playlist && onPlaylistPrevious && onPlaylistNext;
  const entry: MediaBrowseEntry = {
    type: "media",
    systemId,
    name: mediaName,
    path: mediaPath ?? "",
  };
  const hasDetails = Boolean(
    metadataQuery.isSuccess && mediaPath && systemId && deviceKey,
  );
  const openDetails = () => setDetailsSelection({ entry, systemId, deviceKey });
  const artwork = (
    <LibraryArtwork
      key={`${deviceKey}:${systemId}:${mediaPath ?? ""}`}
      entry={entry}
      systemId={systemId}
      deviceKey={deviceKey}
      maxSize={192}
      priority="detail"
      enabled={canLoadMetadata && Boolean(metadata)}
      className="h-full w-full object-contain"
      alt=""
      placeholderIcon={
        systemId.toLowerCase() === "audio" ? (
          <Music2 size={24} />
        ) : systemId.toLowerCase() === "video" ? (
          <Film size={24} />
        ) : systemId ? (
          <Gamepad2 size={24} />
        ) : undefined
      }
    />
  );

  return (
    <section className="flex flex-col gap-2" aria-labelledby={headingId}>
      <div className="flex items-center justify-between">
        <h2 id={headingId} className="font-bold text-gray-400 capitalize">
          {headingLabel ?? t("scan.nowPlayingHeading")}
        </h2>
        <Button
          icon={<Square size={20} fill="currentColor" />}
          variant="text"
          size="lg"
          disabled={!connected || !hasCurrentMedia}
          onClick={onStop}
          aria-label={stopButtonLabel ?? t("scan.stopPlayingButton")}
        />
      </div>
      {hasCurrentMedia ? (
        <>
          <div className="flex items-start gap-3">
            {hasDetails ? (
              <button
                type="button"
                className="h-24 w-20 shrink-0 overflow-hidden rounded-md focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
                aria-label={`${t("library.details")}: ${t("library.imageAlt", { title: displayName, type: t("library.imageTypes.artwork") })}`}
                onPointerUp={handleHapticPress}
                onClick={openDetails}
              >
                {artwork}
              </button>
            ) : (
              <div className="h-24 w-20 shrink-0 overflow-hidden rounded-md">
                {artwork}
              </div>
            )}
            <div className="flex min-h-24 min-w-0 flex-1 flex-col">
              {hasDetails ? (
                <button
                  type="button"
                  className="inline-flex max-w-full items-center gap-1 self-start rounded-md text-left focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
                  aria-label={`${t("library.details")}: ${displayName}`}
                  onPointerUp={handleHapticPress}
                  onClick={openDetails}
                >
                  <span className="min-w-0 font-semibold break-words">
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
                <p className="font-semibold break-words">
                  {displayName || playlist?.name || playlist?.id}
                </p>
              )}
              {displaySystemName && (
                <p className="text-muted-foreground text-sm">
                  {displaySystemName}
                </p>
              )}
              {canLoadMetadata && (
                <NowPlayingPreferences
                  key={`${deviceKey}:${systemId}:${mediaPath}`}
                  deviceKey={deviceKey}
                  systemId={systemId}
                  mediaPath={mediaPath ?? ""}
                  mediaName={mediaName}
                  metadataTags={metadata?.tags}
                  ready={metadataQuery.isSuccess && !metadataQuery.isFetching}
                />
              )}
            </div>
          </div>
          {playlist && (
            <div className="text-muted-foreground text-sm">
              <p>
                {t("scan.playlistName", {
                  playlist: playlist.name || playlist.id,
                })}
              </p>
              <p>
                {t("scan.playlistPosition", {
                  current: playlist.total > 0 ? playlist.index + 1 : 0,
                  total: playlist.total,
                })}
              </p>
            </div>
          )}
          {hasPlaylistControls && (
            <div
              className="flex items-center gap-1"
              role="group"
              aria-label={t("scan.playlistControls", {
                section: headingLabel ?? t("scan.nowPlayingHeading"),
              })}
            >
              <Button
                icon={<SkipBack size={20} fill="currentColor" />}
                variant="text"
                size="lg"
                disabled={!connected || playlist.total < 2}
                onClick={onPlaylistPrevious}
                aria-label={t("scan.playlistPrevious")}
              />
              {onPlaylistToggle && (!playlist.playing || canPausePlaylist) && (
                <Button
                  icon={
                    playlist.playing ? (
                      <Pause size={20} fill="currentColor" />
                    ) : (
                      <Play size={20} fill="currentColor" />
                    )
                  }
                  variant="text"
                  size="lg"
                  disabled={!connected}
                  onClick={onPlaylistToggle}
                  aria-label={
                    playlist.playing
                      ? t("scan.playlistPause")
                      : t("scan.playlistPlay")
                  }
                />
              )}
              <Button
                icon={<SkipForward size={20} fill="currentColor" />}
                variant="text"
                size="lg"
                disabled={!connected || playlist.total < 2}
                onClick={onPlaylistNext}
                aria-label={t("scan.playlistNext")}
              />
            </div>
          )}
        </>
      ) : (
        <p className="text-muted-foreground">{t("scan.nothingPlaying")}</p>
      )}
      {(hasDetails || detailsSelection) && (
        <LibraryMediaDetailsModal
          isOpen={detailsSelection !== null}
          close={() => setDetailsSelection(null)}
          entry={detailsSelection?.entry ?? null}
          systemId={detailsSelection?.systemId ?? systemId}
          deviceKey={detailsSelection?.deviceKey ?? deviceKey}
          context="nowPlaying"
        />
      )}
    </section>
  );
}
