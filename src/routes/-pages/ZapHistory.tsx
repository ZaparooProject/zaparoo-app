import { useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { RefreshCwIcon } from "lucide-react";
import { PageFrame } from "@/components/PageFrame";
import { BackToTop } from "@/components/BackToTop";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { Button } from "@/components/wui/Button";
import { EmptyState } from "@/components/wui/EmptyState";
import { DelayedLoading } from "@/components/DelayedLoading";
import { InlineLoading } from "@/components/InlineLoading";
import { HistoryQueryState } from "@/components/home/HistoryQueryState";
import { ScanHistoryList } from "@/components/home/ScanHistoryList";
import { PlayedHistoryList } from "@/components/home/PlayedHistoryList";
import { LibraryMediaDetailsModal } from "@/components/library/LibraryMediaDetailsModal";
import { useReturnableMediaDetails } from "@/hooks/useReturnableMediaDetails";
import { entrySystemId } from "@/lib/libraryMedia";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { useHistoryReplay } from "@/hooks/useHistoryReplay";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { CoreAPI } from "@/lib/coreApi";
import { BackIcon } from "@/lib/images";
import { MEDIA_HISTORY_QUERY_KEYS } from "@/lib/mediaHistory";
import { useStatusStore } from "@/lib/store";

export function ScanHistory() {
  return <ZapHistory kind="scans" />;
}
export function PlayHistory() {
  return <ZapHistory kind="played" />;
}

function ZapHistory({ kind }: { kind: "scans" | "played" }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const title = t(
    kind === "scans" ? "scan.scanHistoryTitle" : "scan.playHistoryTitle",
  );
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(title);
  const scrollRef = useRef<HTMLDivElement>(null);
  const deviceKey = useActiveDeviceKey();
  const details = useReturnableMediaDetails("zap-play-history", deviceKey);
  const connected = useStatusStore((s) => s.connected);
  const versionPending = useStatusStore((s) => s.coreVersionPending);
  const feature = useCoreFeature("mediaRecents", { requireKnownSupport: true });
  const replay = useHistoryReplay();
  const enabled = connected && Boolean(deviceKey);
  const scans = useQuery({
    queryKey: ["history", deviceKey],
    queryFn: () => CoreAPI.history(),
    enabled: enabled && kind === "scans",
    refetchOnMount: "always",
  });
  const played = useInfiniteQuery({
    queryKey: [MEDIA_HISTORY_QUERY_KEYS.history, deviceKey, "sessions"],
    queryFn: ({ pageParam, signal }) =>
      CoreAPI.mediaHistory(
        { limit: 50, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) =>
      page.pagination?.hasNextPage
        ? (page.pagination.nextCursor ?? undefined)
        : undefined,
    enabled: enabled && kind === "played" && feature.available,
    refetchOnMount: "always",
  });
  const query = kind === "scans" ? scans : played;
  const entries = played.data?.pages.flatMap((page) => page.entries) ?? [];
  const goBack = () => void navigate({ to: "/", resetScroll: false });
  const unavailable = kind === "played" && !feature.available;
  const empty =
    kind === "scans" ? scans.data?.entries.length === 0 : entries.length === 0;
  return (
    <>
      <PageFrame
        headerMode="content-wide"
        breadcrumbs={[{ to: "/", label: t("nav.index") }]}
        layout="workspace"
        scrollRef={scrollRef}
        sessionScrollKey={`zap:${kind}:${deviceKey}`}
        onSwipeBack={goBack}
        headerLeft={
          <HeaderButton
            icon={<BackIcon size="24" />}
            aria-label={t("nav.back")}
            onClick={goBack}
          />
        }
        headerCenter={<h1 ref={headingRef}>{title}</h1>}
        headerRight={
          <HeaderButton
            icon={<RefreshCwIcon size={24} />}
            aria-label={t("scan.historyRefresh")}
            disabled={!enabled || unavailable || query.isFetching}
            onClick={() => void query.refetch()}
          />
        }
      >
        {enabled && kind === "played" && versionPending ? (
          <DelayedLoading>
            <InlineLoading />
          </DelayedLoading>
        ) : enabled && unavailable ? (
          <EmptyState
            title={t("library.updateCore")}
            description={t("features.requiresCoreVersion", {
              version: feature.requiredVersion,
            })}
          />
        ) : (
          <HistoryQueryState
            offline={!enabled}
            isPending={query.isPending}
            isError={query.isError}
            hasData={query.data !== undefined}
            isEmpty={empty}
            emptyTitle={t(
              kind === "scans"
                ? "scan.history.empty"
                : "scan.historyPlayedEmpty",
            )}
            onRetry={() => void query.refetch()}
          >
            {kind === "scans" ? (
              <ScanHistoryList
                entries={scans.data?.entries ?? []}
                connected={replay.available}
                flush
                onReplay={replay.replayScan}
              />
            ) : (
              <PlayedHistoryList
                entries={entries}
                launchAvailable={replay.available}
                flush
                onSelect={details.select}
                onLaunch={replay.launchMedia}
              />
            )}
            {kind === "played" && played.hasNextPage && (
              <Button
                className="mx-auto my-4"
                variant="outline"
                label={t("library.loadMore")}
                disabled={played.isFetchingNextPage}
                disabledAppearance="busy"
                onClick={() => void played.fetchNextPage()}
              />
            )}
          </HistoryQueryState>
        )}
        <BackToTop scrollContainerRef={scrollRef} threshold={200} />
      </PageFrame>
      {kind === "played" && (
        <LibraryMediaDetailsModal
          isOpen={details.entry !== null}
          close={() => details.select(null)}
          entry={details.entry}
          systemId={details.entry ? entrySystemId(details.entry) : ""}
          deviceKey={deviceKey}
          returnOwner="zap-play-history"
        />
      )}
    </>
  );
}
