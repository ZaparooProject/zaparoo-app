import { afterEach, describe, expect, it, vi } from "vitest";
import { CoreAPI } from "@/lib/coreApi";
import {
  clearQueuedLibraryImages,
  requestLibraryImage as requestLibraryImageForDevice,
  resumeLibraryThumbnails,
} from "@/lib/libraryImages";
import type { MediaBrowseEntry, MediaImageResponse } from "@/lib/models";
import {
  __resetLibraryImageCacheForTests,
  flushLibraryImageCacheWrites,
} from "@/lib/libraryImageCache";

const IMAGE_RESPONSE: MediaImageResponse = {
  contentType: "image/webp",
  extension: "webp",
  data: "AAAA",
  typeTag: "property:image-boxart",
};

function requestLibraryImage(
  media: MediaBrowseEntry,
  fallbackSystemId: string,
  options: Omit<
    Parameters<typeof requestLibraryImageForDevice>[2],
    "targetDeviceAddress"
  >,
) {
  return requestLibraryImageForDevice(media, fallbackSystemId, {
    ...options,
    targetDeviceAddress: "device-a",
  });
}

function entry(id: number): MediaBrowseEntry {
  return {
    mediaId: id,
    name: `Game ${id}`,
    path: `/roms/SNES/game-${id}.sfc`,
    type: "media",
    systemId: "SNES",
  };
}

afterEach(async () => {
  clearQueuedLibraryImages();
  resumeLibraryThumbnails();
  await flushLibraryImageCacheWrites();
  __resetLibraryImageCacheForTests();
  vi.restoreAllMocks();
});

