import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useBackButtonHandler } from "@/hooks/useBackButtonHandler";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { CoreAPI } from "@/lib/coreApi";
import { satisfies as versionSatisfies } from "@/lib/coreVersion";
import { entrySystemId } from "@/lib/libraryMedia";
import { formatDurationDisplay } from "@/lib/utils";
import {
  dedupeHistoryByMedia,
  historyEntryToBrowseEntry,
  historyPageLimit,
  MEDIA_HISTORY_QUERY_KEYS,
  topEntryToBrowseEntry,
} from "@/lib/mediaHistory";
import type { MediaBrowseEntry } from "@/lib/models";
import { useStatusStore } from "@/lib/store";
import { BackIcon } from "@/lib/images";
import { PageFrame } from "@/components/PageFrame";
import { BackToTop } from "@/components/BackToTop";
import { DelayedLoading } from "@/components/DelayedLoading";
import { EmptyState } from "@/components/wui/EmptyState";
import { Button } from "@/components/wui/Button";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { LibraryBrowseList } from "@/components/library/LibraryBrowseList";
import { LibraryMediaDetailsModal } from "@/components/library/LibraryMediaDetailsModal";

const PAGE_SIZE = 100;

const HISTORY_COLLECTIONS = {
  recent: {
    title: "library.recentlyPlayed",
    list: "library.recentlyPlayedList",
    loading: "library.loadingRecentlyPlayed",
    error: "library.recentlyPlayedError",
    empty: "library.noRecentlyPlayed",
    hint: "library.noRecentlyPlayedHint",
  },
  top: {
    title: "library.topPlayed",
    list: "library.topPlayedList",
    loading: "library.loadingTopPlayed",
    error: "library.topPlayedError",
    empty: "library.noTopPlayed",
    hint: "library.noTopPlayedHint",
  },
} as const;

export type LibraryHistoryCollectionKind = keyof typeof HISTORY_COLLECTIONS;

