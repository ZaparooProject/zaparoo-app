import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  createProvidersWithQueryClient,
  createTestQueryClient,
  renderHook,
  waitFor,
} from "@/test-utils";
import { CoreAPI, CoreApiError } from "@/lib/coreApi";
import { libraryBrowseIndexQueryOptions } from "@/lib/libraryBrowse";
import type { LibraryBrowseWindow } from "@/lib/librarySessionStore";
import type {
  MediaBrowseEntry,
  MediaBrowseIndexResponse,
  MediaBrowseParams,
  MediaBrowseResponse,
} from "@/lib/models";
import { useLibraryBrowse } from "@/hooks/useLibraryBrowse";

function entries(start: number, count: number): MediaBrowseEntry[] {
  return Array.from({ length: count }, (_, offset) => ({
    mediaId: start + offset,
    name: `Game ${start + offset}`,
    path: `/roms/SNES/game-${start + offset}.sfc`,
    type: "media" as const,
    systemId: "SNES",
  }));
}

const SCOPE = {
  deviceKey: "device-a",
  systemId: "SNES",
  path: "/roms/SNES",
  sort: "name-asc" as const,
};

const INDEX: MediaBrowseIndexResponse = {
  scheme: "latin",
  totalFiles: 1700,
  groups: [
    { key: "A", label: "A", count: 400, cursor: "", offset: 0 },
    { key: "S", label: "S", count: 1100, cursor: "letter-s", offset: 400 },
    { key: "T", label: "T", count: 200, cursor: "letter-t", offset: 1500 },
  ],
};

const T_WINDOW: LibraryBrowseWindow = {
  anchorKey: "T",
  anchorStart: 1502,
  totalDirs: 2,
  loadedKeys: [],
};

function directories(count: number): MediaBrowseEntry[] {
  return Array.from({ length: count }, (_, offset) => ({
    name: `Folder ${offset + 1}`,
    path: `/roms/SNES/folder-${offset + 1}`,
    type: "directory" as const,
    fileCount: 2,
  }));
}

function page(
  pageEntries: MediaBrowseEntry[],
  nextCursor: string | null,
  totalDirs?: number,
): MediaBrowseResponse {
  return {
    path: SCOPE.path,
    entries: pageEntries,
    totalFiles: 1700,
    totalDirs,
    pagination: {
      hasNextPage: nextCursor !== null,
      pageSize: pageEntries.length,
      nextCursor,
    },
  };
}

// Two directories followed by 1700 files, bucketed as in INDEX.
async function browseLibrary(params: MediaBrowseParams) {
  const maxResults = params.maxResults ?? 100;
  switch (params.cursor) {
    case undefined:
      return page(
        [...directories(2), ...entries(1, maxResults - 2)],
        "after-top",
        2,
      );
    case "letter-s":
      return page(entries(401, maxResults), "letter-s-2");
    case "letter-s-2":
      return page(entries(1401, maxResults), "letter-t");
    case "letter-t":
      return page(entries(1501, maxResults), "after-t");
    default:
      return page([], null);
  }
}

function renderWindowedBrowse(initialWindow: LibraryBrowseWindow | null) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(
    libraryBrowseIndexQueryOptions(SCOPE).queryKey,
    INDEX,
  );
  const view = renderHook(
    () => {
      const [browseWindow, setBrowseWindow] =
        useState<LibraryBrowseWindow | null>(initialWindow);
      const browse = useLibraryBrowse({
        ...SCOPE,
        enabled: true,
        browseWindow,
        updateBrowseWindow: setBrowseWindow,
      });
      return { browse, browseWindow };
    },
    { wrapper: createProvidersWithQueryClient(queryClient) },
  );
  return { ...view, queryClient };
}

function browseCursors() {
  return vi
    .mocked(CoreAPI.mediaBrowse)
    .mock.calls.map(([params]) => params.cursor);
}

