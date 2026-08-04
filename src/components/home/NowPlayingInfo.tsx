import { useId } from "react";
import { Pause, Play, SkipBack, SkipForward, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import { filenameFromPath } from "@/lib/path.ts";
import { usePreferencesStore } from "@/lib/preferencesStore.ts";
import type { PlaylistState } from "@/lib/models";
import { Button } from "../wui/Button";

interface NowPlayingInfoProps {
  mediaName: string;
  mediaPath?: string;
  systemName: string;
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
  systemName,
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
  const showFilenames = usePreferencesStore((s) => s.showFilenames);

  const activePlaylistItem = playlist?.items[playlist.index];
  const playlistItemName =
    activePlaylistItem?.name || activePlaylistItem?.zapScript || "";
  const displayName =
    (showFilenames && mediaPath
      ? filenameFromPath(mediaPath) || mediaName
      : mediaName) || playlistItemName;
  const hasPlaylistControls = playlist && onPlaylistPrevious && onPlaylistNext;

  return (
    <section className="p-3" aria-labelledby={headingId}>
      <div className="flex flex-row items-center justify-between">
        <h2 id={headingId} className="font-bold text-gray-400 capitalize">
          {headingLabel ?? t("scan.nowPlayingHeading")}
        </h2>
        {hasPlaylistControls ? (
          <div
            className="flex shrink-0 flex-row items-center gap-1"
            role="group"
            aria-label={t("scan.playlistControls", {
              section: headingLabel ?? t("scan.nowPlayingHeading"),
            })}
          >
            <Button
              icon={<SkipBack size={20} fill="currentColor" />}
              variant="text"
              size="sm"
              disabled={!connected || playlist.total < 2}
              onClick={onPlaylistPrevious}
              aria-label={t("scan.playlistPrevious")}
            />
            <Button
              icon={<Square size={20} fill="currentColor" />}
              variant="text"
              size="sm"
              disabled={!connected}
              onClick={onStop}
              aria-label={stopButtonLabel ?? t("scan.stopPlayingButton")}
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
                size="sm"
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
              size="sm"
              disabled={!connected || playlist.total < 2}
              onClick={onPlaylistNext}
              aria-label={t("scan.playlistNext")}
            />
          </div>
        ) : (
          <Button
            icon={<Square size={20} fill="currentColor" />}
            variant="text"
            size="sm"
            disabled={!connected || !mediaName}
            onClick={onStop}
            aria-label={stopButtonLabel ?? t("scan.stopPlayingButton")}
          />
        )}
      </div>
      <div>
        <p>
          {t("scan.nowPlayingName", { game: "" })}
          <span>{displayName === "" ? t("none") : displayName}</span>
        </p>
        <p>
          {t("scan.nowPlayingSystem", { system: "" })}
          <span>{systemName === "" ? t("none") : systemName}</span>
        </p>
        {playlist && (
          <>
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
          </>
        )}
      </div>
    </section>
  );
}
