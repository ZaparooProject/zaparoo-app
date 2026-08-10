import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { logger } from "@/lib/logger";

export interface CachedLibraryImage {
  url: string;
  typeTag: string;
}

export interface LibraryImageCacheLookup {
  hit: boolean;
  value: CachedLibraryImage | null;
}

interface CacheEntryMetadata {
  bytes: number;
  createdAt: number;
  deviceKey: string;
  file: string;
  lastAccess: number;
  missing: boolean;
}

interface CacheManifest {
  entries: Record<string, CacheEntryMetadata>;
  version: 1;
}

interface CachePayload {
  result: CachedLibraryImage | null;
  version: 1;
}

const CACHE_DIRECTORY = "library-artwork-v1";
const MANIFEST_PATH = `${CACHE_DIRECTORY}/manifest.json`;
const CACHE_VERSION = 1;
const MAX_CACHE_BYTES = 100 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 5000;
const IMAGE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISSING_TTL_MS = 24 * 60 * 60 * 1000;
const ACCESS_PERSIST_INTERVAL = 25;

let manifestPromise: Promise<CacheManifest> | null = null;
let mutationChain: Promise<void> = Promise.resolve();
let accessUpdates = 0;

function emptyManifest(): CacheManifest {
  return { version: CACHE_VERSION, entries: {} };
}

function hashValue(value: string): string {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [h1, h2, h3, h4]
    .map((hash) => (hash >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

async function readText(path: string): Promise<string> {
  const result = await Filesystem.readFile({
    path,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });
  return typeof result.data === "string" ? result.data : result.data.text();
}

function validManifest(value: unknown): value is CacheManifest {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as CacheManifest).version === CACHE_VERSION &&
    typeof (value as CacheManifest).entries === "object" &&
    (value as CacheManifest).entries !== null
  );
}

async function loadManifest(): Promise<CacheManifest> {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      try {
        const parsed: unknown = JSON.parse(await readText(MANIFEST_PATH));
        return validManifest(parsed) ? parsed : emptyManifest();
      } catch {
        try {
          await Filesystem.mkdir({
            path: CACHE_DIRECTORY,
            directory: Directory.Cache,
            recursive: true,
          });
        } catch {
          // Existing directories and unavailable cache storage are handled by
          // the first write; image delivery must not depend on disk caching.
        }
        return emptyManifest();
      }
    })();
  }
  return manifestPromise;
}

async function persistManifest(manifest: CacheManifest): Promise<void> {
  await Filesystem.writeFile({
    path: MANIFEST_PATH,
    data: JSON.stringify(manifest),
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  });
}

function queueMutation(mutation: () => Promise<void>): Promise<void> {
  const next = mutationChain.then(mutation, mutation);
  mutationChain = next.catch((error) => {
    logger.warn("Library artwork cache write failed", error);
  });
  return next;
}

async function deleteCacheFile(path: string): Promise<void> {
  try {
    await Filesystem.deleteFile({ path, directory: Directory.Cache });
  } catch {
    // Cache directories may be purged by the OS between manifest operations.
  }
}

function expired(entry: CacheEntryMetadata, now: number): boolean {
  const ttl = entry.missing ? MISSING_TTL_MS : IMAGE_TTL_MS;
  return now - entry.createdAt >= ttl;
}

function validPayload(value: unknown): value is CachePayload {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as CachePayload).version !== CACHE_VERSION
  ) {
    return false;
  }
  const result = (value as CachePayload).result;
  return (
    result === null ||
    (typeof result === "object" &&
      result !== null &&
      typeof result.url === "string" &&
      result.url.startsWith("data:image/") &&
      typeof result.typeTag === "string")
  );
}