describe("useLibraryBrowse", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should sort system roots when Core returns an unsorted route list", async () => {
    vi.spyOn(CoreAPI, "mediaBrowse").mockResolvedValue({
      path: "",
      entries: [
        {
          name: "Alpha",
          path: "/roms/SNES/Alpha",
          type: "root",
        },
        {
          name: "Zulu",
          path: "/roms/SNES/Zulu",
          type: "root",
        },
      ],
      totalFiles: 0,
    });
    const { result } = renderHook(() =>
      useLibraryBrowse({
        deviceKey: "device-a",
        systemId: "SNES",
        path: "",
        sort: "name-desc",
        enabled: true,
      }),
    );

    await waitFor(() =>
      expect(result.current.entries.map((entry) => entry?.name)).toEqual([
        "Zulu",
        "Alpha",
      ]),
    );
  });

  it("should finish singleton collapse before exposing browse entries", async () => {
    let resolveSingleton: (response: MediaBrowseResponse) => void = () => {};
    const singletonResponse = new Promise<MediaBrowseResponse>((resolve) => {
      resolveSingleton = resolve;
    });
    const folder: MediaBrowseEntry = {
      name: "Game Folder",
      path: "/roms/SNES/Game Folder",
      type: "directory",
      fileCount: 1,
    };
    vi.spyOn(CoreAPI, "mediaBrowse").mockImplementation(async (params) => {
      if (params.path === folder.path) return singletonResponse;
      return {
        path: "/roms/SNES",
        entries: [folder],
        totalFiles: 1,
      };
    });
    const { result } = renderHook(() =>
      useLibraryBrowse({
        deviceKey: "device-a",
        systemId: "SNES",
        path: "/roms/SNES",
        enabled: true,
      }),
    );

    await waitFor(() =>
      expect(CoreAPI.mediaBrowse).toHaveBeenCalledWith(
        expect.objectContaining({ path: folder.path }),
        expect.any(AbortSignal),
      ),
    );
    expect(result.current.isLoading).toBe(true);
    expect(result.current.entries).toEqual([]);

    resolveSingleton({
      path: folder.path,
      entries: [
        {
          mediaId: 1,
          name: "Game Title",
          path: `${folder.path}/Game.sfc`,
          type: "media",
          systemId: "SNES",
        },
      ],
      totalFiles: 1,
    });

    await waitFor(() =>
      expect(result.current.entries.map((entry) => entry?.name)).toEqual([
        "Game Title",
      ]),
    );
    expect(result.current.isLoading).toBe(false);
  });

  it("should append opaque cursor pages without deduplicating entries", async () => {
    const browseSpy = vi
      .spyOn(CoreAPI, "mediaBrowse")
      .mockResolvedValueOnce({
        path: "/roms/SNES",
        entries: entries(1, 2),
        totalFiles: 4,
        pagination: {
          hasNextPage: true,
          pageSize: 2,
          nextCursor: "opaque-next",
        },
      })
      .mockResolvedValueOnce({
        path: "/roms/SNES",
        entries: entries(3, 2),
        totalFiles: 4,
        pagination: { hasNextPage: false, pageSize: 2, nextCursor: null },
      });
    const { result } = renderHook(() =>
      useLibraryBrowse({
        deviceKey: "device-a",
        systemId: "SNES",
        path: "/roms/SNES",
        sort: "filename-asc",
        enabled: true,
      }),
    );

    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    await act(() => result.current.fetchMore());

    await waitFor(() => expect(result.current.entries).toHaveLength(4));
    expect(browseSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        cursor: "opaque-next",
        maxResults: 100,
        sort: "filename-asc",
      }),
      expect.any(AbortSignal),
    );
  });

  it("should start a jumped list at its bucket cursor with earlier rows unloaded", async () => {
    vi.spyOn(CoreAPI, "mediaBrowse").mockImplementation(browseLibrary);
    const { result } = renderWindowedBrowse(T_WINDOW);

    await waitFor(() =>
      expect(result.current.browse.entries).toHaveLength(1602),
    );
    expect(result.current.browse.entries[1501]).toBeUndefined();
    expect(result.current.browse.entries[1502]?.name).toBe("Game 1501");
    expect(result.current.browse.totalDirs).toBe(2);
    expect(CoreAPI.mediaBrowse).toHaveBeenCalledTimes(1);
    expect(CoreAPI.mediaBrowse).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: "letter-t", maxResults: 100 }),
      expect.any(AbortSignal),
    );
  });

  it("should load an earlier bucket once in pages of at most 1000 rows", async () => {
    vi.spyOn(CoreAPI, "mediaBrowse").mockImplementation(browseLibrary);
    const { result } = renderWindowedBrowse(T_WINDOW);
    await waitFor(() =>
      expect(result.current.browse.entries[1502]).toBeDefined(),
    );

    act(() => result.current.browse.loadIndex(1000));

    await waitFor(() =>
      expect(result.current.browse.entries[1501]?.name).toBe("Game 1500"),
    );
    expect(result.current.browse.entries[402]?.name).toBe("Game 401");
    expect(result.current.browse.entries[401]).toBeUndefined();
    expect(
      vi
        .mocked(CoreAPI.mediaBrowse)
        .mock.calls.map(([params]) => [params.cursor, params.maxResults]),
    ).toEqual([
      ["letter-t", 100],
      ["letter-s", 1000],
      ["letter-s-2", 100],
    ]);

    act(() => result.current.browse.loadIndex(1200));
    expect(result.current.browseWindow?.loadedKeys).toEqual(["S"]);
    expect(CoreAPI.mediaBrowse).toHaveBeenCalledTimes(3);
  });

  it("should load the first bucket together with its leading directories", async () => {
    vi.spyOn(CoreAPI, "mediaBrowse").mockImplementation(browseLibrary);
    const { result } = renderWindowedBrowse(T_WINDOW);
    await waitFor(() =>
      expect(result.current.browse.entries[1502]).toBeDefined(),
    );

    act(() => result.current.browse.loadIndex(0));

    await waitFor(() =>
      expect(result.current.browse.entries[401]?.name).toBe("Game 400"),
    );
    expect(result.current.browse.entries[0]?.type).toBe("directory");
    expect(result.current.browse.entries[402]).toBeUndefined();
    expect(CoreAPI.mediaBrowse).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: undefined, maxResults: 402 }),
      expect.any(AbortSignal),
    );
  });

  it("should retry an expired bucket cursor from a fresh index", async () => {
    const calls: string[] = [];
    vi.spyOn(CoreAPI, "mediaBrowse").mockImplementation(async (params) => {
      calls.push(`browse:${params.cursor}`);
      if (params.cursor === "letter-t") {
        throw new CoreApiError(
          "library visibility changed; restart browse without cursor",
          -32602,
        );
      }
      return page(entries(1501, 100), null);
    });
    vi.spyOn(CoreAPI, "mediaBrowseIndex").mockImplementation(async () => {
      calls.push("index");
      return {
        ...INDEX,
        groups: INDEX.groups.map((group) =>
          group.key === "T" ? { ...group, cursor: "letter-t-2" } : group,
        ),
      };
    });
    const { result } = renderWindowedBrowse(T_WINDOW);

    await waitFor(() =>
      expect(result.current.browse.entries[1502]).toBeDefined(),
    );
    expect(calls).toEqual(["browse:letter-t", "index", "browse:letter-t-2"]);
  });

  it("should refetch a jumped list from its bucket rather than the top", async () => {
    vi.spyOn(CoreAPI, "mediaBrowse").mockImplementation(browseLibrary);
    const { result } = renderWindowedBrowse(T_WINDOW);
    await waitFor(() =>
      expect(result.current.browse.entries[1502]).toBeDefined(),
    );
    vi.spyOn(CoreAPI, "mediaBrowseIndex").mockResolvedValue(INDEX);

    await act(() => result.current.browse.refetch());

    expect(browseCursors()).toEqual(["letter-t", "letter-t"]);
    expect(result.current.browse.entries).toHaveLength(1602);
  });

  it("should return to the top list when a refreshed index drops the anchor", async () => {
    vi.spyOn(CoreAPI, "mediaBrowse").mockImplementation(browseLibrary);
    const { result, queryClient } = renderWindowedBrowse(T_WINDOW);
    await waitFor(() =>
      expect(result.current.browse.entries[1502]).toBeDefined(),
    );

    act(() => {
      queryClient.setQueryData(libraryBrowseIndexQueryOptions(SCOPE).queryKey, {
        ...INDEX,
        groups: INDEX.groups.filter((group) => group.key !== "T"),
      });
    });

    await waitFor(() => expect(result.current.browseWindow).toBeNull());
    await waitFor(() =>
      expect(result.current.browse.entries).toHaveLength(100),
    );
  });

  it("should keep a failed bucket unloaded until it is retried", async () => {
    let bucketFails = true;
    vi.spyOn(CoreAPI, "mediaBrowse").mockImplementation(async (params) => {
      if (params.cursor === "letter-s" && bucketFails) {
        throw new Error("bucket failed");
      }
      return browseLibrary(params);
    });
    const { result } = renderWindowedBrowse(T_WINDOW);
    await waitFor(() =>
      expect(result.current.browse.entries[1502]).toBeDefined(),
    );

    act(() => result.current.browse.loadIndex(1000));

    await waitFor(() =>
      expect(result.current.browse.failedRanges).toEqual([
        { start: 402, end: 1502 },
      ]),
    );
    const failedCalls = vi.mocked(CoreAPI.mediaBrowse).mock.calls.length;
    act(() => result.current.browse.loadIndex(1000));
    expect(CoreAPI.mediaBrowse).toHaveBeenCalledTimes(failedCalls);

    bucketFails = false;
    act(() => result.current.browse.loadIndex(1000, { retry: true }));

    await waitFor(() =>
      expect(result.current.browse.entries[402]?.name).toBe("Game 401"),
    );
    expect(result.current.browse.failedRanges).toEqual([]);
  });

  it("should jump from the top list with a single bucket cursor request", async () => {
    vi.spyOn(CoreAPI, "mediaBrowse").mockImplementation(browseLibrary);
    const { result } = renderWindowedBrowse(null);
    await waitFor(() =>
      expect(result.current.browse.entries).toHaveLength(100),
    );

    const tGroup = INDEX.groups[2]!;
    let jump: Awaited<ReturnType<typeof result.current.browse.jumpToGroup>>;
    await act(async () => {
      jump = await result.current.browse.jumpToGroup(tGroup);
    });
    expect(jump!).toEqual({
      targetIndex: 1502,
      anchor: T_WINDOW,
    });
    expect(result.current.browseWindow).toBeNull();

    act(() => result.current.browse.commitJump(jump));

    await waitFor(() =>
      expect(result.current.browse.entries[1502]?.name).toBe("Game 1501"),
    );
    expect(browseCursors()).toEqual([undefined, "letter-t"]);
  });

  it("should page through leading directories when jumping to the first bucket", async () => {
    const requestedLimits: number[] = [];
    vi.spyOn(CoreAPI, "mediaBrowse").mockImplementation(
      async (params: MediaBrowseParams) => {
        requestedLimits.push(params.maxResults ?? 0);
        return params.cursor
          ? page([...directories(50), ...entries(1, 50)], null, 150)
          : page(directories(100), "more-directories", 150);
      },
    );
    const { result } = renderWindowedBrowse(null);
    await waitFor(() =>
      expect(result.current.browse.entries).toHaveLength(100),
    );

    let jump: Awaited<ReturnType<typeof result.current.browse.jumpToGroup>>;
    await act(async () => {
      jump = await result.current.browse.jumpToGroup(INDEX.groups[0]!);
    });

    expect(jump!).toEqual({ targetIndex: 150 });
    expect(requestedLimits).toEqual([100, 100]);
    await waitFor(() =>
      expect(result.current.browse.entries).toHaveLength(200),
    );
  });
});
