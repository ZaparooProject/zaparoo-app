import { describe, expect, it, vi } from "vitest";
import {
  collapseRedundantSystemRoots,
  collectLibraryMetadata,
  compactLibraryTag,
  deriveLibraryImageTypes,
  entrySystemId,
  favoriteUpdateParams,
  hasFavoriteTag,
  isMediaCapableEntry,
  isPlainFolderEntry,
  libraryEntryDisplayName,
  libraryEntryTags,
  mediaImageDataUrl,
  MAX_SINGLETON_FOLDER_RESOLUTIONS_PER_PAGE,
  organizeLibraryDetailTags,
  resolveLibraryLaunchText,
  resolveSingletonFolderEntries,
  resolveSingletonFolderEntry,
  soleInitialRootPath,
} from "@/lib/libraryMedia";
import type {
  MediaBrowseEntry,
  MediaBrowseResponse,
  MediaMeta,
  MediaMetaResponse,
} from "@/lib/models";

function browseEntry(
  overrides: Partial<MediaBrowseEntry> = {},
): MediaBrowseEntry {
  return {
    name: "Super Game",
    path: "/roms/SNES/Super Game.sfc",
    type: "media",
    systemId: "SNES",
    ...overrides,
  };
}

function mediaMeta(overrides: Partial<MediaMeta> = {}): MediaMeta {
  return {
    path: "/roms/SNES/Super Game.sfc",
    parentDir: "/roms/SNES",
    isMissing: false,
    tags: [{ type: "region", tag: "us" }],
    properties: {},
    title: {
      slug: "super-game",
      name: "Super Game",
      slugLength: 10,
      slugWordCount: 2,
      system: { id: "SNES", name: "Super Nintendo" },
      tags: [{ type: "developer", tag: "Studio" }],
      properties: {},
    },
    ...overrides,
  };
}

function browseResponse(entries: MediaBrowseEntry[]): MediaBrowseResponse {
  return {
    path: "/roms/SNES",
    entries,
    totalFiles: entries.filter((entry) => entry.type === "media").length,
  };
}

