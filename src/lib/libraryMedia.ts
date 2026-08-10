import { CoreAPI, isRequestCancelledError } from "@/lib/coreApi";
import { filenameFromPath } from "@/lib/path";
import type {
  MediaBrowseEntry,
  MediaBrowseResponse,
  MediaImageResponse,
  MediaMeta,
  MediaMetaParams,
  MediaMetaResponse,
  MediaTagsUpdateParams,
  SearchResultGame,
  TagInfo,
} from "@/lib/models";

export const LIBRARY_QUERY_KEYS = {
  browse: "mediaBrowse",
  browseIndex: "mediaBrowseIndex",
  favorites: "mediaFavorites",
  meta: "mediaMeta",
  image: "mediaImage",
} as const;

export const FAVORITE_TAG_FILTER = "user:favorite";
export const MAX_SINGLETON_FOLDER_RESOLUTIONS_PER_PAGE = 4;

const SUPPORTED_IMAGE_TYPES = [
  "image",
  "thumbnail",
  "boxart",
  "boxart3d",
  "screenshot",
  "wheel",
  "titleshot",
  "map",
  "marquee",
  "fanart",
] as const;

const SUPPORTED_IMAGE_TYPE_SET = new Set<string>(SUPPORTED_IMAGE_TYPES);
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

const COMPACT_EDITION_LABELS: Record<string, string> = {
  "directors-cut": "DC",
  collectors: "CE",
  limited: "LE",
  special: "SE",
  deluxe: "DLX",
  ultimate: "ULT",
  anniversary: "ANNIV",
  remaster: "REMAS",
  remastered: "REMAS",
};

export type LibraryDetailFactType =
  | "year"
  | "players"
  | "developer"
  | "publisher"
  | "genre"
  | "rating"
  | "gamefamily"
  | "arcadeboard";

export interface LibraryDetailFact {
  type: LibraryDetailFactType;
  values: string[];
}

export interface LibraryMetadataView {
  title: string;
  description: string;
  tags: TagInfo[];
}

