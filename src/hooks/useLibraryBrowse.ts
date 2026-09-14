import { useCallback, useEffect, useMemo } from "react";
import {
  type QueryObserverResult,
  useInfiniteQuery,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  libraryBrowseGroupAt,
  libraryBrowseGroupEnd,
  libraryBrowseGroupQueryOptions,
  type LibraryBrowseGroupRows,
  libraryBrowseGroupStart,
  libraryBrowseIndexQueryOptions,
  libraryBrowsePageTotalDirs,
  type LibraryBrowseRange,
  libraryBrowseStreamQueryOptions,
  libraryBrowseTotalDirsQueryOptions,
} from "@/lib/libraryBrowse";
import {
  collapseRedundantSystemRoots,
  flattenBrowsePages,
} from "@/lib/libraryMedia";
import type {
  LibraryBrowseWindow,
  LibraryBrowseWindowUpdater,
} from "@/lib/librarySessionStore";
import type {
  MediaBrowseEntry,
  MediaBrowseIndexGroup,
  MediaBrowseResponse,
  MediaBrowseSort,
} from "@/lib/models";
import { compareStrings } from "@/lib/utils";

const EMPTY_KEYS: string[] = [];

/** Result of preparing a letter jump; commit it only if the jump is current. */
export type LibraryBrowseJump =
  | { targetIndex: number }
  | { targetIndex: number; anchor: LibraryBrowseWindow }
  | { targetIndex: number; loadKey: string };

function sortRootEntries(
  entries: MediaBrowseEntry[],
  sort: MediaBrowseSort,
): MediaBrowseEntry[] {
  const filenameSort = sort.startsWith("filename-");
  const descending = sort.endsWith("-desc");
  return [...entries].sort((a, b) => {
    const comparison = compareStrings(
      filenameSort ? a.path : a.name,
      filenameSort ? b.path : b.name,
    );
    return descending ? -comparison : comparison;
  });
}

function combineGroupResults(
  results: QueryObserverResult<LibraryBrowseGroupRows>[],
) {
  return {
    rows: results.map((result) => result.data),
    failed: results.map((result) => result.isError && !result.isFetching),
    fetching: results.some((result) => result.isFetching),
  };
}

