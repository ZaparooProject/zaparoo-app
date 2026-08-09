import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@/test-utils";
import { CoreAPI } from "@/lib/coreApi";
import type {
  MediaBrowseEntry,
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
        targetDeviceAddress: "device-a",
        systemId: "SNES",
        path: "",
        sort: "name-desc",
        enabled: true,
      }),
    );

    await waitFor(() =>
      expect(result.current.entries.map((entry) => entry.name)).toEqual([
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
        targetDeviceAddress: "device-a",
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
      expect(result.current.entries.map((entry) => entry.name)).toEqual([
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
        targetDeviceAddress: "device-a",
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

  it("should use bounded larger pages when loading through a jump target", async () => {
    const requestedLimits: number[] = [];
    vi.spyOn(CoreAPI, "mediaBrowse").mockImplementation(
      async (params: MediaBrowseParams) => {
        requestedLimits.push(params.maxResults ?? 0);
        if (!params.cursor) {
          return {
            path: "/roms/SNES",
            entries: entries(1, 2),
            totalFiles: 1500,
            pagination: {
              hasNextPage: true,
              pageSize: 100,
              nextCursor: "next-1",
            },
          };
        }
        return {
          path: "/roms/SNES",
          entries: entries(3, params.maxResults ?? 0),
          totalFiles: 1500,
          pagination: {
            hasNextPage: false,
            pageSize: params.maxResults ?? 0,
            nextCursor: null,
          },
        };
      },
    );
    const { result } = renderHook(() =>
      useLibraryBrowse({
        targetDeviceAddress: "device-a",
        systemId: "SNES",
        path: "/roms/SNES",
        enabled: true,
      }),
    );

    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    let loaded = false;
    await act(async () => {
      loaded = await result.current.loadThroughIndex(1000);
    });

    expect(loaded).toBe(true);
    expect(requestedLimits).toEqual([100, 1000]);
    await waitFor(() => expect(result.current.entries).toHaveLength(1002));
  });
});