export function LibraryHistoryCollection({
  kind,
}: {
  kind: LibraryHistoryCollectionKind;
}) {
  const config = HISTORY_COLLECTIONS[kind];
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(t(config.title));
  const connected = useStatusStore((state) => state.connected);
  const coreVersion = useStatusStore((state) => state.coreVersion);
  const coreVersionPending = useStatusStore(
    (state) => state.coreVersionPending,
  );
  const deviceKey = useActiveDeviceKey();
  const [selectedEntry, setSelectedEntry] = useState<MediaBrowseEntry | null>(
    null,
  );
  const historyFeature = useCoreFeature("mediaRecents", {
    requireKnownSupport: true,
  });
  const enabled = connected && historyFeature.available && deviceKey !== "";
  // Core only collapses repeat sessions from 2.17; older versions need a
  // wider page and a local collapse.
  const coreDedupes =
    coreVersion !== null && versionSatisfies(coreVersion, "2.17.0");

  const recentQuery = useInfiniteQuery({
    queryKey: [MEDIA_HISTORY_QUERY_KEYS.history, deviceKey, "collection"],
    queryFn: ({ pageParam, signal }) =>
      CoreAPI.mediaHistory(
        {
          limit: historyPageLimit(PAGE_SIZE, coreDedupes),
          distinctMedia: true,
          ...(pageParam ? { cursor: pageParam } : {}),
        },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pagination?.hasNextPage
        ? (lastPage.pagination.nextCursor ?? undefined)
        : undefined,
    enabled: enabled && kind === "recent",
    staleTime: 30_000,
    refetchOnMount: "always",
  });
  const topQuery = useQuery({
    queryKey: [MEDIA_HISTORY_QUERY_KEYS.history, deviceKey, "top"],
    queryFn: ({ signal }) =>
      CoreAPI.mediaHistoryTop({ limit: PAGE_SIZE }, signal),
    enabled: enabled && kind === "top",
    staleTime: 30_000,
    refetchOnMount: "always",
  });
  const query = kind === "recent" ? recentQuery : topQuery;

  const { entries, details } = useMemo(() => {
    const entries: MediaBrowseEntry[] = [];
    const details = new Map<MediaBrowseEntry, string>();
    if (kind === "recent") {
      for (const item of dedupeHistoryByMedia(
        recentQuery.data?.pages.flatMap((page) => page.entries) ?? [],
        Infinity,
      )) {
        const entry = historyEntryToBrowseEntry(item);
        entries.push(entry);
        details.set(entry, new Date(item.startedAt).toLocaleString());
      }
    } else {
      for (const item of topQuery.data?.entries ?? []) {
        const entry = topEntryToBrowseEntry(item);
        entries.push(entry);
        details.set(entry, formatDurationDisplay(`${item.totalPlayTime}s`));
      }
    }
    return { entries, details };
  }, [kind, recentQuery.data?.pages, topQuery.data?.entries]);

  const goBack = useCallback(() => {
    setSelectedEntry(null);
    void navigate({ to: "/library", resetScroll: false });
  }, [navigate]);
  const handleBackButton = useCallback(() => {
    goBack();
    return true;
  }, [goBack]);
  useBackButtonHandler(`library-${kind}`, handleBackButton);

  const loadingContent = (
    <DelayedLoading>
      <div className="text-muted-foreground flex items-center justify-center gap-2 py-8">
        <LoadingSpinner size={16} className="text-primary" />
        <span>{t(config.loading)}</span>
      </div>
    </DelayedLoading>
  );

  let content: ReactNode;
  if (!connected) {
    content = <EmptyState title={t("library.disconnected")} />;
  } else if (coreVersionPending) {
    content = loadingContent;
  } else if (!historyFeature.available) {
    content = (
      <EmptyState
        title={t("library.updateCore")}
        description={t("features.requiresCoreVersion", {
          version: historyFeature.requiredVersion,
        })}
      />
    );
  } else if (query.isLoading) {
    content = loadingContent;
  } else if (query.isError) {
    content = (
      <EmptyState
        title={t(config.error)}
        action={
          <Button
            label={t("library.tryAgain")}
            variant="outline"
            onClick={() => void query.refetch()}
          />
        }
      />
    );
  } else if (entries.length === 0) {
    content = (
      <EmptyState title={t(config.empty)} description={t(config.hint)} />
    );
  } else {
    // Rows centre their artwork with a 16px inset; cancel it so artwork sits at the
    // standard page inset. Same for every collection page.
    content = (
      <div className="-mt-4">
        <LibraryBrowseList
          entries={entries}
          systemId=""
          deviceKey={deviceKey}
          scrollRef={scrollRef}
          hasNextPage={kind === "recent" && Boolean(recentQuery.hasNextPage)}
          isFetchingNextPage={
            kind === "recent" && recentQuery.isFetchingNextPage
          }
          imagesPaused={false}
          interactionDisabled={false}
          onFetchMore={() => void recentQuery.fetchNextPage()}
          onSelect={setSelectedEntry}
          showSystemName
          entryDetail={(entry) => details.get(entry)}
          ariaLabel={t(config.list)}
        />
      </div>
    );
  }

  return (
    <>
      <PageFrame
        onSwipeBack={goBack}
        scrollRef={scrollRef}
        sessionScrollKey={`library:${kind}:list`}
        headerLeft={
          <HeaderButton
            icon={<BackIcon size="24" />}
            aria-label={t("nav.back")}
            onClick={goBack}
          />
        }
        headerCenter={
          <h1 ref={headingRef} className="text-foreground text-xl">
            {t(config.title)}
          </h1>
        }
      >
        {content}
        <BackToTop scrollContainerRef={scrollRef} threshold={200} />
      </PageFrame>
      <LibraryMediaDetailsModal
        isOpen={selectedEntry !== null}
        close={() => setSelectedEntry(null)}
        entry={selectedEntry}
        systemId={selectedEntry ? entrySystemId(selectedEntry) : ""}
        deviceKey={deviceKey}
      />
    </>
  );
}