export function selectLibraryImageCacheEvictions(
  candidates: Array<{
    bytes: number;
    id: string;
    lastAccess: number;
  }>,
  limits: { maxBytes: number; maxEntries: number } = {
    maxBytes: MAX_CACHE_BYTES,
    maxEntries: MAX_CACHE_ENTRIES,
  },
): string[] {
  let totalBytes = candidates.reduce(
    (total, candidate) => total + candidate.bytes,
    0,
  );
  const ordered = [...candidates].sort(
    (left, right) => left.lastAccess - right.lastAccess,
  );

  const evicted: string[] = [];
  let remainingEntries = ordered.length;
  for (const candidate of ordered) {
    if (
      totalBytes <= limits.maxBytes &&
      remainingEntries <= limits.maxEntries
    ) {
      break;
    }
    evicted.push(candidate.id);
    totalBytes -= candidate.bytes;
    remainingEntries--;
  }
  return evicted;
}

function entryIdsToEvict(
  entries: Record<string, CacheEntryMetadata>,
): string[] {
  return selectLibraryImageCacheEvictions(
    Object.entries(entries).map(([id, entry]) => ({
      bytes: entry.bytes,
      id,
      lastAccess: entry.lastAccess,
    })),
  );
}

function removeManifestEntry(id: string): void {
  void queueMutation(async () => {
    const manifest = await loadManifest();
    const entry = manifest.entries[id];
    if (!entry) return;
    delete manifest.entries[id];
    await deleteCacheFile(entry.file);
    await persistManifest(manifest);
  });
}

export async function readLibraryImageCache(
  targetDeviceAddress: string,
  cacheKey: string,
): Promise<LibraryImageCacheLookup> {
  if (!targetDeviceAddress || !cacheKey) return { hit: false, value: null };

  const id = hashValue(`${targetDeviceAddress}\u0000${cacheKey}`);
  const manifest = await loadManifest();
  const entry = manifest.entries[id];
  if (!entry) return { hit: false, value: null };

  const now = Date.now();
  if (expired(entry, now)) {
    removeManifestEntry(id);
    return { hit: false, value: null };
  }

  try {
    const parsed: unknown = JSON.parse(await readText(entry.file));
    if (!validPayload(parsed)) throw new Error("Invalid artwork cache payload");
    entry.lastAccess = now;
    accessUpdates++;
    if (accessUpdates >= ACCESS_PERSIST_INTERVAL) {
      accessUpdates = 0;
      void queueMutation(async () => persistManifest(await loadManifest()));
    }
    return { hit: true, value: parsed.result };
  } catch {
    removeManifestEntry(id);
    return { hit: false, value: null };
  }
}

export function writeLibraryImageCache(
  targetDeviceAddress: string,
  cacheKey: string,
  result: CachedLibraryImage | null,
): void {
  if (!targetDeviceAddress || !cacheKey) return;

  const id = hashValue(`${targetDeviceAddress}\u0000${cacheKey}`);
  const deviceKey = hashValue(targetDeviceAddress);
  const file = `${CACHE_DIRECTORY}/${id}.json`;
  const payload: CachePayload = { version: CACHE_VERSION, result };
  const serialized = JSON.stringify(payload);

  void queueMutation(async () => {
    const manifest = await loadManifest();
    await Filesystem.writeFile({
      path: file,
      data: serialized,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    });

    const now = Date.now();
    manifest.entries[id] = {
      bytes: serialized.length,
      createdAt: now,
      deviceKey,
      file,
      lastAccess: now,
      missing: result === null,
    };

    for (const evictedId of entryIdsToEvict(manifest.entries)) {
      const evicted = manifest.entries[evictedId];
      if (!evicted) continue;
      delete manifest.entries[evictedId];
      await deleteCacheFile(evicted.file);
    }
    await persistManifest(manifest);
  });
}

export function invalidateLibraryImageCache(targetDeviceAddress: string): void {
  if (!targetDeviceAddress) return;
  const deviceKey = hashValue(targetDeviceAddress);

  void queueMutation(async () => {
    const manifest = await loadManifest();
    for (const [id, entry] of Object.entries(manifest.entries)) {
      if (entry.deviceKey !== deviceKey) continue;
      delete manifest.entries[id];
      await deleteCacheFile(entry.file);
    }
    await persistManifest(manifest);
  });
}

export async function flushLibraryImageCacheWrites(): Promise<void> {
  await mutationChain;
}

export function __resetLibraryImageCacheForTests(): void {
  manifestPromise = null;
  mutationChain = Promise.resolve();
  accessUpdates = 0;
}