interface LibraryMediaApi {
  mediaBrowse: typeof CoreAPI.mediaBrowse;
  mediaMeta: typeof CoreAPI.mediaMeta;
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export function isMediaCapableEntry(entry: MediaBrowseEntry): boolean {
  return (
    entry.type === "media" ||
    (entry.type === "directory" &&
      (entry.mediaId !== undefined || nonEmpty(entry.zapScript) !== null))
  );
}

export function isPlainFolderEntry(entry: MediaBrowseEntry): boolean {
  return (
    entry.type === "root" ||
    (entry.type === "directory" && !isMediaCapableEntry(entry))
  );
}

export function entrySystemId(
  entry: MediaBrowseEntry,
  fallbackSystemId = "",
): string {
  return (
    nonEmpty(entry.systemId) ??
    entry.systemIds?.map(nonEmpty).find((systemId) => systemId !== null) ??
    fallbackSystemId
  );
}

export function mediaRefForEntry(
  entry: MediaBrowseEntry,
  fallbackSystemId = "",
): MediaMetaParams | null {
  if (entry.mediaId !== undefined) {
    return { mediaId: entry.mediaId };
  }

  const system = entrySystemId(entry, fallbackSystemId);
  const path = nonEmpty(entry.path);
  if (!system || !path) return null;
  return { system, path };
}

export async function fetchLibraryMediaMeta(
  entry: MediaBrowseEntry,
  fallbackSystemId: string,
  signal?: AbortSignal,
  api: Pick<LibraryMediaApi, "mediaMeta"> = CoreAPI,
): Promise<MediaMetaResponse> {
  const primary = mediaRefForEntry(entry, fallbackSystemId);
  if (!primary) throw new Error("Media reference is unavailable");
  try {
    return await api.mediaMeta(primary, signal);
  } catch (error) {
    if (isRequestCancelledError(error) || signal?.aborted) throw error;
    if (primary.mediaId === undefined) throw error;
    const system = entrySystemId(entry, fallbackSystemId);
    if (!system || !entry.path) throw error;
    return api.mediaMeta({ system, path: entry.path }, signal);
  }
}

export function isFavoriteTag(tag: TagInfo): boolean {
  return (
    tag.type.toLowerCase() === "user" && tag.tag.toLowerCase() === "favorite"
  );
}

export function hasFavoriteTag(tags: readonly TagInfo[] | undefined): boolean {
  return tags?.some(isFavoriteTag) ?? false;
}

export function favoriteUpdateParams(
  entry: MediaBrowseEntry,
  fallbackSystemId: string,
  favorite: boolean,
): MediaTagsUpdateParams | null {
  const update = favorite
    ? { add: [FAVORITE_TAG_FILTER] }
    : { remove: [FAVORITE_TAG_FILTER] };
  if (entry.mediaId !== undefined) {
    return { mediaId: entry.mediaId, ...update };
  }
  const system = entrySystemId(entry, fallbackSystemId);
  const path = nonEmpty(entry.path);
  if (!system || !path) return null;
  return { system, path, ...update };
}

export function searchResultToBrowseEntry(
  result: SearchResultGame,
): MediaBrowseEntry {
  return {
    mediaId: result.mediaId,
    name: result.name,
    path: result.path,
    type: "media",
    systemId: result.system.id,
    systemIds: result.system.id ? [result.system.id] : undefined,
    systemName: result.system.name,
    zapScript: result.zapScript,
    relativePath: result.relativePath,
    tags: result.tags,
    disambiguatingTags: result.disambiguatingTags,
  };
}

export function mediaRefKey(
  entry: MediaBrowseEntry,
  fallbackSystemId = "",
): readonly [number | null, string, string] {
  return [
    entry.mediaId ?? null,
    entrySystemId(entry, fallbackSystemId),
    entry.path,
  ];
}

function normalizedFilesystemPath(path: string): string | null {
  if (path.includes("://")) return null;
  const normalized = path
    .replaceAll("\\", "/")
    .replace(/\/{2,}/g, "/")
    .replace(/\/$/, "");
  return normalized || "/";
}

function isStrictFilesystemDescendant(
  childPath: string,
  parentPath: string,
): boolean {
  const child = normalizedFilesystemPath(childPath);
  const parent = normalizedFilesystemPath(parentPath);
  if (!child || !parent || child === parent) return false;
  const parentPrefix = parent === "/" ? parent : `${parent}/`;
  return child.startsWith(parentPrefix);
}

export function collapseRedundantSystemRoots(
  entries: readonly MediaBrowseEntry[],
): MediaBrowseEntry[] {
  if (entries.length < 2) return [...entries];

  return entries.filter((parent, parentIndex) => {
    if (parent.type !== "root" || parent.fileCount === undefined) return true;

    let descendantCount = 0;
    let foundDescendant = false;
    for (let childIndex = 0; childIndex < entries.length; childIndex++) {
      if (childIndex === parentIndex) continue;
      const child = entries[childIndex];
      if (
        !child ||
        child.type !== "root" ||
        !isStrictFilesystemDescendant(child.path, parent.path)
      ) {
        continue;
      }
      if (child.fileCount === undefined) return true;
      foundDescendant = true;
      descendantCount += child.fileCount;
    }

    return !foundDescendant || descendantCount !== parent.fileCount;
  });
}

export function soleInitialRootPath(
  response: MediaBrowseResponse,
  currentPath = "",
): string | null {
  const entries = collapseRedundantSystemRoots(response.entries);
  if (entries.length !== 1 || response.pagination?.hasNextPage === true) {
    return null;
  }

  const entry = entries[0];
  if (!entry || (entry.type !== "root" && entry.type !== "directory")) {
    return null;
  }
  const path = nonEmpty(entry.path);
  if (!path || path === currentPath) return null;
  return path;
}

export function flattenBrowsePages(
  pages: readonly MediaBrowseResponse[] | undefined,
): MediaBrowseEntry[] {
  return pages?.flatMap((page) => page.entries) ?? [];
}

function misterFolderDisplayName(name: string, path: string): string {
  let displayName = name.replace(/\.zip$/i, "");
  const normalizedPath = normalizedFilesystemPath(path)?.toLowerCase();
  const inMediaFat =
    normalizedPath === "/media/fat" ||
    normalizedPath?.startsWith("/media/fat/");
  const inGames =
    normalizedPath === "/media/fat/games" ||
    normalizedPath?.startsWith("/media/fat/games/");

  if (inMediaFat && !inGames) {
    displayName = displayName.replace(/^_+/, "");
  }
  return displayName || name;
}

export async function resolveSingletonFolderEntry(
  entry: MediaBrowseEntry,
  fallbackSystemId: string,
  signal?: AbortSignal,
  api: Pick<LibraryMediaApi, "mediaBrowse"> = CoreAPI,
): Promise<MediaBrowseEntry | null> {
  if (!isPlainFolderEntry(entry) || entry.fileCount !== 1) return null;

  let folderPath = entry.path;
  const visited = new Set<string>();
  for (let depth = 0; depth < 32; depth++) {
    if (visited.has(folderPath)) return null;
    visited.add(folderPath);

    const response = await api.mediaBrowse(
      {
        path: folderPath,
        systems: [fallbackSystemId],
        maxResults: 2,
        sort: "name-asc",
      },
      signal,
    );
    if (
      response.entries.length !== 1 ||
      response.pagination?.hasNextPage === true
    ) {
      return null;
    }

    const child = response.entries[0];
    if (!child) return null;
    if (!isPlainFolderEntry(child)) {
      const systemId = entrySystemId(child, fallbackSystemId);
      return {
        ...child,
        systemId: systemId || undefined,
        systemIds: systemId ? [systemId] : child.systemIds,
      };
    }
    if (!isStrictFilesystemDescendant(child.path, folderPath)) return null;
    folderPath = child.path;
  }

  return null;
}

export async function resolveSingletonFolderEntries(
  entries: readonly MediaBrowseEntry[],
  fallbackSystemId: string,
  signal?: AbortSignal,
  api: Pick<LibraryMediaApi, "mediaBrowse"> = CoreAPI,
  preservePath?: string | null,
): Promise<MediaBrowseEntry[]> {
  const resolved = [...entries];
  const candidates = entries
    .map((entry, index) => ({ entry, index }))
    .filter(
      ({ entry }) =>
        entry.path !== preservePath &&
        isPlainFolderEntry(entry) &&
        entry.fileCount === 1,
    )
    .slice(0, MAX_SINGLETON_FOLDER_RESOLUTIONS_PER_PAGE);
  let nextCandidate = 0;

  const resolveNext = async () => {
    while (nextCandidate < candidates.length) {
      const candidate = candidates[nextCandidate++];
      if (!candidate) return;

      try {
        const replacement = await resolveSingletonFolderEntry(
          candidate.entry,
          fallbackSystemId,
          signal,
          api,
        );
        if (replacement) resolved[candidate.index] = replacement;
      } catch (error) {
        if (signal?.aborted) throw error;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(2, candidates.length) }, resolveNext),
  );
  return resolved;
}

export function libraryEntryDisplayName(
  entry: MediaBrowseEntry,
  showFilenames: boolean,
  platform?: string | null,
): string {
  const isFolder = isPlainFolderEntry(entry);
  const displayName =
    !showFilenames || isFolder
      ? (nonEmpty(entry.name) ?? filenameFromPath(entry.path))
      : filenameFromPath(entry.path) || entry.name;

  if (isFolder && platform?.trim().toLowerCase() === "mister") {
    return misterFolderDisplayName(displayName, entry.path);
  }
  return displayName;
}

function descriptionFromMeta(meta: MediaMeta): string {
  return (
    nonEmpty(meta.title.properties["property:description"]?.text) ??
    nonEmpty(meta.properties["property:description"]?.text) ??
    ""
  );
}

export function mergeLibraryTags(
  ...groups: ReadonlyArray<readonly TagInfo[]>
): TagInfo[] {
  const seen = new Set<string>();
  return groups.flatMap((group) =>
    group.filter((tag) => {
      const key = `${tag.type}\0${tag.tag}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
}

const LIBRARY_DETAIL_FACT_TYPES: readonly LibraryDetailFactType[] = [
  "year",
  "players",
  "developer",
  "publisher",
  "genre",
  "rating",
  "gamefamily",
  "arcadeboard",
];

export function organizeLibraryDetailTags(tags: readonly TagInfo[]): {
  facts: LibraryDetailFact[];
  tags: TagInfo[];
} {
  const visibleTags = mergeLibraryTags(tags).filter((tag) => {
    const type = tag.type.trim().toLowerCase();
    return !isFavoriteTag(tag) && !type.startsWith("scraper.");
  });
  const factTypeSet = new Set<string>(LIBRARY_DETAIL_FACT_TYPES);
  const facts = LIBRARY_DETAIL_FACT_TYPES.flatMap((type) => {
    const values = visibleTags
      .filter((tag) => tag.type.trim().toLowerCase() === type)
      .map((tag) => (tag.label || tag.tag).trim())
      .filter(Boolean);
    return values.length > 0 ? [{ type, values }] : [];
  });

  return {
    facts,
    tags: visibleTags.filter(
      (tag) => !factTypeSet.has(tag.type.trim().toLowerCase()),
    ),
  };
}

export function libraryEntryTags(entry: MediaBrowseEntry): TagInfo[] {
  return mergeLibraryTags(entry.disambiguatingTags ?? []);
}

function compactRegion(value: string): string {
  switch (value) {
    case "world":
      return "W";
    case "scandinavia":
      return "SCAN";
    default:
      return value.toUpperCase();
  }
}

function compactRevision(value: string): string {
  const stripped = value.replace(
    /^(?:revision-|version-|revision|version|rev-|ver-)/,
    "",
  );
  return `R${stripped || value}`.toUpperCase();
}

function compactEdition(value: string): string {
  return COMPACT_EDITION_LABELS[value] ?? truncateCompactTag(value);
}

function truncateCompactTag(value: string): string {
  return Array.from(value.trim()).slice(0, 14).join("");
}

export function compactLibraryTag(tag: TagInfo): string {
  const value = tag.tag.trim().toLowerCase();
  if (!value) return "";

  switch (tag.type.trim().toLowerCase()) {
    case "region":
    case "lang":
      return value
        .split(",")
        .map((part) => compactRegion(part.trim()))
        .filter(Boolean)
        .join("/");
    case "disc":
      return `D${value}`.toUpperCase();
    case "rev":
      return compactRevision(value);
    case "players":
      return `${value}P`.toUpperCase();
    case "builddate": {
      const year = value.split(/[/-]/, 1)[0] ?? value;
      return /^\d{4}$/.test(year) ? `'${year.slice(2)}` : year;
    }
    case "edition":
      return compactEdition(value);
    default:
      return truncateCompactTag((tag.label || tag.tag).toLowerCase());
  }
}

export function collectLibraryMetadata(meta: MediaMeta): LibraryMetadataView {
  return {
    title: nonEmpty(meta.title.name) ?? filenameFromPath(meta.path),
    description: descriptionFromMeta(meta),
    tags: mergeLibraryTags(meta.title.tags ?? [], meta.tags ?? []),
  };
}

function imageTypeFromPropertyKey(key: string): string | null {
  const suffix = key.replace(/^property:image-?/i, "");
  if (suffix === key) return null;
  return suffix || "image";
}

export function imageTypeFromTypeTag(typeTag: string): string | null {
  return imageTypeFromPropertyKey(typeTag);
}

export function deriveLibraryImageTypes(meta: MediaMeta): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (!SUPPORTED_IMAGE_TYPE_SET.has(normalized) || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    ordered.push(normalized);
  };

  meta.availableImageTypes?.forEach(add);
  meta.title.availableImageTypes?.forEach(add);

  if (ordered.length === 0) {
    const derived = Object.keys(meta.title.properties ?? {})
      .concat(Object.keys(meta.properties ?? {}))
      .map(imageTypeFromPropertyKey)
      .filter((value): value is string => value !== null);
    if (derived.includes("image")) add("image");
    derived.forEach(add);
  }

  return ordered;
}

export function mediaImageDataUrl(
  response: Pick<MediaImageResponse, "contentType" | "data">,
): string | null {
  const contentType = response.contentType
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  const data = response.data.trim();
  if (
    !contentType ||
    !SUPPORTED_IMAGE_MIME_TYPES.has(contentType) ||
    data === "" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(data)
  ) {
    return null;
  }
  return `data:${contentType};base64,${data}`;
}

function launchPathPriority(path: string): number {
  const extension = path.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "m3u":
      return 0;
    case "cue":
      return 1;
    case "gdi":
      return 2;
    case "chd":
      return 3;
    default:
      return 100;
  }
}

