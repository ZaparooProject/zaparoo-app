import {
  infiniteQueryOptions,
  queryOptions,
  type QueryClient,
} from "@tanstack/react-query";
import { CoreAPI, isBrowseCursorExpiredError } from "@/lib/coreApi";
import {
  LIBRARY_QUERY_KEYS,
  resolveSingletonFolderEntries,
  soleInitialRootPath,
} from "@/lib/libraryMedia";
import type {
  MediaBrowseEntry,
  MediaBrowseIndexGroup,
  MediaBrowseIndexResponse,
  MediaBrowseResponse,
  MediaBrowseSort,
} from "@/lib/models";

export const BROWSE_PAGE_SIZE = 100;
const BROWSE_MAX_RESULTS = 1000;
const BROWSE_STALE_TIME = 60 * 1000;

export interface LibraryBrowseScope {
  deviceKey: string;
  systemId: string;
  path: string;
  sort: MediaBrowseSort;
}

export interface LibraryBrowseRange {
  start: number;
  end: number;
}

/** Rows of one index bucket, placed at their absolute list position. */
export interface LibraryBrowseGroupRows {
  start: number;
  entries: MediaBrowseEntry[];
}

interface BrowsePageParam {
  /** Index bucket whose cursor starts this page, resolved at fetch time. */
  groupKey?: string;
  cursor?: string;
  maxResults: number;
}

export class LibraryBrowseGroupMissingError extends Error {
  constructor(groupKey: string) {
    super(`Browse index no longer has group ${groupKey}`);
    this.name = "LibraryBrowseGroupMissingError";
  }
}

export function libraryBrowseQueryKey(scope: LibraryBrowseScope) {
  return [
    LIBRARY_QUERY_KEYS.browse,
    scope.deviceKey,
    scope.systemId,
    scope.path,
    scope.sort,
  ] as const;
}

