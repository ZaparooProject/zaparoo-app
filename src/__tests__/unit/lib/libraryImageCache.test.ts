import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const filesystemMock = vi.hoisted(() => {
  const files = new Map<string, string>();
  return {
    files,
    readFile: vi.fn(async ({ path }: { path: string }) => {
      const data = files.get(path);
      if (data === undefined) throw new Error("File does not exist");
      return { data };
    }),
    writeFile: vi.fn(
      async ({ path, data }: { path: string; data: string | Blob }) => {
        files.set(path, typeof data === "string" ? data : await data.text());
        return { uri: path };
      },
    ),
    deleteFile: vi.fn(async ({ path }: { path: string }) => {
      if (!files.delete(path)) throw new Error("File does not exist");
    }),
    mkdir: vi.fn(async () => undefined),
  };
});

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" },
  Encoding: { UTF8: "utf8" },
  Filesystem: {
    readFile: filesystemMock.readFile,
    writeFile: filesystemMock.writeFile,
    deleteFile: filesystemMock.deleteFile,
    mkdir: filesystemMock.mkdir,
  },
}));

import { CoreAPI } from "@/lib/coreApi";
import {
  clearQueuedLibraryImages,
  requestLibraryImage,
  resumeLibraryThumbnails,
} from "@/lib/libraryImages";
import {
  __resetLibraryImageCacheForTests,
  flushLibraryImageCacheWrites,
  invalidateLibraryImageCache,
  readLibraryImageCache,
  selectLibraryImageCacheEvictions,
  writeLibraryImageCache,
} from "@/lib/libraryImageCache";

const IMAGE = {
  url: "data:image/webp;base64,AAAA",
  typeTag: "property:image-boxart",
};

describe("Library image disk cache", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    filesystemMock.files.clear();
    filesystemMock.readFile.mockClear();
    filesystemMock.writeFile.mockClear();
    filesystemMock.deleteFile.mockClear();
    filesystemMock.mkdir.mockClear();
    clearQueuedLibraryImages();
    resumeLibraryThumbnails();
    __resetLibraryImageCacheForTests();
  });

  afterEach(async () => {
    clearQueuedLibraryImages();
    resumeLibraryThumbnails();
    await flushLibraryImageCacheWrites();
  });

  it("should persist and return an image without storing its media path", async () => {
    const cacheKey = "path:SNES\u0000/roms/SNES/Secret Game.sfc\u0000size:128";

    writeLibraryImageCache("device-a", cacheKey, IMAGE);
    await flushLibraryImageCacheWrites();

    await expect(readLibraryImageCache("device-a", cacheKey)).resolves.toEqual({
      hit: true,
      value: IMAGE,
    });
    expect([...filesystemMock.files.values()].join("\n")).not.toContain(
      "/roms/SNES/Secret Game.sfc",
    );
  });

  it("should persist missing artwork as a negative cache entry", async () => {
    writeLibraryImageCache("device-a", "missing-game", null);
    await flushLibraryImageCacheWrites();

    await expect(
      readLibraryImageCache("device-a", "missing-game"),
    ).resolves.toEqual({ hit: true, value: null });
  });

  it("should isolate entries by target device", async () => {
    writeLibraryImageCache("device-a", "same-game", IMAGE);
    await flushLibraryImageCacheWrites();

    await expect(
      readLibraryImageCache("device-b", "same-game"),
    ).resolves.toEqual({ hit: false, value: null });
  });

  it("should invalidate only the selected device", async () => {
    writeLibraryImageCache("device-a", "game-a", IMAGE);
    writeLibraryImageCache("device-b", "game-b", IMAGE);
    await flushLibraryImageCacheWrites();

    invalidateLibraryImageCache("device-a");
    await flushLibraryImageCacheWrites();

    await expect(readLibraryImageCache("device-a", "game-a")).resolves.toEqual({
      hit: false,
      value: null,
    });
    await expect(readLibraryImageCache("device-b", "game-b")).resolves.toEqual({
      hit: true,
      value: IMAGE,
    });
  });

  it("should refresh images after the disk-cache lifetime", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    writeLibraryImageCache("device-a", "aging-game", IMAGE);
    await flushLibraryImageCacheWrites();
    now.mockReturnValue(31 * 24 * 60 * 60 * 1000);

    await expect(
      readLibraryImageCache("device-a", "aging-game"),
    ).resolves.toEqual({ hit: false, value: null });
  });

  it("should recover from a missing or corrupted cache file", async () => {
    writeLibraryImageCache("device-a", "corrupt-game", IMAGE);
    await flushLibraryImageCacheWrites();
    const imageFile = [...filesystemMock.files.keys()].find(
      (path) => path !== "library-artwork-v1/manifest.json",
    );
    expect(imageFile).toBeDefined();
    if (!imageFile) return;
    filesystemMock.files.set(imageFile, "not json");

    await expect(
      readLibraryImageCache("device-a", "corrupt-game"),
    ).resolves.toEqual({ hit: false, value: null });
    await flushLibraryImageCacheWrites();
    expect(filesystemMock.files.has(imageFile)).toBe(false);
  });

  it("should avoid a second Core request after an image reaches disk", async () => {
    const imageSpy = vi.spyOn(CoreAPI, "mediaImage").mockResolvedValue({
      contentType: "image/webp",
      extension: "webp",
      data: "AAAA",
      typeTag: "property:image-boxart",
    });
    const media = {
      mediaId: 1,
      name: "Game",
      path: "/roms/SNES/Game.sfc",
      type: "media" as const,
      systemId: "SNES",
    };
    const options = {
      targetDeviceAddress: "device-a",
      maxSize: 128,
      priority: "thumbnail" as const,
    };

    await requestLibraryImage(media, "SNES", options);
    await flushLibraryImageCacheWrites();
    __resetLibraryImageCacheForTests();
    await requestLibraryImage(media, "SNES", options);

    expect(imageSpy).toHaveBeenCalledTimes(1);
  });

  it("should evict least-recently-used entries to satisfy both limits", () => {
    const evictions = selectLibraryImageCacheEvictions(
      [
        { id: "old", bytes: 40, lastAccess: 1 },
        { id: "middle", bytes: 40, lastAccess: 2 },
        { id: "new", bytes: 40, lastAccess: 3 },
      ],
      { maxBytes: 80, maxEntries: 2 },
    );

    expect(evictions).toEqual(["old"]);
  });
});
