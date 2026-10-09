import { useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { RefreshCwIcon } from "lucide-react";
import { PageFrame } from "@/components/PageFrame";
import { PageParentLink } from "@/components/PageParentLink";
import { BackToTop } from "@/components/BackToTop";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { Button } from "@/components/wui/Button";
import { EmptyState } from "@/components/wui/EmptyState";
import { DelayedLoading } from "@/components/DelayedLoading";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ScanHistoryList } from "@/components/home/ScanHistoryList";
import { PlayedHistoryList } from "@/components/home/PlayedHistoryList";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { useLiveCoreControls } from "@/hooks/useLiveCoreControls";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { CoreAPI, logRunFailure } from "@/lib/coreApi";
import { BackIcon } from "@/lib/images";
import { MEDIA_HISTORY_QUERY_KEYS } from "@/lib/mediaHistory";
import { useStatusStore } from "@/lib/store";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";

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
  const connected = useStatusStore((s) => s.connected);
  const versionPending = useStatusStore((s) => s.coreVersionPending);
  const feature = useCoreFeature("mediaRecents", { requireKnownSupport: true });
  const requestRef = useRef<symbol | null>(null);
  const controls = useLiveCoreControls(() => {
    requestRef.current = null;
  });
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
  const replay = (params: Parameters<typeof CoreAPI.run>[0]) => {
    const target = controls.captureTarget();
    if (!target || requestRef.current) return;
    const request = Symbol();
    requestRef.current = request;
    void CoreAPI.run(params)
      .catch((error) => {
        if (!controls.isCurrentTarget(target)) return;
        logRunFailure("Failed to replay history", error, {
          action: "replayHistory",
        });
        showRateLimitedErrorToast(
          t(
            kind === "scans"
              ? "scan.historyReplayError"
              : "scan.coverRowLaunchError",
          ),
        );
      })
      .finally(() => {
        if (requestRef.current === request) requestRef.current = null;
      });
  };
  const loading = (
    <DelayedLoading>
      <div
        className="text-muted-foreground flex items-center justify-center gap-2 py-8"
        role="status"
      >
        <LoadingSpinner size={16} decorative />
        <span>{t("loading")}</span>
      </div>
    </DelayedLoading>
  );
  const unavailable = kind === "played" && !feature.available;
  const empty =
    kind === "scans" ? scans.data?.entries.length === 0 : entries.length === 0;
  return (
    <PageFrame
      headerMode="content-wide"
      headerParent={<PageParentLink to="/" label={t("nav.index")} />}
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
      {!enabled ? (
        <EmptyState title={t("settings.notConnected")} />
      ) : kind === "played" && versionPending ? (
        loading
      ) : unavailable ? (
        <EmptyState
          title={t("library.updateCore")}
          description={t("features.requiresCoreVersion", {
            version: feature.requiredVersion,
          })}
        />
      ) : query.isPending ? (
        loading
      ) : query.isError && !query.data ? (
        <EmptyState
          title={t("scan.historyLoadError")}
          action={
            <Button
              variant="outline"
              label={t("scan.retry")}
              onClick={() => void query.refetch()}
            />
          }
        />
      ) : (
        <>
          {query.isError && (
            <p role="alert" className="text-error mb-3 text-sm">
              {t("scan.historyLoadError")}
            </p>
          )}
          {empty ? (
            <EmptyState
              title={t(
                kind === "scans"
                  ? "scan.history.empty"
                  : "scan.historyPlayedEmpty",
              )}
            />
          ) : kind === "scans" ? (
            <ScanHistoryList
              entries={scans.data?.entries ?? []}
              connected={controls.available}
              onReplay={(item) =>
                replay({
                  type: item.type,
                  uid: item.uid,
                  text: item.text,
                  data: item.data,
                })
              }
            />
          ) : (
            <PlayedHistoryList
              entries={entries}
              connected={connected}
              launchAvailable={controls.available}
              isPending={false}
              onLaunch={(item) => replay({ text: item.mediaPath })}
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
        </>
      )}
      <BackToTop scrollContainerRef={scrollRef} threshold={200} />
    </PageFrame>
  );
}
