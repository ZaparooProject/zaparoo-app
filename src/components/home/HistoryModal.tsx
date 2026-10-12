import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { TabBar } from "@/components/wui/TabBar";
import { getTabBarPanelId } from "@/components/wui/tabBarIds";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { useHistoryReplay } from "@/hooks/useHistoryReplay";
import { CoreAPI } from "@/lib/coreApi";
import {
  dedupeHistoryByMedia,
  historyPageLimit,
  MEDIA_HISTORY_QUERY_KEYS,
} from "@/lib/mediaHistory";
import type { HistoryResponse } from "@/lib/models";
import { useStatusStore } from "@/lib/store";
import { SlideModal } from "../SlideModal";
import { HistoryQueryState } from "./HistoryQueryState";
import { PlayedHistoryList } from "./PlayedHistoryList";
import { ScanHistoryList } from "./ScanHistoryList";

type HistoryTab = "scans" | "played";

const SCANS_TAB_ID = "history-scans";
const PLAYED_TAB_ID = "history-played";

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  historyData: HistoryResponse | undefined;
  /** The scan history request failed. */
  historyError?: boolean;
  onRetryHistory?: () => unknown;
}

export const HistoryModal = memo(function HistoryModal({
  isOpen,
  onClose,
  historyData,
  historyError = false,
  onRetryHistory,
}: HistoryModalProps) {
  const { t } = useTranslation();
  const connected = useStatusStore((state) => state.connected);
  const deviceKey = useActiveDeviceKey();
  const [tab, setTab] = useState<HistoryTab>("scans");
  const replay = useHistoryReplay();
  const recentsFeature = useCoreFeature("mediaRecents", {
    requireKnownSupport: true,
  });
  // Without play history there is only one list, so tabs would be furniture.
  const showTabs = recentsFeature.available;

  const coreDedupes = useCoreFeature("mediaHistoryDistinct", {
    requireKnownSupport: true,
  }).available;
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

  const activeTabId = tab === "scans" ? SCANS_TAB_ID : PLAYED_TAB_ID;

  return (
    <SlideModal
      isOpen={isOpen}
      close={onClose}
      title={t("scan.historyTitle")}
      fixedHeight="70vh"
    >
      {showTabs && (
        <div className="pt-1 pb-3">
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
          <HistoryQueryState
            offline={!connected && playedQuery.data === undefined}
            isPending={playedQuery.isPending}
            isError={playedQuery.isError}
            hasData={playedQuery.data !== undefined}
            isEmpty={playedEntries.length === 0}
            emptyTitle={t("scan.historyPlayedEmpty")}
            onRetry={() => void playedQuery.refetch()}
          >
            <PlayedHistoryList
              entries={playedEntries}
              launchAvailable={replay.available}
              onLaunch={replay.launchMedia}
            />
          </HistoryQueryState>
        ) : (
          <HistoryQueryState
            offline={!connected && historyData === undefined}
            isPending={historyData === undefined}
            isError={historyError}
            hasData={historyData !== undefined}
            isEmpty={historyData?.entries.length === 0}
            emptyTitle={t("scan.history.empty")}
            onRetry={() => void onRetryHistory?.()}
          >
            <ScanHistoryList
              entries={historyData?.entries ?? []}
              connected={replay.available}
              onReplay={replay.replayScan}
            />
          </HistoryQueryState>
        )}
      </div>
    </SlideModal>
  );
});