describe("Library image scheduler", () => {
  it("should limit media image requests to two at a time", async () => {
    const resolvers: Array<(value: MediaImageResponse) => void> = [];
    const imageSpy = vi.spyOn(CoreAPI, "mediaImage").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const first = requestLibraryImage(entry(1), "SNES", {
      maxSize: 128,
      priority: "detail",
    });
    const second = requestLibraryImage(entry(2), "SNES", {
      maxSize: 128,
      priority: "detail",
    });
    const third = requestLibraryImage(entry(3), "SNES", {
      maxSize: 128,
      priority: "detail",
    });

    await vi.waitFor(() => expect(imageSpy).toHaveBeenCalledTimes(2));
    resolvers[0]?.(IMAGE_RESPONSE);
    await first;
    await vi.waitFor(() => expect(imageSpy).toHaveBeenCalledTimes(3));
    resolvers[1]?.(IMAGE_RESPONSE);
    resolvers[2]?.(IMAGE_RESPONSE);
    await Promise.all([second, third]);
  });

  it("should space thumbnail starts by 800 milliseconds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const imageSpy = vi
      .spyOn(CoreAPI, "mediaImage")
      .mockResolvedValue(IMAGE_RESPONSE);

    try {
      const first = requestLibraryImage(entry(1), "SNES", {
        maxSize: 128,
        priority: "thumbnail",
      });
      const second = requestLibraryImage(entry(2), "SNES", {
        maxSize: 128,
        priority: "thumbnail",
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(imageSpy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(799);
      expect(imageSpy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(imageSpy).toHaveBeenCalledTimes(2);
      await Promise.all([first, second]);
    } finally {
      clearQueuedLibraryImages();
      vi.useRealTimers();
    }
  });

  it("should let detail images bypass thumbnail pacing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const resolvers: Array<(value: MediaImageResponse) => void> = [];
    const imageSpy = vi.spyOn(CoreAPI, "mediaImage").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );

    try {
      const thumbnail = requestLibraryImage(entry(1), "SNES", {
        maxSize: 128,
        priority: "thumbnail",
      });
      const pacedThumbnail = requestLibraryImage(entry(2), "SNES", {
        maxSize: 128,
        priority: "thumbnail",
      });
      const detail = requestLibraryImage(entry(3), "SNES", {
        maxSize: 512,
        priority: "detail",
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(imageSpy).toHaveBeenCalledTimes(2);
      expect(imageSpy.mock.calls[1]?.[0]).toEqual({
        mediaId: 3,
        imageTypes: undefined,
        maxSize: 512,
      });

      resolvers[0]?.(IMAGE_RESPONSE);
      resolvers[1]?.(IMAGE_RESPONSE);
      await Promise.all([thumbnail, detail]);
      await vi.advanceTimersByTimeAsync(800);
      expect(imageSpy).toHaveBeenCalledTimes(3);
      resolvers[2]?.(IMAGE_RESPONSE);
      await pacedThumbnail;
    } finally {
      clearQueuedLibraryImages();
      vi.useRealTimers();
    }
  });

  it("should prioritize detail images over queued thumbnails", async () => {
    const resolvers: Array<(value: MediaImageResponse) => void> = [];
    const imageSpy = vi.spyOn(CoreAPI, "mediaImage").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const activeOne = requestLibraryImage(entry(1), "SNES", {
      maxSize: 128,
      priority: "thumbnail",
    });
    const activeTwo = requestLibraryImage(entry(2), "SNES", {
      maxSize: 128,
      priority: "thumbnail",
    });
    const queuedThumbnail = requestLibraryImage(entry(3), "SNES", {
      maxSize: 128,
      priority: "thumbnail",
    });
    const queuedDetail = requestLibraryImage(entry(4), "SNES", {
      maxSize: 512,
      priority: "detail",
    });

    await vi.waitFor(() => expect(imageSpy).toHaveBeenCalledTimes(2));
    expect(imageSpy.mock.calls[1]?.[0]).toEqual({
      mediaId: 4,
      imageTypes: undefined,
      maxSize: 512,
    });

    resolvers[0]?.(IMAGE_RESPONSE);
    resolvers[1]?.(IMAGE_RESPONSE);
    await Promise.all([activeOne, queuedDetail]);
    await vi.waitFor(() => expect(imageSpy).toHaveBeenCalledTimes(3));
    resolvers[2]?.(IMAGE_RESPONSE);
    await activeTwo;
    await vi.waitFor(() => expect(imageSpy).toHaveBeenCalledTimes(4));
    resolvers[3]?.(IMAGE_RESPONSE);
    await queuedThumbnail;
  });

  it("should retry stale media IDs with canonical system and path", async () => {
    const imageSpy = vi
      .spyOn(CoreAPI, "mediaImage")
      .mockRejectedValueOnce(new Error("media not found"))
      .mockResolvedValueOnce(IMAGE_RESPONSE);

    await expect(
      requestLibraryImage(entry(42), "SNES", {
        imageTypes: ["boxart"],
        maxSize: 128,
        priority: "detail",
      }),
    ).resolves.toEqual({
      url: "data:image/webp;base64,AAAA",
      typeTag: "property:image-boxart",
    });

    expect(imageSpy).toHaveBeenNthCalledWith(
      1,
      { mediaId: 42, imageTypes: ["boxart"], maxSize: 128 },
      undefined,
    );
    expect(imageSpy).toHaveBeenNthCalledWith(
      2,
      {
        system: "SNES",
        path: "/roms/SNES/game-42.sfc",
        imageTypes: ["boxart"],
        maxSize: 128,
      },
      undefined,
    );
  });

  it("should not fall back to path after a transport failure", async () => {
    const imageSpy = vi
      .spyOn(CoreAPI, "mediaImage")
      .mockRejectedValue(new Error("Request timeout"));

    await expect(
      requestLibraryImage(entry(42), "SNES", {
        maxSize: 128,
        priority: "detail",
      }),
    ).rejects.toThrow("Request timeout");

    expect(imageSpy).toHaveBeenCalledTimes(1);
    expect(imageSpy).toHaveBeenCalledWith(
      { mediaId: 42, imageTypes: undefined, maxSize: 128 },
      undefined,
    );
  });

  it("should retain active slots until aborted Core requests settle", async () => {
    const resolvers: Array<(value: MediaImageResponse) => void> = [];
    const imageSpy = vi.spyOn(CoreAPI, "mediaImage").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const firstController = new AbortController();
    const secondController = new AbortController();
    const activeOne = requestLibraryImage(entry(1), "SNES", {
      maxSize: 128,
      priority: "thumbnail",
      signal: firstController.signal,
    });
    const activeTwo = requestLibraryImage(entry(2), "SNES", {
      maxSize: 128,
      priority: "detail",
      signal: secondController.signal,
    });
    const replacement = requestLibraryImage(entry(3), "SNES", {
      maxSize: 128,
      priority: "thumbnail",
    });

    await vi.waitFor(() => expect(imageSpy).toHaveBeenCalledTimes(2));
    firstController.abort();
    secondController.abort();
    await Promise.resolve();
    expect(imageSpy).toHaveBeenCalledTimes(2);

    resolvers[0]?.(IMAGE_RESPONSE);
    await expect(activeOne).rejects.toThrow("cancelled");
    await vi.waitFor(() => expect(imageSpy).toHaveBeenCalledTimes(3));

    resolvers[1]?.(IMAGE_RESPONSE);
    await expect(activeTwo).rejects.toThrow("cancelled");
    resolvers[2]?.(IMAGE_RESPONSE);
    await replacement;
  });

  it("should cancel queued requests before they reach Core", async () => {
    const resolvers: Array<(value: MediaImageResponse) => void> = [];
    const imageSpy = vi.spyOn(CoreAPI, "mediaImage").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const activeOne = requestLibraryImage(entry(1), "SNES", {
      maxSize: 128,
      priority: "detail",
    });
    const activeTwo = requestLibraryImage(entry(2), "SNES", {
      maxSize: 128,
      priority: "detail",
    });
    const controller = new AbortController();
    const queued = requestLibraryImage(entry(3), "SNES", {
      maxSize: 128,
      priority: "thumbnail",
      signal: controller.signal,
    });

    controller.abort();
    await expect(queued).rejects.toThrow("cancelled");
    await vi.waitFor(() => expect(imageSpy).toHaveBeenCalledTimes(2));

    resolvers[0]?.(IMAGE_RESPONSE);
    resolvers[1]?.(IMAGE_RESPONSE);
    await Promise.all([activeOne, activeTwo]);
  });
});
