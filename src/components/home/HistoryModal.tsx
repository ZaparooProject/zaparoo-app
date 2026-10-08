import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
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
import { SlideModal } from "../SlideModal";
import { PlayedHistoryList } from "./PlayedHistoryList";
import { ScanHistoryList } from "./ScanHistoryList";

type HistoryTab = "scans" | "played";

const SCANS_TAB_ID = "history-scans";
const PLAYED_TAB_ID = "history-played";

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  historyData: HistoryResponse | undefined;
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
          <ScanHistoryList
            entries={historyData.entries ?? []}
            connected={connected}
            onReplay={replayScan}
          />
        )}
      </div>
    </SlideModal>
  );
});