export function useLibraryBrowse(options: {
  deviceKey: string;
  systemId: string;
  path: string;
  sort?: MediaBrowseSort;
  enabled: boolean;
  browseWindow?: LibraryBrowseWindow | null;
  updateBrowseWindow?: (updater: LibraryBrowseWindowUpdater) => void;
}) {
  const queryClient = useQueryClient();
  const sort = options.sort ?? "name-asc";
  const { deviceKey, systemId, path } = options;
  const scope = useMemo(
    () => ({ deviceKey, systemId, path, sort }),
    [deviceKey, path, sort, systemId],
  );
  const browseWindow = options.browseWindow ?? null;
  const updateBrowseWindow = options.updateBrowseWindow;
  const loadedKeys = browseWindow?.loadedKeys ?? EMPTY_KEYS;

  const browseQuery = useInfiniteQuery({
    ...libraryBrowseStreamQueryOptions(
      queryClient,
      scope,
      browseWindow?.anchorKey,
    ),
    enabled: options.enabled,
  });
  const indexQuery = useQuery({
    ...libraryBrowseIndexQueryOptions(scope),
    enabled: options.enabled && browseWindow !== null,
  });
  const groups = indexQuery.data?.groups;
  // Seeded from the window so a jump or restore does not re-read the count.
  const totalDirsQuery = useQuery({
    ...libraryBrowseTotalDirsQueryOptions(scope),
    enabled: options.enabled && browseWindow !== null,
    initialData: browseWindow?.totalDirs,
  });
  const groupResults = useQueries({
    queries: loadedKeys.map((key) => ({
      ...libraryBrowseGroupQueryOptions(
        queryClient,
        scope,
        key,
        browseWindow?.totalDirs ?? 0,
      ),
      enabled: options.enabled && browseWindow !== null,
    })),
    combine: combineGroupResults,
  });

  const streamEntries = useMemo(
    () => flattenBrowsePages(browseQuery.data?.pages),
    [browseQuery.data?.pages],
  );
  const entries = useMemo((): (MediaBrowseEntry | undefined)[] => {
    if (!browseWindow) {
      return path === ""
        ? sortRootEntries(collapseRedundantSystemRoots(streamEntries), sort)
        : streamEntries;
    }

    const rows: (MediaBrowseEntry | undefined)[] = Array.from({
      length: browseWindow.anchorStart + streamEntries.length,
    });
    for (const groupRows of groupResults.rows) {
      groupRows?.entries.forEach((entry, offset) => {
        const index = groupRows.start + offset;
        if (index < browseWindow.anchorStart) rows[index] = entry;
      });
    }
    streamEntries.forEach((entry, offset) => {
      rows[browseWindow.anchorStart + offset] = entry;
    });
    return rows;
  }, [browseWindow, groupResults.rows, path, sort, streamEntries]);

  const firstPage = browseQuery.data?.pages[0];
  const totalFiles = firstPage?.totalFiles ?? 0;
  const totalDirs =
    browseWindow?.totalDirs ?? libraryBrowsePageTotalDirs(firstPage);

  const failedRanges = useMemo((): LibraryBrowseRange[] => {
    if (!browseWindow || !groups) return [];
    return loadedKeys.flatMap((key, index) => {
      const group = groups.find((candidate) => candidate.key === key);
      if (!groupResults.failed[index] || !group) return [];
      return [
        {
          start: libraryBrowseGroupStart(group, browseWindow.totalDirs),
          end: Math.min(
            libraryBrowseGroupEnd(group, browseWindow.totalDirs),
            browseWindow.anchorStart,
          ),
        },
      ];
    });
  }, [browseWindow, groupResults.failed, groups, loadedKeys]);

  // A refreshed index or directory count can move or drop the anchor bucket,
  // for example after media is hidden or the library is rebuilt. Wait for both
  // so the window never mixes an old count with new bucket offsets.
  const currentTotalDirs = totalDirsQuery.data;
  const refreshing = indexQuery.isFetching || totalDirsQuery.isFetching;
  useEffect(() => {
    if (
      !browseWindow ||
      !groups ||
      currentTotalDirs === undefined ||
      refreshing ||
      !updateBrowseWindow
    ) {
      return;
    }
    const anchor = groups.find((group) => group.key === browseWindow.anchorKey);
    const anchorStart =
      anchor && anchor.cursor !== "" ? currentTotalDirs + anchor.offset : null;
    if (
      anchorStart === browseWindow.anchorStart &&
      currentTotalDirs === browseWindow.totalDirs
    ) {
      return;
    }

    updateBrowseWindow((current) => {
      if (current?.anchorKey !== browseWindow.anchorKey) return current;
      return anchorStart === null
        ? null
        : { ...current, anchorStart, totalDirs: currentTotalDirs };
    });
  }, [browseWindow, currentTotalDirs, groups, refreshing, updateBrowseWindow]);

  const fetchMore = useCallback(async () => {
    await browseQuery.fetchNextPage({ cancelRefetch: false });
  }, [browseQuery]);

  const loadThroughIndex = useCallback(
    async (targetIndex: number): Promise<boolean> => {
      let pages: MediaBrowseResponse[] = browseQuery.data?.pages ?? [];
      let count = flattenBrowsePages(pages).length;
      let previousCount = -1;

      while (count <= targetIndex && count !== previousCount) {
        const lastPage = pages.at(-1);
        if (
          !lastPage?.pagination?.hasNextPage ||
          !lastPage.pagination.nextCursor
        ) {
          break;
        }

        previousCount = count;
        const result = await browseQuery.fetchNextPage({
          cancelRefetch: false,
        });
        if (result.isError) throw result.error;
        pages = result.data?.pages ?? pages;
        count = flattenBrowsePages(pages).length;
      }

      return count > targetIndex;
    },
    [browseQuery],
  );

  const loadIndex = useCallback(
    (index: number, loadOptions?: { retry?: boolean }) => {
      if (!browseWindow || !groups || index >= browseWindow.anchorStart) {
        return;
      }
      const group = libraryBrowseGroupAt(groups, index, browseWindow.totalDirs);
      if (!group) return;

      const loadedAt = browseWindow.loadedKeys.indexOf(group.key);
      if (loadedAt !== -1) {
        if (loadOptions?.retry && groupResults.failed[loadedAt]) {
          void queryClient.refetchQueries({
            queryKey: libraryBrowseGroupQueryOptions(
              queryClient,
              scope,
              group.key,
              browseWindow.totalDirs,
            ).queryKey,
            exact: true,
          });
        }
        return;
      }
      if (groupResults.fetching || !updateBrowseWindow) return;

      updateBrowseWindow((current) =>
        current?.anchorKey === browseWindow.anchorKey &&
        !current.loadedKeys.includes(group.key)
          ? { ...current, loadedKeys: [...current.loadedKeys, group.key] }
          : current,
      );
    },
    [
      browseWindow,
      groupResults.failed,
      groupResults.fetching,
      groups,
      queryClient,
      scope,
      updateBrowseWindow,
    ],
  );

  const jumpToGroup = useCallback(
    async (group: MediaBrowseIndexGroup): Promise<LibraryBrowseJump> => {
      let jumpTotalDirs = browseWindow?.totalDirs;
      if (jumpTotalDirs === undefined) {
        const topList = await queryClient.ensureInfiniteQueryData(
          libraryBrowseStreamQueryOptions(queryClient, scope),
        );
        jumpTotalDirs = libraryBrowsePageTotalDirs(topList.pages[0]);
      }
      const targetIndex = jumpTotalDirs + group.offset;
      if (entries[targetIndex]) return { targetIndex };

      if (group.cursor === "") {
        if (browseWindow) {
          await queryClient.ensureQueryData(
            libraryBrowseGroupQueryOptions(
              queryClient,
              scope,
              group.key,
              jumpTotalDirs,
            ),
          );
          return { targetIndex, loadKey: group.key };
        }
        if (!(await loadThroughIndex(targetIndex))) {
          throw new Error("Letter target is outside browse results");
        }
        return { targetIndex };
      }

      await queryClient.fetchInfiniteQuery({
        ...libraryBrowseStreamQueryOptions(queryClient, scope, group.key),
        pages: 1,
        retry: false,
      });
      return {
        targetIndex,
        anchor: {
          anchorKey: group.key,
          anchorStart: targetIndex,
          totalDirs: jumpTotalDirs,
          loadedKeys: [],
        },
      };
    },
    [browseWindow, entries, loadThroughIndex, queryClient, scope],
  );

  const commitJump = useCallback(
    (jump: LibraryBrowseJump) => {
      if (!updateBrowseWindow) return;
      if ("anchor" in jump) {
        updateBrowseWindow(() => jump.anchor);
      } else if ("loadKey" in jump) {
        updateBrowseWindow((current) =>
          current && !current.loadedKeys.includes(jump.loadKey)
            ? { ...current, loadedKeys: [...current.loadedKeys, jump.loadKey] }
            : current,
        );
      }
    },
    [updateBrowseWindow],
  );

  const refetchIndex = indexQuery.refetch;
  const refetchStream = browseQuery.refetch;
  const windowed = browseWindow !== null;
  const refetch = useCallback(async () => {
    if (windowed) await refetchIndex();
    return refetchStream();
  }, [refetchIndex, refetchStream, windowed]);

  return {
    ...browseQuery,
    isError:
      browseQuery.isError ||
      (windowed && indexQuery.isError && indexQuery.data === undefined),
    refetch,
    entries,
    totalFiles,
    totalDirs,
    failedRanges,
    isLoadingIndex: groupResults.fetching,
    fetchMore,
    loadIndex,
    jumpToGroup,
    commitJump,
  };
}
