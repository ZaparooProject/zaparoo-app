import {
  CoreAPI,
  isMediaIdLookupError,
  isMissingMediaImageError,
  isRequestCancelledError,
} from "@/lib/coreApi";
import { RequestCancelledError } from "@/lib/errors";
import { entrySystemId, mediaImageDataUrl } from "@/lib/libraryMedia";
import {
  type CachedLibraryImage,
  readLibraryImageCache,
  writeLibraryImageCache,
} from "@/lib/libraryImageCache";
import type {
  MediaBrowseEntry,
  MediaImageParams,
  MediaImageResponse,
} from "@/lib/models";

export type LibraryImagePriority = "detail" | "thumbnail";

interface QueuedImageRequest {
  priority: LibraryImagePriority;
  signal?: AbortSignal;
  run: () => Promise<LibraryImageResult | null>;
  resolve: (value: LibraryImageResult | null) => void;
  reject: (reason: unknown) => void;
  removeAbortListener: () => void;
}

export type LibraryImageResult = CachedLibraryImage;

const MAX_CONCURRENT_IMAGE_REQUESTS = 2;
const THUMBNAIL_START_INTERVAL_MS = 800;
let activeRequests = 0;
let thumbnailsPaused = false;
let lastThumbnailStartedAt: number | null = null;
let thumbnailStartTimer: ReturnType<typeof setTimeout> | undefined;
const queue: QueuedImageRequest[] = [];

function scheduleThumbnailDrain(delay: number): void {
  if (thumbnailStartTimer) return;
  thumbnailStartTimer = setTimeout(() => {
    thumbnailStartTimer = undefined;
    drainQueue();
  }, delay);
}

function drainQueue(): void {
  while (activeRequests < MAX_CONCURRENT_IMAGE_REQUESTS && queue.length > 0) {
    const request = queue[0];
    if (!request) return;
    if (request.signal?.aborted) {
      queue.shift();
      request.removeAbortListener();
      request.reject(
        new RequestCancelledError("Media image request cancelled"),
      );
      continue;
    }
    if (request.priority === "thumbnail") {
      const elapsed = Date.now() - (lastThumbnailStartedAt ?? 0);
      if (
        lastThumbnailStartedAt !== null &&
        elapsed < THUMBNAIL_START_INTERVAL_MS
      ) {
        scheduleThumbnailDrain(THUMBNAIL_START_INTERVAL_MS - elapsed);
        return;
      }
      lastThumbnailStartedAt = Date.now();
    }
    queue.shift();

    activeRequests++;
    void request
      .run()
      .then(request.resolve, request.reject)
      .finally(() => {
        request.removeAbortListener();
        activeRequests--;
        drainQueue();
      });
  }
}

function scheduleImageRequest(
  run: () => Promise<LibraryImageResult | null>,
  priority: LibraryImagePriority,
  signal?: AbortSignal,
): Promise<LibraryImageResult | null> {
  if (signal?.aborted || (priority === "thumbnail" && thumbnailsPaused)) {
    return Promise.reject(
      new RequestCancelledError("Media image request cancelled"),
    );
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      const index = queue.indexOf(request);
      if (index !== -1) {
        queue.splice(index, 1);
        request.removeAbortListener();
        reject(new RequestCancelledError("Media image request cancelled"));
      }
    };
    const removeAbortListener = () =>
      signal?.removeEventListener("abort", onAbort);

    const request: QueuedImageRequest = {
      priority,
      signal,
      run,
      resolve,
      reject,
      removeAbortListener,
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    if (priority === "detail") {
      const firstThumbnail = queue.findIndex(
        (queued) => queued.priority === "thumbnail",
      );
      if (firstThumbnail === -1) queue.push(request);
      else queue.splice(firstThumbnail, 0, request);
    } else {
      queue.push(request);
    }
    drainQueue();
  });
}

function requestParams(
  entry: MediaBrowseEntry,
  fallbackSystemId: string,
  imageTypes: string[] | undefined,
  maxSize: number,
  useMediaId: boolean,
): MediaImageParams | null {
  const shared = {
    imageTypes,
    maxSize,
  };
  if (useMediaId && entry.mediaId !== undefined) {
    return { ...shared, mediaId: entry.mediaId };
  }
  const system = entrySystemId(entry, fallbackSystemId);
  if (!system || !entry.path) return null;
  return { ...shared, system, path: entry.path };
}

function throwIfImageRequestCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new RequestCancelledError("Media image request cancelled");
  }
}

async function fetchImage(
  entry: MediaBrowseEntry,
  fallbackSystemId: string,
  imageTypes: string[] | undefined,
  maxSize: number,
  signal?: AbortSignal,
): Promise<LibraryImageResult | null> {
  const primary = requestParams(
    entry,
    fallbackSystemId,
    imageTypes,
    maxSize,
    true,
  );
  if (!primary) return null;

  let response: MediaImageResponse;
  try {
    // Once sent, keep this scheduler slot occupied until Core settles the RPC.
    // Aborting only the local promise would let rapid scrolling exceed the
    // physical concurrency limit while Core continues processing old requests.
    response = await CoreAPI.mediaImage(primary, undefined);
    throwIfImageRequestCancelled(signal);
  } catch (error) {
    throwIfImageRequestCancelled(signal);
    if (isRequestCancelledError(error)) throw error;
    if (isMissingMediaImageError(error)) return null;
    if (entry.mediaId === undefined || !isMediaIdLookupError(error))
      throw error;
    const fallback = requestParams(
      entry,
      fallbackSystemId,
      imageTypes,
      maxSize,
      false,
    );
    if (!fallback) throw error;
    try {
      response = await CoreAPI.mediaImage(fallback, undefined);
      throwIfImageRequestCancelled(signal);
    } catch (fallbackError) {
      throwIfImageRequestCancelled(signal);
      if (isMissingMediaImageError(fallbackError)) return null;
      throw fallbackError;
    }
  }

  const url = mediaImageDataUrl(response);
  return url ? { url, typeTag: response.typeTag } : null;
}

function persistentCacheKey(
  entry: MediaBrowseEntry,
  fallbackSystemId: string,
  imageTypes: string[] | undefined,
  maxSize: number,
): string | null {
  const system = entrySystemId(entry, fallbackSystemId);
  const mediaIdentity =
    system && entry.path
      ? `path:${system}\u0000${entry.path}`
      : entry.mediaId !== undefined
        ? `id:${entry.mediaId}`
        : null;
  if (!mediaIdentity) return null;
  return `${mediaIdentity}\u0000types:${(imageTypes ?? ["default"]).join(
    "\u0000",
  )}\u0000size:${maxSize}`;
}

export async function requestLibraryImage(
  entry: MediaBrowseEntry,
  fallbackSystemId: string,
  options: {
    deviceKey: string;
    imageTypes?: string[];
    maxSize: number;
    priority: LibraryImagePriority;
    signal?: AbortSignal;
  },
): Promise<LibraryImageResult | null> {
  const cacheKey = persistentCacheKey(
    entry,
    fallbackSystemId,
    options.imageTypes,
    options.maxSize,
  );
  if (cacheKey) {
    const cached = await readLibraryImageCache(options.deviceKey, cacheKey);
    throwIfImageRequestCancelled(options.signal);
    if (cached.hit) return cached.value;
  }

  return scheduleImageRequest(
    async () => {
      const result = await fetchImage(
        entry,
        fallbackSystemId,
        options.imageTypes,
        options.maxSize,
        options.signal,
      );
      if (cacheKey) {
        writeLibraryImageCache(options.deviceKey, cacheKey, result);
      }
      return result;
    },
    options.priority,
    options.signal,
  );
}

export function pauseLibraryThumbnails(): void {
  thumbnailsPaused = true;
  for (let index = queue.length - 1; index >= 0; index--) {
    const request = queue[index];
    if (request?.priority !== "thumbnail") continue;
    queue.splice(index, 1);
    request.removeAbortListener();
    request.reject(new RequestCancelledError("Thumbnail request paused"));
  }
}

export function resumeLibraryThumbnails(): void {
  thumbnailsPaused = false;
  drainQueue();
}

export function clearQueuedLibraryImages(): {
  activeRequests: number;
  queuedRequests: number;
} {
  if (thumbnailStartTimer) {
    clearTimeout(thumbnailStartTimer);
    thumbnailStartTimer = undefined;
  }
  lastThumbnailStartedAt = null;
  const requestCounts = {
    activeRequests,
    queuedRequests: queue.length,
  };
  while (queue.length > 0) {
    const request = queue.shift();
    if (!request) continue;
    request.removeAbortListener();
    request.reject(new RequestCancelledError("Media image queue cleared"));
  }
  return requestCounts;
}
