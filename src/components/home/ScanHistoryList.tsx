import { useTranslation } from "react-i18next";
import { Button } from "@/components/wui/Button";
import { CopyButton } from "@/components/CopyButton";
import { HistoryListRow } from "@/components/HistoryListRow";
import { PlayIcon } from "@/lib/images";
import type { HistoryResponseEntry } from "@/lib/models";

function ScanHistoryRow({
  item,
  connected,
  onReplay,
}: {
  item: HistoryResponseEntry;
  connected: boolean;
  onReplay: (item: HistoryResponseEntry) => void;
}) {
  const { t } = useTranslation();
  const visibleUid = item.uid !== "" && item.uid !== "__api__";
  const primaryValue =
    item.text ||
    (visibleUid ? item.uid : "") ||
    item.data ||
    t("scan.historyUnknown");
  const copyValue =
    item.text || (visibleUid ? item.uid : "") || item.data || null;
  const showUidDetail = visibleUid && item.text !== "";

  return (
    <HistoryListRow
      title={
        <>
          <span className="min-w-0 break-all">{primaryValue}</span>
          {copyValue && (
            <CopyButton
              text={copyValue}
              className="shrink-0 translate-y-0 self-center"
            />
          )}
        </>
      }
      meta={
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {!item.success && (
            <>
              <span className="text-error font-medium">
                {t("scan.historyFailed")}
              </span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>{new Date(item.time).toLocaleString()}</span>
        </div>
      }
      details={
        showUidDetail ? (
          <div className="flex items-start gap-1">
            <span className="break-all">
              {t("scan.lastScannedUid", { uid: item.uid })}
            </span>
            <CopyButton
              text={item.uid}
              className="shrink-0 translate-y-0 self-center"
            />
          </div>
        ) : undefined
      }
      action={
        <Button
          icon={<PlayIcon size="20" />}
          variant="ghost"
          size="sm"
          aria-label={t("scan.historyReplay")}
          disabled={
            !connected ||
            (item.uid === "" && item.text === "" && item.data === "")
          }
          onClick={() => onReplay(item)}
        />
      }
    />
  );
}

export function ScanHistoryList({
  entries,
  connected,
  onReplay,
}: {
  entries: HistoryResponseEntry[];
  connected: boolean;
  onReplay: (entry: HistoryResponseEntry) => void;
}) {
  return (
    <ul>
      {entries.map((item, index) => (
        <ScanHistoryRow
          key={`${item.time}:${item.type}:${item.uid}:${index}`}
          item={item}
          connected={connected}
          onReplay={onReplay}
        />
      ))}
    </ul>
  );
}