describe("Library media helpers", () => {
  it("should return a trimmed fallback system ID from entry system IDs", () => {
    expect(
      entrySystemId(
        browseEntry({ systemId: undefined, systemIds: ["", "  SNES  "] }),
      ),
    ).toBe("SNES");
  });

  it("should distinguish folders from media-capable directories", () => {
    const folder = browseEntry({ type: "directory", mediaId: undefined });
    const container = browseEntry({ type: "directory", mediaId: 42 });

    expect(isPlainFolderEntry(folder)).toBe(true);
    expect(isMediaCapableEntry(folder)).toBe(false);
    expect(isPlainFolderEntry(container)).toBe(false);
    expect(isMediaCapableEntry(container)).toBe(true);
  });

  it("should collapse a parent system root fully covered by descendants", () => {
    const entries = [
      browseEntry({
        type: "root",
        name: "games",
        path: "/media/fat/games",
        fileCount: 15,
      }),
      browseEntry({
        type: "root",
        name: "NES",
        path: "/media/fat/games/NES",
        fileCount: 10,
      }),
      browseEntry({
        type: "root",
        name: "NES Hacks",
        path: "/media/fat/games/NES Hacks",
        fileCount: 5,
      }),
    ];

    expect(
      collapseRedundantSystemRoots(entries).map((entry) => entry.path),
    ).toEqual(["/media/fat/games/NES", "/media/fat/games/NES Hacks"]);
  });

  it("should retain distinct or uncertain system roots", () => {
    const entries = [
      browseEntry({
        type: "root",
        path: "/media/fat/games",
        fileCount: 20,
      }),
      browseEntry({
        type: "root",
        path: "/media/fat/games/NES",
        fileCount: 10,
      }),
      browseEntry({
        type: "root",
        path: "/media/fat/games-extra",
        fileCount: 20,
      }),
      browseEntry({ type: "root", path: "box://", fileCount: 20 }),
    ];

    expect(collapseRedundantSystemRoots(entries)).toEqual(entries);
    expect(
      collapseRedundantSystemRoots([
        { ...entries[0]!, fileCount: 10 },
        { ...entries[1]!, fileCount: undefined },
      ]),
    ).toHaveLength(2);
  });

  it("should auto-enter a sole root after collapsing its covered parent", () => {
    const response = browseResponse([
      browseEntry({
        type: "root",
        path: "/media/fat/games",
        fileCount: 10,
      }),
      browseEntry({
        type: "root",
        path: "/media/fat/games/CPS2",
        fileCount: 10,
      }),
    ]);

    expect(soleInitialRootPath(response)).toBe("/media/fat/games/CPS2");
  });

  it("should auto-enter only a sole non-cyclic initial root", () => {
    const response = browseResponse([
      browseEntry({ type: "root", path: "/roms/SNES" }),
    ]);

    expect(soleInitialRootPath(response)).toBe("/roms/SNES");
    expect(soleInitialRootPath(response, "/roms/SNES")).toBeNull();
    expect(
      soleInitialRootPath({
        ...response,
        pagination: { hasNextPage: true, nextCursor: "next", pageSize: 1 },
      }),
    ).toBeNull();
  });

  it("should resolve a singleton folder chain to its game", async () => {
    const folder = browseEntry({
      mediaId: undefined,
      name: "Game Folder",
      path: "/roms/SNES/Game Folder",
      type: "directory",
      fileCount: 1,
    });
    const mediaBrowse = vi
      .fn()
      .mockResolvedValueOnce(
        browseResponse([
          browseEntry({
            mediaId: undefined,
            name: "Disc",
            path: "/roms/SNES/Game Folder/Disc",
            type: "directory",
            fileCount: 1,
          }),
        ]),
      )
      .mockResolvedValueOnce(
        browseResponse([
          browseEntry({
            name: "Game Title",
            path: "/roms/SNES/Game Folder/Disc/Game.sfc",
          }),
        ]),
      );

    const collapsed = await resolveSingletonFolderEntry(
      folder,
      "SNES",
      undefined,
      { mediaBrowse },
    );

    expect(collapsed).toEqual(
      expect.objectContaining({
        name: "Game Title",
        path: "/roms/SNES/Game Folder/Disc/Game.sfc",
        type: "media",
        systemId: "SNES",
      }),
    );
    expect(mediaBrowse).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ path: "/roms/SNES/Game Folder/Disc" }),
      undefined,
    );
  });

  it("should skip multi-item folders", async () => {
    const mediaBrowse = vi.fn();
    const result = await resolveSingletonFolderEntry(
      browseEntry({
        mediaId: undefined,
        name: "Collection",
        path: "/roms/SNES/Collection",
        type: "directory",
        fileCount: 2,
      }),
      "SNES",
      undefined,
      { mediaBrowse },
    );

    expect(result).toBeNull();
    expect(mediaBrowse).not.toHaveBeenCalled();
  });

  it("should bound singleton folder resolution work per page", async () => {
    const folders = Array.from(
      { length: MAX_SINGLETON_FOLDER_RESOLUTIONS_PER_PAGE + 3 },
      (_, index) =>
        browseEntry({
          mediaId: undefined,
          name: `Folder ${index}`,
          path: `/roms/SNES/Folder ${index}`,
          type: "directory",
          fileCount: 1,
        }),
    );
    const mediaBrowse = vi.fn().mockResolvedValue(browseResponse([]));

    const result = await resolveSingletonFolderEntries(
      folders,
      "SNES",
      undefined,
      { mediaBrowse },
    );

    expect(result).toEqual(folders);
    expect(mediaBrowse).toHaveBeenCalledTimes(
      MAX_SINGLETON_FOLDER_RESOLUTIONS_PER_PAGE,
    );
  });

  it("should honor filename display preference for media only", () => {
    expect(libraryEntryDisplayName(browseEntry(), false)).toBe("Super Game");
    expect(libraryEntryDisplayName(browseEntry(), true)).toBe("Super Game");
    expect(
      libraryEntryDisplayName(
        browseEntry({
          name: "Clean title",
          path: "/roms/SNES/original-file.sfc",
        }),
        true,
      ),
    ).toBe("original-file");
  });

  it("should normalize MiSTer menu folder names outside games", () => {
    expect(
      libraryEntryDisplayName(
        browseEntry({
          name: "_Arcade.zip",
          path: "/media/fat/_Arcade.zip",
          type: "directory",
        }),
        false,
        "MiSTer",
      ),
    ).toBe("Arcade");
    expect(
      libraryEntryDisplayName(
        browseEntry({
          name: "__Tools.ZIP",
          path: "/media/fat/_Utility/__Tools.ZIP",
          type: "directory",
        }),
        false,
        "mister",
      ),
    ).toBe("Tools");
  });

  it("should preserve MiSTer game-folder underscores while trimming zip", () => {
    expect(
      libraryEntryDisplayName(
        browseEntry({
          name: "_Favorites.zip",
          path: "/media/fat/games/SNES/_Favorites.zip",
          type: "directory",
        }),
        false,
        "mister",
      ),
    ).toBe("_Favorites");
  });

  it("should not normalize non-MiSTer or media labels", () => {
    const folder = browseEntry({
      name: "_Arcade.zip",
      path: "/media/fat/_Arcade.zip",
      type: "directory",
    });
    expect(libraryEntryDisplayName(folder, false, "linux")).toBe("_Arcade.zip");
    expect(
      libraryEntryDisplayName(
        browseEntry({
          name: "_Arcade.zip",
          path: "/media/fat/_Arcade.zip",
        }),
        false,
        "mister",
      ),
    ).toBe("_Arcade.zip");
  });

  it("should collect descriptions and tags without exposing raw properties", () => {
    const result = collectLibraryMetadata(
      mediaMeta({
        properties: {
          "property:manual": {
            text: "/manual.pdf",
            contentType: "application/pdf",
          },
        },
        title: {
          ...mediaMeta().title,
          properties: {
            "property:description": {
              text: "A platform adventure.",
              contentType: "",
            },
            "property:image-boxart": {
              text: "/cover.png",
              contentType: "image/png",
            },
            "property:publisher": { text: "Publisher", contentType: "" },
          },
        },
      }),
    );

    expect(result.description).toBe("A platform adventure.");
    expect(result.tags).toEqual([
      { type: "developer", tag: "Studio" },
      { type: "region", tag: "us" },
    ]);
    expect(result).not.toHaveProperty("textProperties");
  });

  it("should organize user-facing facts while omitting internal tags", () => {
    const result = organizeLibraryDetailTags([
      { type: "developer", tag: "studio", label: "Studio" },
      { type: "year", tag: "1994" },
      { type: "region", tag: "us" },
      { type: "scraper.gamelist.xml", tag: "scraped" },
      { type: "user", tag: "favorite" },
    ]);

    expect(result.facts).toEqual([
      { type: "year", values: ["1994"] },
      { type: "developer", values: ["Studio"] },
    ]);
    expect(result.tags).toEqual([{ type: "region", tag: "us" }]);
  });

  it("should detect and build favorite updates without displaying user tags", () => {
    const entry = browseEntry({
      mediaId: 42,
      tags: [{ type: "user", tag: "favorite" }],
    });

    expect(hasFavoriteTag(entry.tags)).toBe(true);
    expect(favoriteUpdateParams(entry, "SNES", false)).toEqual({
      mediaId: 42,
      remove: ["user:favorite"],
    });
    expect(
      favoriteUpdateParams(
        browseEntry({ mediaId: undefined, systemId: undefined }),
        "SNES",
        true,
      ),
    ).toEqual({
      system: "SNES",
      path: "/roms/SNES/Super Game.sfc",
      add: ["user:favorite"],
    });
  });

  it("should return only deduplicated disambiguating tags for list rows", () => {
    const entry = browseEntry({
      disambiguatingTags: [
        { type: "region", tag: "world" },
        { type: "disc", tag: "2" },
        { type: "disc", tag: "2" },
      ],
      tags: [
        { type: "disc", tag: "2" },
        { type: "extension", tag: "zip" },
        { type: "scraped", tag: "true" },
      ],
    });

    expect(libraryEntryTags(entry)).toEqual([
      { type: "region", tag: "world" },
      { type: "disc", tag: "2" },
    ]);
  });

  it("should compact Library tags for fixed-height rows", () => {
    expect(compactLibraryTag({ type: "region", tag: "world" })).toBe("W");
    expect(compactLibraryTag({ type: "lang", tag: "us,eu" })).toBe("US/EU");
    expect(compactLibraryTag({ type: "disc", tag: "2" })).toBe("D2");
    expect(compactLibraryTag({ type: "rev", tag: "revision-a" })).toBe("RA");
    expect(compactLibraryTag({ type: "players", tag: "2" })).toBe("2P");
    expect(compactLibraryTag({ type: "builddate", tag: "1996-10-04" })).toBe(
      "'96",
    );
    expect(compactLibraryTag({ type: "edition", tag: "directors-cut" })).toBe(
      "DC",
    );
    expect(
      compactLibraryTag({ type: "control", tag: "homebrew-translation" }),
    ).toBe("homebrew-trans");
  });

  it("should derive ordered supported image types and safe data URLs", () => {
    const meta = mediaMeta({
      availableImageTypes: ["boxart", "unknown"],
      title: {
        ...mediaMeta().title,
        availableImageTypes: ["screenshot", "boxart"],
      },
    });

    expect(deriveLibraryImageTypes(meta)).toEqual(["boxart", "screenshot"]);
    expect(mediaImageDataUrl({ contentType: "image/webp", data: "AAAA" })).toBe(
      "data:image/webp;base64,AAAA",
    );
    expect(
      mediaImageDataUrl({ contentType: "image/svg+xml", data: "AAAA" }),
    ).toBeNull();
  });

  it("should launch ordinary media by exact path", async () => {
    const api = {
      mediaMeta: vi.fn(),
      mediaBrowse: vi.fn(),
    };

    await expect(
      resolveLibraryLaunchText(browseEntry(), "SNES", undefined, api),
    ).resolves.toBe("/roms/SNES/Super Game.sfc");
    expect(api.mediaMeta).not.toHaveBeenCalled();
    expect(api.mediaBrowse).not.toHaveBeenCalled();
  });

  it("should resolve container media through metadata first", async () => {
    const metaResponse: MediaMetaResponse = {
      media: mediaMeta({ path: "/roms/PSX/Game/Game.m3u" }),
    };
    const api = {
      mediaMeta: vi.fn(async () => metaResponse),
      mediaBrowse: vi.fn(),
    };

    await expect(
      resolveLibraryLaunchText(
        browseEntry({
          type: "directory",
          mediaId: 42,
          path: "/roms/PSX/Game",
          systemId: "PSX",
        }),
        "PSX",
        undefined,
        api,
      ),
    ).resolves.toBe("/roms/PSX/Game/Game.m3u");
    expect(api.mediaBrowse).not.toHaveBeenCalled();
  });

  it("should prefer matching and playlist child paths for containers", async () => {
    const api = {
      mediaMeta: vi.fn(async () => {
        throw new Error("metadata missing");
      }),
      mediaBrowse: vi.fn(async () =>
        browseResponse([
          browseEntry({ mediaId: 42, path: "/roms/PSX/Game/Disc 1.chd" }),
          browseEntry({ mediaId: 42, path: "/roms/PSX/Game/Game.m3u" }),
        ]),
      ),
    };

    await expect(
      resolveLibraryLaunchText(
        browseEntry({
          type: "directory",
          mediaId: 42,
          path: "/roms/PSX/Game",
          systemId: "PSX",
        }),
        "PSX",
        undefined,
        api,
      ),
    ).resolves.toBe("/roms/PSX/Game/Game.m3u");
  });

  it("should never launch an unresolved container directory path", async () => {
    const api = {
      mediaMeta: vi.fn(async () => {
        throw new Error("metadata missing");
      }),
      mediaBrowse: vi.fn(async () => browseResponse([])),
    };

    await expect(
      resolveLibraryLaunchText(
        browseEntry({
          type: "directory",
          mediaId: 42,
          path: "/roms/PSX/Game",
          zapScript: undefined,
        }),
        "PSX",
        undefined,
        api,
      ),
    ).resolves.toBeNull();
  });
});
