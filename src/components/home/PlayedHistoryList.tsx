import { useTranslation } from "react-i18next";
import { HistoryListRow } from "@/components/HistoryListRow";
import { LibraryArtworkFrame } from "@/components/library/LibraryArtworkFrame";
import { Button } from "@/components/wui/Button";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useSystemName } from "@/hooks/useSystemName";
import { historyEntryToBrowseEntry } from "@/lib/mediaHistory";
import type { MediaBrowseEntry, MediaHistoryEntry } from "@/lib/models";
import { PlayIcon } from "@/lib/images";
import { formatAppDateTime } from "@/lib/formatDate";

function PlayedHistoryRow({
  entry,
  connected,
  flush,
  onLaunch,
  onSelect,
}: {
  entry: MediaHistoryEntry;
  connected: boolean;
  flush?: boolean;
  onSelect?: (entry: MediaBrowseEntry) => void;
  onLaunch: (entry: MediaHistoryEntry) => void;
}) {
  const { t } = useTranslation();
  const deviceKey = useActiveDeviceKey();
  const systemName = useSystemName(entry.systemId, entry.systemName);
  const browseEntry = historyEntryToBrowseEntry(entry);

  return (
    <HistoryListRow
      flush={flush}
      onSelect={onSelect ? () => onSelect(browseEntry) : undefined}
      selectLabel={t("scan.coverRowDetails", { media: entry.mediaName })}
      leading={
        <LibraryArtworkFrame
          entry={browseEntry}
          systemId={entry.systemId}
          deviceKey={deviceKey}
          maxSize={128}
          priority="thumbnail"
          compact
          className="size-12"
        />
      }
      title={<span className="truncate">{entry.mediaName}</span>}
      meta={
        <p>
          {systemName}
          {" · "}
          {formatAppDateTime(entry.startedAt)}
        </p>
      }
      action={
        <Button
          icon={<PlayIcon size="20" />}
          variant="ghost"
          size="sm"
          aria-label={t("scan.coverRowLaunch", { game: entry.mediaName })}
          disabled={!connected}
          onClick={() => onLaunch(entry)}
        />
      }
    />
  );
}

interface PlayedHistoryListProps {
  entries: MediaHistoryEntry[];
  /** A launch can reach a live Core session right now. */
  launchAvailable: boolean;
  /** Page presentation: rows align with the page title. */
  flush?: boolean;
  /** Opens the shared game details for a row's artwork and title. */
  onSelect?: (entry: MediaBrowseEntry) => void;
  onLaunch: (entry: MediaHistoryEntry) => void;
}

export function PlayedHistoryList({
  entries,
  launchAvailable,
  flush,
  onSelect,
  onLaunch,
}: PlayedHistoryListProps) {
  return (
    <ul>
      {entries.map((entry, index) => (
        <PlayedHistoryRow
          key={`${entry.systemId}:${entry.mediaPath}:${index}`}
          entry={entry}
          connected={launchAvailable}
          flush={flush}
          onSelect={onSelect}
          onLaunch={onLaunch}
        />
      ))}
    </ul>
  );
}
