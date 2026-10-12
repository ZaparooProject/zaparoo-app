import { useTranslation } from "react-i18next";
import { HistoryListRow } from "@/components/HistoryListRow";
import { LibraryArtworkFrame } from "@/components/library/LibraryArtworkFrame";
import { Button } from "@/components/wui/Button";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useSystemName } from "@/hooks/useSystemName";
import { historyEntryToBrowseEntry } from "@/lib/mediaHistory";
import type { MediaHistoryEntry } from "@/lib/models";
import { PlayIcon } from "@/lib/images";
import { formatAppDateTime } from "@/lib/formatDate";

function PlayedHistoryRow({
  entry,
  connected,
  onLaunch,
}: {
  entry: MediaHistoryEntry;
  connected: boolean;
  onLaunch: (entry: MediaHistoryEntry) => void;
}) {
  const { t } = useTranslation();
  const deviceKey = useActiveDeviceKey();
  const systemName = useSystemName(entry.systemId, entry.systemName);

  return (
    <HistoryListRow
      leading={
        <LibraryArtworkFrame
          entry={historyEntryToBrowseEntry(entry)}
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
        <p className="truncate">
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
  onLaunch: (entry: MediaHistoryEntry) => void;
}

export function PlayedHistoryList({
  entries,
  launchAvailable,
  onLaunch,
}: PlayedHistoryListProps) {
  return (
    <ul>
      {entries.map((entry, index) => (
        <PlayedHistoryRow
          key={`${entry.systemId}:${entry.mediaPath}:${index}`}
          entry={entry}
          connected={launchAvailable}
          onLaunch={onLaunch}
        />
      ))}
    </ul>
  );
}
