import type {
  MediaBrowseEntry,
  MediaHistoryEntry,
  MediaHistoryTopEntry,
} from "@/lib/models";

export const MEDIA_HISTORY_QUERY_KEYS = {
  history: "mediaHistory",
} as const;

/** Core's cap on a single history page. */
const MAX_HISTORY_LIMIT = 100;

/**
 * Core only learned to return one row per media in 2.17, so ask for a wider
 * page on older versions and collapse the repeats here.
 */
export function historyPageLimit(
  displayCount: number,
  coreDedupes: boolean,
): number {
  return coreDedupes
    ? displayCount
    : Math.min(displayCount * 4, MAX_HISTORY_LIMIT);
}

export function dedupeHistoryByMedia(
  entries: MediaHistoryEntry[],
  limit: number,
): MediaHistoryEntry[] {
  const seen = new Set<string>();
  const result: MediaHistoryEntry[] = [];

  for (const entry of entries) {
    const key = `${entry.systemId}\u0000${entry.mediaPath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
    if (result.length >= limit) break;
  }

  return result;
}

/** A history row as a library entry, so it reuses the artwork pipeline. */
export function historyEntryToBrowseEntry(
  entry: MediaHistoryEntry,
): MediaBrowseEntry {
  return {
    mediaId: entry.mediaId,
    name: entry.mediaName,
    path: entry.mediaPath,
    type: "media",
    systemId: entry.systemId,
    systemIds: entry.systemId ? [entry.systemId] : undefined,
    systemName: entry.systemName,
    relativePath: entry.relativePath,
    hasCover: entry.hasCover,
    zapScript: entry.zapScript,
  };
}

export function topEntryToBrowseEntry(
  entry: MediaHistoryTopEntry,
): MediaBrowseEntry {
  return {
    mediaId: entry.mediaId,
    name: entry.mediaName,
    path: entry.mediaPath,
    type: "media",
    systemId: entry.systemId,
    systemIds: entry.systemId ? [entry.systemId] : undefined,
    systemName: entry.systemName,
    relativePath: entry.relativePath,
  };
}
