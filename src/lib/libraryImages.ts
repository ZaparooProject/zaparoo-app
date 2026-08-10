import {
  CoreAPI,
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
let activeRequests = 0;
let thumbnailsPaused = false;
const queue: QueuedImageRequest[] = [];

function drainQueue(): void {
  while (activeRequests < MAX_CONCURRENT_IMAGE_REQUESTS && queue.length > 0) {
    const request = queue.shift();
    if (!request) return;
    if (request.signal?.aborted) {
      request.removeAbortListener();
      request.reject(
        new RequestCancelledError("Media image request cancelled"),
      );
      continue;
    }

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
    response = await CoreAPI.mediaImage(primary, signal);
  } catch (error) {
    if (isRequestCancelledError(error)) throw error;
    if (isMissingMediaImageError(error)) return null;
    if (entry.mediaId === undefined) throw error;
    const fallback = requestParams(
      entry,
      fallbackSystemId,
      imageTypes,
      maxSize,
      false,
    );
    if (!fallback) throw error;
    try {
      response = await CoreAPI.mediaImage(fallback, signal);
    } catch (fallbackError) {
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

export function requestLibraryImage(
  entry: MediaBrowseEntry,
  fallbackSystemId: string,
  options: {
    targetDeviceAddress: string;
    imageTypes?: string[];
    maxSize: number;
    priority: LibraryImagePriority;
    signal?: AbortSignal;
  },
): Promise<LibraryImageResult | null> {
  return scheduleImageRequest(
    async () => {
      const cacheKey = persistentCacheKey(
        entry,
        fallbackSystemId,
        options.imageTypes,
        options.maxSize,
      );
      if (cacheKey) {
        const cached = await readLibraryImageCache(
          options.targetDeviceAddress,
          cacheKey,
        );
        if (options.signal?.aborted) {
          throw new RequestCancelledError("Media image request cancelled");
        }
        if (cached.hit) return cached.value;
      }

      const result = await fetchImage(
        entry,
        fallbackSystemId,
        options.imageTypes,
        options.maxSize,
        options.signal,
      );
      if (cacheKey) {
        writeLibraryImageCache(options.targetDeviceAddress, cacheKey, result);
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

export function clearQueuedLibraryImages(): void {
  while (queue.length > 0) {
    const request = queue.shift();
    if (!request) continue;
    request.removeAbortListener();
    request.reject(new RequestCancelledError("Media image queue cleared"));
  }
}