export function libraryBrowseIndexQueryOptions(scope: LibraryBrowseScope) {
  return queryOptions({
    queryKey: [
      LIBRARY_QUERY_KEYS.browseIndex,
      scope.deviceKey,
      scope.systemId,
      scope.path,
      scope.sort,
    ],
    queryFn: ({ signal }) =>
      CoreAPI.mediaBrowseIndex(
        {
          path: scope.path,
          systems: [scope.systemId],
          sort: scope.sort,
        },
        signal,
      ),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * First row of a bucket. The first bucket has no cursor because it starts the
 * listing, so it also carries the directories Core lists before files.
 */
export function libraryBrowseGroupStart(
  group: MediaBrowseIndexGroup,
  totalDirs: number,
): number {
  return group.cursor === "" ? 0 : totalDirs + group.offset;
}

export function libraryBrowseGroupEnd(
  group: MediaBrowseIndexGroup,
  totalDirs: number,
): number {
  return totalDirs + group.offset + group.count;
}

export function libraryBrowseGroupAt(
  groups: readonly MediaBrowseIndexGroup[],
  index: number,
  totalDirs: number,
): MediaBrowseIndexGroup | undefined {
  return groups.find(
    (group) =>
      index >= libraryBrowseGroupStart(group, totalDirs) &&
      index < libraryBrowseGroupEnd(group, totalDirs),
  );
}

export function libraryBrowsePageTotalDirs(
  page: MediaBrowseResponse | undefined,
): number {
  return (
    page?.totalDirs ??
    page?.entries.filter((entry) => entry.type !== "media").length ??
    0
  );
}

async function fetchLibraryBrowsePage(
  scope: LibraryBrowseScope,
  params: { cursor?: string; maxResults: number },
  signal: AbortSignal,
): Promise<MediaBrowseResponse> {
  const response = await CoreAPI.mediaBrowse(
    {
      path: scope.path,
      systems: [scope.systemId],
      maxResults: params.maxResults,
      cursor: params.cursor,
      sort: scope.sort,
    },
    signal,
  );
  const preservedRootPath =
    scope.path === "" ? soleInitialRootPath(response) : null;
  const entries = await resolveSingletonFolderEntries(
    response.entries,
    scope.systemId,
    signal,
    CoreAPI,
    preservedRootPath,
  );
  return { ...response, entries };
}

/**
 * Runs a fetch that starts from a bucket cursor. Media preference edits expire
 * every earlier cursor, so an expired cursor is retried once from a fresh index.
 */
async function fetchFromLibraryBrowseGroup<T>(
  queryClient: QueryClient,
  scope: LibraryBrowseScope,
  groupKey: string,
  signal: AbortSignal,
  fetch: (group: MediaBrowseIndexGroup) => Promise<T>,
): Promise<T> {
  const indexOptions = libraryBrowseIndexQueryOptions(scope);
  const findGroup = (index: MediaBrowseIndexResponse) => {
    const group = index.groups.find((candidate) => candidate.key === groupKey);
    if (!group) throw new LibraryBrowseGroupMissingError(groupKey);
    return group;
  };

  try {
    return await fetch(findGroup(await queryClient.fetchQuery(indexOptions)));
  } catch (error) {
    if (!isBrowseCursorExpiredError(error)) throw error;
  }

  const index = await CoreAPI.mediaBrowseIndex(
    { path: scope.path, systems: [scope.systemId], sort: scope.sort },
    signal,
  );
  queryClient.setQueryData(indexOptions.queryKey, index);
  return fetch(findGroup(index));
}

async function fetchLibraryBrowseGroupRows(
  scope: LibraryBrowseScope,
  group: MediaBrowseIndexGroup,
  totalDirs: number,
  signal: AbortSignal,
): Promise<LibraryBrowseGroupRows> {
  const start = libraryBrowseGroupStart(group, totalDirs);
  const rawEntries: MediaBrowseEntry[] = [];
  let rowCount = libraryBrowseGroupEnd(group, totalDirs) - start;
  let cursor = group.cursor || undefined;

  while (rawEntries.length < rowCount) {
    const response = await CoreAPI.mediaBrowse(
      {
        path: scope.path,
        systems: [scope.systemId],
        maxResults: Math.min(rowCount - rawEntries.length, BROWSE_MAX_RESULTS),
        cursor,
        sort: scope.sort,
      },
      signal,
    );
    if (group.cursor === "" && rawEntries.length === 0) {
      rowCount = (response.totalDirs ?? totalDirs) + group.count;
    }
    rawEntries.push(...response.entries);
    const nextCursor = response.pagination?.nextCursor;
    if (!response.pagination?.hasNextPage || !nextCursor) break;
    cursor = nextCursor;
  }

  // Resolve singleton folders per browse page so a bucket matches the rows the
  // top-down list shows for the same positions.
  const entries: MediaBrowseEntry[] = [];
  const rows = rawEntries.slice(0, rowCount);
  for (let offset = 0; offset < rows.length; offset += BROWSE_PAGE_SIZE) {
    // Awaiting inside the spread breaks the legacy build's async transform.
    const resolved = await resolveSingletonFolderEntries(
      rows.slice(offset, offset + BROWSE_PAGE_SIZE),
      scope.systemId,
      signal,
      CoreAPI,
    );
    entries.push(...resolved);
  }
  return { start, entries };
}

/**
 * Forward-paged browse list. Without an anchor it starts at the top of the
 * folder; with one it starts at that index bucket's cursor.
 */
export function libraryBrowseStreamQueryOptions(
  queryClient: QueryClient,
  scope: LibraryBrowseScope,
  anchorKey?: string,
) {
  const baseKey = libraryBrowseQueryKey(scope);
  return infiniteQueryOptions({
    queryKey:
      anchorKey === undefined ? [...baseKey] : [...baseKey, "from", anchorKey],
    queryFn: ({ pageParam, signal }) => {
      const { groupKey } = pageParam;
      if (groupKey === undefined) {
        return fetchLibraryBrowsePage(scope, pageParam, signal);
      }
      return fetchFromLibraryBrowseGroup(
        queryClient,
        scope,
        groupKey,
        signal,
        (group) =>
          fetchLibraryBrowsePage(
            scope,
            {
              cursor: group.cursor || undefined,
              maxResults: pageParam.maxResults,
            },
            signal,
          ),
      );
    },
    initialPageParam: {
      groupKey: anchorKey,
      maxResults: BROWSE_PAGE_SIZE,
    } as BrowsePageParam,
    getNextPageParam: (lastPage): BrowsePageParam | undefined =>
      lastPage.pagination?.hasNextPage && lastPage.pagination.nextCursor
        ? {
            cursor: lastPage.pagination.nextCursor,
            maxResults: BROWSE_PAGE_SIZE,
          }
        : undefined,
    staleTime: BROWSE_STALE_TIME,
    retry: 2,
  });
}

export function libraryBrowseGroupQueryOptions(
  queryClient: QueryClient,
  scope: LibraryBrowseScope,
  groupKey: string,
  totalDirs: number,
) {
  return queryOptions({
    queryKey: [...libraryBrowseQueryKey(scope), "group", groupKey],
    queryFn: ({ signal }) =>
      fetchFromLibraryBrowseGroup(
        queryClient,
        scope,
        groupKey,
        signal,
        (group) => fetchLibraryBrowseGroupRows(scope, group, totalDirs, signal),
      ),
    staleTime: BROWSE_STALE_TIME,
    retry: 2,
  });
}
