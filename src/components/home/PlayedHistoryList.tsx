import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { PlayIcon } from "lucide-react";
import { LibraryArtworkFrame } from "@/components/library/LibraryArtworkFrame";
import { Button } from "@/components/wui/Button";
import { EmptyState } from "@/components/wui/EmptyState";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useSystemName } from "@/hooks/useSystemName";
import { CoreAPI, logRunFailure } from "@/lib/coreApi";
import { historyEntryToBrowseEntry } from "@/lib/mediaHistory";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import type { MediaHistoryEntry } from "@/lib/models";
import { HistoryListRow } from "./HistoryListRow";

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
          {new Date(entry.startedAt).toLocaleString()}
        </p>
      }
      action={
        <Button
          icon={<PlayIcon size={20} />}
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
  isPending: boolean;
  connected: boolean;
}

export function PlayedHistoryList({
  entries,
  isPending,
  connected,
}: PlayedHistoryListProps) {
  const { t } = useTranslation();
  // A ref, not state: a second tap must be rejected before React re-renders.
  const launchingRef = useRef(false);

  if (!connected) {
    return <EmptyState title={t("settings.notConnected")} />;
  }
  if (isPending) {
    return <p className="text-muted-foreground p-2">{t("loading")}</p>;
  }
  if (entries.length === 0) {
    return <EmptyState title={t("scan.historyPlayedEmpty")} />;
  }

  const launch = (entry: MediaHistoryEntry) => {
    if (launchingRef.current) return;
    launchingRef.current = true;
    // History rows are indexed media, so the stored path is the launch text.
    void CoreAPI.run({ text: entry.mediaPath })
      .catch((error) => {
        logRunFailure("Failed to replay played media", error, {
          action: "replayPlayedMedia",
        });
        showRateLimitedErrorToast(t("scan.coverRowLaunchError"));
      })
      .finally(() => {
        launchingRef.current = false;
      });
  };

  return (
    <ul>
      {entries.map((entry, index) => (
        <PlayedHistoryRow
          key={`${entry.systemId}:${entry.mediaPath}:${index}`}
          entry={entry}
          connected={connected}
          onLaunch={launch}
        />
      ))}
    </ul>
  );
}