function bestChildLaunchText(
  entries: readonly MediaBrowseEntry[],
): string | null {
  const path = entries
    .map((entry, index) => ({
      index,
      path: nonEmpty(entry.path),
    }))
    .filter((candidate): candidate is { index: number; path: string } =>
      Boolean(candidate.path),
    )
    .sort((a, b) => {
      const priority = launchPathPriority(a.path) - launchPathPriority(b.path);
      return priority === 0 ? a.index - b.index : priority;
    })[0]?.path;

  return (
    path ??
    entries.map((entry) => nonEmpty(entry.zapScript)).find(Boolean) ??
    null
  );
}

function childLaunchText(
  parent: MediaBrowseEntry,
  response: MediaBrowseResponse,
): string | null {
  const children = response.entries.filter((entry) => entry.type === "media");
  if (parent.mediaId !== undefined) {
    const matching = children.filter(
      (entry) => entry.mediaId === parent.mediaId,
    );
    const matchingText = bestChildLaunchText(matching);
    if (matchingText) return matchingText;
  }
  return bestChildLaunchText(children);
}

export async function resolveLibraryLaunchText(
  entry: MediaBrowseEntry,
  fallbackSystemId: string,
  signal?: AbortSignal,
  api: LibraryMediaApi = CoreAPI,
): Promise<string | null> {
  if (entry.type === "media") {
    return nonEmpty(entry.path) ?? nonEmpty(entry.zapScript);
  }
  if (!isMediaCapableEntry(entry)) return null;

  const ref = mediaRefForEntry(entry, fallbackSystemId);
  if (ref) {
    try {
      const result: MediaMetaResponse = await api.mediaMeta(ref, signal);
      const resolvedPath = nonEmpty(result.media.path);
      if (resolvedPath && resolvedPath !== entry.path) return resolvedPath;
    } catch (error) {
      if (signal?.aborted || isRequestCancelledError(error)) throw error;
      // Container metadata can be absent on older indexes. Child browse is the
      // documented fallback and CoreAPI owns structured logging.
    }
  }

  const systemId = entrySystemId(entry, fallbackSystemId);
  const path = nonEmpty(entry.path);
  if (path) {
    try {
      const response = await api.mediaBrowse(
        {
          path,
          systems: systemId ? [systemId] : undefined,
          maxResults: 1000,
        },
        signal,
      );
      const childText = childLaunchText(entry, response);
      if (childText && childText !== entry.path) return childText;
    } catch (error) {
      if (signal?.aborted || isRequestCancelledError(error)) throw error;
      // Fall through to the container's explicit ZapScript when browse fails.
    }
  }

  return nonEmpty(entry.zapScript);
}
