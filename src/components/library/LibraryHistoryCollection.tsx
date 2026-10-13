import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { CoreAPI } from "@/lib/coreApi";
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
import { LibraryCollectionPage } from "@/components/library/LibraryCollectionPage";
import { useLibraryMediaSelection } from "@/hooks/useLibraryMediaSelection";

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
  const connected = useStatusStore((state) => state.connected);
  const deviceKey = useActiveDeviceKey();
  const selection = useLibraryMediaSelection(`history:${kind}`, deviceKey);
  const historyFeature = useCoreFeature("mediaRecents", {
    requireKnownSupport: true,
  });
  const enabled = connected && historyFeature.available && deviceKey !== "";
  // Older Core versions return every session, so they need a wider page and
  // a local collapse.
  const coreDedupes = useCoreFeature("mediaHistoryDistinct", {
    requireKnownSupport: true,
  }).available;

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

  const paging =
    kind === "recent"
      ? {
          hasNextPage: Boolean(recentQuery.hasNextPage),
          isFetchingNextPage: recentQuery.isFetchingNextPage,
          onFetchMore: () => void recentQuery.fetchNextPage(),
        }
      : {};

  return (
    <LibraryCollectionPage
      id={kind}
      labels={HISTORY_COLLECTIONS[kind]}
      deviceKey={deviceKey}
      selection={selection}
      unsupportedRequiredVersion={
        historyFeature.available ? null : historyFeature.requiredVersion
      }
      query={kind === "recent" ? recentQuery : topQuery}
      entries={entries}
      entryDetail={(entry) => details.get(entry)}
      {...paging}
    />
  );
}
