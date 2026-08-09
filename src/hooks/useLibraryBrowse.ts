import { useCallback, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { CoreAPI } from "@/lib/coreApi";
import {
  collapseRedundantSystemRoots,
  flattenBrowsePages,
  LIBRARY_QUERY_KEYS,
  resolveSingletonFolderEntries,
  soleInitialRootPath,
} from "@/lib/libraryMedia";
import type {
  MediaBrowseEntry,
  MediaBrowseResponse,
  MediaBrowseSort,
} from "@/lib/models";
import { compareStrings } from "@/lib/utils";

const BROWSE_PAGE_SIZE = 100;
const MAX_JUMP_PAGE_SIZE = 1000;

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

export function useLibraryBrowse(options: {
  targetDeviceAddress: string;
  systemId: string;
  path: string;
  sort?: MediaBrowseSort;
  enabled: boolean;
}) {
  const sort = options.sort ?? "name-asc";
  const nextPageSizeRef = useRef(BROWSE_PAGE_SIZE);
  const browseQuery = useInfiniteQuery({
    queryKey: [
      LIBRARY_QUERY_KEYS.browse,
      options.targetDeviceAddress,
      options.systemId,
      options.path,
      sort,
    ],
    queryFn: async ({ pageParam, signal }) => {
      const response = await CoreAPI.mediaBrowse(
        {
          path: options.path,
          systems: [options.systemId],
          maxResults:
            pageParam === undefined
              ? BROWSE_PAGE_SIZE
              : nextPageSizeRef.current,
          cursor: pageParam,
          sort,
        },
        signal,
      );
      const preservedRootPath =
        options.path === "" ? soleInitialRootPath(response) : null;
      const entries = await resolveSingletonFolderEntries(
        response.entries,
        options.systemId,
        signal,
        CoreAPI,
        preservedRootPath,
      );
      return { ...response, entries };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pagination?.hasNextPage
        ? lastPage.pagination.nextCursor
        : undefined,
    enabled: options.enabled,
    staleTime: 60 * 1000,
    retry: 2,
  });

  const entries = useMemo(() => {
    const flattened = flattenBrowsePages(browseQuery.data?.pages);
    return options.path === ""
      ? sortRootEntries(collapseRedundantSystemRoots(flattened), sort)
      : flattened;
  }, [browseQuery.data?.pages, options.path, sort]);
  const firstPage = browseQuery.data?.pages[0];
  const totalFiles = firstPage?.totalFiles ?? 0;
  const totalDirs =
    firstPage?.totalDirs ??
    firstPage?.entries.filter((entry) => entry.type !== "media").length ??
    0;

  const fetchMore = useCallback(async () => {
    nextPageSizeRef.current = BROWSE_PAGE_SIZE;
    await browseQuery.fetchNextPage({ cancelRefetch: false });
  }, [browseQuery]);

  const loadThroughIndex = useCallback(
    async (targetIndex: number): Promise<boolean> => {
      let pages: MediaBrowseResponse[] = browseQuery.data?.pages ?? [];
      let count = flattenBrowsePages(pages).length;
      let previousCount = -1;

      try {
        while (count <= targetIndex && count !== previousCount) {
          const lastPage = pages.at(-1);
          if (
            !lastPage?.pagination?.hasNextPage ||
            !lastPage.pagination.nextCursor
          ) {
            break;
          }

          previousCount = count;
          const gap = Math.max(1, targetIndex - count + BROWSE_PAGE_SIZE);
          nextPageSizeRef.current = Math.min(MAX_JUMP_PAGE_SIZE, gap);
          const result = await browseQuery.fetchNextPage({
            cancelRefetch: false,
          });
          if (result.isError) throw result.error;
          pages = result.data?.pages ?? pages;
          count = flattenBrowsePages(pages).length;
        }
      } finally {
        nextPageSizeRef.current = BROWSE_PAGE_SIZE;
      }

      return count > targetIndex;
    },
    [browseQuery],
  );

  return {
    ...browseQuery,
    entries,
    totalFiles,
    totalDirs,
    fetchMore,
    loadThroughIndex,
  };
}
