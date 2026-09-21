import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { PlayIcon } from "lucide-react";
import { Button } from "@/components/wui/Button";
import { EmptyState } from "@/components/wui/EmptyState";
import { TabBar } from "@/components/wui/TabBar";
import { getTabBarPanelId } from "@/components/wui/tabBarIds";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { CoreAPI, logRunFailure } from "@/lib/coreApi";
import { satisfies as versionSatisfies } from "@/lib/coreVersion";
import {
  dedupeHistoryByMedia,
  historyPageLimit,
  MEDIA_HISTORY_QUERY_KEYS,
} from "@/lib/mediaHistory";
import type { HistoryResponse, HistoryResponseEntry } from "@/lib/models";
import { useStatusStore } from "@/lib/store";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import { CopyButton } from "../CopyButton";
import { SlideModal } from "../SlideModal";
import { HistoryListRow } from "./HistoryListRow";
import { PlayedHistoryList } from "./PlayedHistoryList";

type HistoryTab = "scans" | "played";

const SCANS_TAB_ID = "history-scans";
const PLAYED_TAB_ID = "history-played";

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  historyData: HistoryResponse | undefined;
}

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
            <CopyButton text={copyValue} className="mt-0.5 shrink-0" />
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
            <CopyButton text={item.uid} className="shrink-0" />
          </div>
        ) : undefined
      }
      action={
        <Button
          icon={<PlayIcon size={20} />}
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

export const HistoryModal = memo(function HistoryModal({
  isOpen,
  onClose,
  historyData,
}: HistoryModalProps) {
  const { t } = useTranslation();
  const connected = useStatusStore((state) => state.connected);
  const coreVersion = useStatusStore((state) => state.coreVersion);
  const deviceKey = useActiveDeviceKey();
  const [tab, setTab] = useState<HistoryTab>("scans");
  const recentsFeature = useCoreFeature("mediaRecents", {
    requireKnownSupport: true,
  });
  // Without play history there is only one list, so tabs would be furniture.
  const showTabs = recentsFeature.available;

  const coreDedupes =
    coreVersion !== null && versionSatisfies(coreVersion, "2.17.0");
  const playedQuery = useQuery({
    queryKey: [MEDIA_HISTORY_QUERY_KEYS.history, deviceKey, "played"],
    queryFn: ({ signal }) =>
      CoreAPI.mediaHistory(
        {
          limit: historyPageLimit(50, coreDedupes),
          distinctMedia: true,
        },
        signal,
      ),
    // Start alongside scan history so switching tabs does not introduce a
    // second visible loading phase.
    enabled: isOpen && showTabs && connected,
    staleTime: 30_000,
  });
  const playedEntries = dedupeHistoryByMedia(
    playedQuery.data?.entries ?? [],
    50,
  );

  const replayScan = (item: HistoryResponseEntry) => {
    void CoreAPI.run({
      type: item.type,
      uid: item.uid,
      text: item.text,
      data: item.data,
    }).catch((error) => {
      logRunFailure("Failed to replay scan", error, { action: "replayScan" });
      showRateLimitedErrorToast(t("scan.historyReplayError"));
    });
  };

  const isEmpty = historyData?.entries?.length === 0;
  const activeTabId = tab === "scans" ? SCANS_TAB_ID : PLAYED_TAB_ID;

  return (
    <SlideModal
      isOpen={isOpen}
      close={onClose}
      title={t("scan.historyTitle")}
      fixedHeight="70vh"
    >
      {showTabs && (
        <div className="px-2 pt-1 pb-3">
          <TabBar
            role="tab"
            label={t("scan.historyTabs")}
            options={[
              {
                value: "scans",
                label: t("scan.historyTabScans"),
                id: SCANS_TAB_ID,
              },
              {
                value: "played",
                label: t("scan.historyTabPlayed"),
                id: PLAYED_TAB_ID,
              },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      )}

      <div
        role={showTabs ? "tabpanel" : undefined}
        id={showTabs ? getTabBarPanelId(activeTabId) : undefined}
        aria-labelledby={showTabs ? activeTabId : undefined}
      >
        {tab === "played" ? (
          <PlayedHistoryList
            entries={playedEntries}
            isPending={playedQuery.isPending}
            connected={connected}
          />
        ) : historyData === undefined ? (
          <p className="text-muted-foreground p-3">{t("loading")}</p>
        ) : isEmpty ? (
          <EmptyState title={t("scan.history.empty")} />
        ) : (
          <ul>
            {historyData.entries?.map((item, index) => (
              <ScanHistoryRow
                key={`${item.time}:${item.type}:${item.uid}:${index}`}
                item={item}
                connected={connected}
                onReplay={replayScan}
              />
            ))}
          </ul>
        )}
      </div>
    </SlideModal>
  );
});
