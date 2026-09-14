import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { act, fireEvent, render, screen, waitFor, within } from "@/test-utils";
import { CoreAPI } from "@/lib/coreApi";
import type {
  MediaBrowseEntry,
  MediaBrowseIndexResponse,
  MediaBrowseParams,
  MediaBrowseResponse,
} from "@/lib/models";
import { useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import {
  libraryBrowseScrollKey,
  useLibrarySessionStore,
} from "@/lib/librarySessionStore";
import { useTabSessionStore } from "@/lib/tabSessionStore";
import { LibrarySystem } from "@/routes/library.$system";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";

const {
  mockErrorToast,
  mockNavigate,
  mockOutOfRangeScroll,
  mockScrollToIndex,
  mockVirtualScroll,
} = vi.hoisted(() => ({
  mockErrorToast: vi.fn(),
  mockNavigate: vi.fn(),
  mockOutOfRangeScroll: vi.fn(),
  mockScrollToIndex: vi.fn(),
  mockVirtualScroll: { startIndex: 0 },
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: unknown) => options,
    useNavigate: () => mockNavigate,
    useParams: () => ({ system: "SNES" }),
  };
});

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => {
    const startIndex = Math.max(
      0,
      Math.min(mockVirtualScroll.startIndex, count - 1),
    );
    const length = Math.max(0, Math.min(count - startIndex, 5));
    return {
      getVirtualItems: () =>
        Array.from({ length }, (_, offset) => ({
          key: startIndex + offset,
          index: startIndex + offset,
          size: 88,
          start: (startIndex + offset) * 88,
        })),
      getTotalSize: () => count * 88,
      measureElement: vi.fn(),
      measure: vi.fn(),
      isScrolling: false,
      range:
        length > 0 ? { startIndex, endIndex: startIndex + length - 1 } : null,
      scrollToIndex: (index: number, options: { align: string }) => {
        if (index >= count) mockOutOfRangeScroll(index, count);
        mockVirtualScroll.startIndex = index;
        mockScrollToIndex(index, options);
      },
    };
  },
}));

vi.mock("@/lib/toastUtils", () => ({
  showRateLimitedErrorToast: mockErrorToast,
}));

vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: () => undefined,
}));

vi.mock("@/hooks/useBackButtonHandler", () => ({
  useBackButtonHandler: vi.fn(),
}));

vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: () => ({}),
}));

vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({ impact: vi.fn() }),
}));

vi.mock("@/lib/libraryImages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/libraryImages")>();
  return {
    ...actual,
    requestLibraryImage: vi.fn().mockResolvedValue(null),
  };
});

function mediaEntry(
  overrides: Partial<MediaBrowseEntry> = {},
): MediaBrowseEntry {
  return {
    mediaId: 1,
    name: "Super Game",
    path: "/roms/SNES/Super Game.sfc",
    type: "media",
    systemId: "SNES",
    ...overrides,
  };
}

function browseResult(path: string, entries: MediaBrowseEntry[]) {
  return {
    path,
    entries,
    totalFiles: entries.filter((entry) => entry.type === "media").length,
    totalDirs: entries.filter((entry) => entry.type !== "media").length,
  };
}

const ARCADE_ROOT = mediaEntry({
  mediaId: undefined,
  name: "Arcade",
  path: "/media/fat/_Arcade",
  type: "root",
});

const LETTER_INDEX: MediaBrowseIndexResponse = {
  scheme: "latin",
  totalFiles: 600,
  groups: [
    { key: "A", label: "A", count: 400, cursor: "", offset: 0 },
    { key: "S", label: "S", count: 100, cursor: "letter-s", offset: 400 },
    { key: "T", label: "T", count: 100, cursor: "letter-t", offset: 500 },
  ],
};

function arcadeFiles(first: number, count: number): MediaBrowseEntry[] {
  return Array.from({ length: count }, (_, offset) =>
    mediaEntry({
      mediaId: first + offset,
      name: `Game ${first + offset}`,
      path: `/media/fat/_Arcade/game-${first + offset}.mra`,
    }),
  );
}

// Two directories followed by 600 files, bucketed as in LETTER_INDEX.
async function browseArcade(
  params: MediaBrowseParams,
): Promise<MediaBrowseResponse> {
  if (!params.path) return browseResult("", [ARCADE_ROOT]);
  const listing = (entries: MediaBrowseEntry[], nextCursor: string | null) => ({
    path: params.path ?? "",
    entries,
    totalFiles: 600,
    totalDirs: params.cursor ? 0 : 2,
    pagination: {
      hasNextPage: nextCursor !== null,
      pageSize: params.maxResults ?? 100,
      nextCursor,
    },
  });
  const maxResults = params.maxResults ?? 100;
  switch (params.cursor) {
    case undefined:
      return listing(
        [
          mediaEntry({
            mediaId: undefined,
            name: "Bootlegs",
            path: "/media/fat/_Arcade/Bootlegs",
            type: "directory",
            fileCount: 3,
          }),
          mediaEntry({
            mediaId: undefined,
            name: "Hacks",
            path: "/media/fat/_Arcade/Hacks",
            type: "directory",
            fileCount: 3,
          }),
          ...arcadeFiles(1, maxResults - 2),
        ],
        "next-page",
      );
    case "letter-s":
      return listing(arcadeFiles(401, maxResults), "letter-t");
    case "letter-t":
      return listing(arcadeFiles(501, maxResults), null);
    default:
      return listing(arcadeFiles(99, maxResults), "next-page");
  }
}

function arcadeBrowseCursors() {
  return vi
    .mocked(CoreAPI.mediaBrowse)
    .mock.calls.filter(([params]) => params.path === ARCADE_ROOT.path)
    .map(([params]) => params.cursor);
}

async function chooseLetter(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await user.click(
    await screen.findByRole("button", { name: "library.optionsTitle" }),
  );
  await user.click(
    within(
      screen.getByRole("dialog", { name: "library.optionsTitle" }),
    ).getByRole("button", { name: "library.goToTitle" }),
  );
  await user.click(
    within(
      await screen.findByRole("dialog", { name: "library.goToTitle" }),
    ).getByRole("button", { name: `${label} library.itemCount` }),
  );
}

function metadataResult(name: string, path: string) {
  return {
    media: {
      path,
      parentDir: path.slice(0, path.lastIndexOf("/")),
      isMissing: false,
      tags: [],
      properties: {},
      title: {
        slug: name.toLowerCase().replaceAll(" ", "-"),
        name,
        slugLength: name.length,
        slugWordCount: name.split(" ").length,
        system: { id: "SNES", name: "Super Nintendo" },
        tags: [],
        properties: {},
      },
    },
  };
}

describe("Library system browser", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    CoreAPI.reset();
    mockNavigate.mockReset();
    mockOutOfRangeScroll.mockReset();
    mockScrollToIndex.mockReset();
    mockErrorToast.mockReset();
    mockVirtualScroll.startIndex = 0;
    useLibrarySessionStore.getState().reset();
    useTabSessionStore.getState().reset();
    usePreferencesStore.setState({
      _hasHydrated: true,
      nfcAvailable: true,
      showFilenames: false,
    });
    await seedActiveDevice({ recordId: "device-a" });
    useStatusStore.setState({
      connected: true,
      coreVersion: "2.15.0",
      coreVersionPending: false,
      corePlatform: null,
      gamesIndex: { exists: true, indexing: false },
    });
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [{ id: "SNES", name: "Super Nintendo" }],
    });
    vi.spyOn(CoreAPI, "mediaMeta").mockResolvedValue(
      metadataResult("Super Game", "/roms/SNES/Super Game.sfc"),
    );
  });

  it("should browse into folders and return to system roots", async () => {
    const rootOne = mediaEntry({
      mediaId: undefined,
      name: "Root One",
      path: "/roms/SNES/One",
      type: "root",
    });
    const rootTwo = mediaEntry({
      mediaId: undefined,
      name: "Root Two",
      path: "/roms/SNES/Two",
      type: "root",
    });
    const browseSpy = vi
      .spyOn(CoreAPI, "mediaBrowse")
      .mockImplementation(async (params: MediaBrowseParams) =>
        params.path
          ? browseResult(params.path, [mediaEntry()])
          : browseResult("", [rootOne, rootTwo]),
      );
    const user = userEvent.setup();
    const childScrollKey = libraryBrowseScrollKey(
      "SNES",
      "name-asc",
      rootOne.path,
    );
    useTabSessionStore.getState().rememberScroll(childScrollKey, 0, 600);

    render(<LibrarySystem />);
    const scrollContainer = document.querySelector(
      '[data-scroll-restoration-id="page-scroll"]',
    );
    expect(scrollContainer).toBeInstanceOf(HTMLElement);
    if (!(scrollContainer instanceof HTMLElement)) return;
    scrollContainer.scrollTop = 120;
    fireEvent.scroll(scrollContainer);
    await user.click(await screen.findByRole("button", { name: /Root One/ }));

    expect(
      await screen.findByRole("heading", { name: "Root One" }),
    ).toBeInTheDocument();
    expect(scrollContainer.scrollTop).toBe(0);
    expect(browseSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/roms/SNES/One",
        systems: ["SNES"],
      }),
      expect.any(AbortSignal),
    );

    await user.click(screen.getByRole("button", { name: "nav.back" }));
    expect(
      await screen.findByRole("button", { name: /Root Two/ }),
    ).toBeInTheDocument();
    expect(scrollContainer.scrollTop).toBe(120);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("should preserve Library root scroll when leaving a system", async () => {
    vi.spyOn(CoreAPI, "mediaBrowse").mockResolvedValue(
      browseResult("", [mediaEntry()]),
    );
    const user = userEvent.setup();

    render(<LibrarySystem />);
    await screen.findByRole("button", { name: /Super Game/ });
    await user.click(screen.getByRole("button", { name: "nav.back" }));

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/library",
      resetScroll: false,
    });
  });

  it("should restore the current folder after a tab remount", async () => {
    const session = useLibrarySessionStore.getState();
    session.activateDevice("device-a");
    session.setFolderLevels("SNES", [
      { name: "Games", path: "/roms/SNES" },
      { name: "RPG", path: "/roms/SNES/RPG" },
    ]);
    vi.spyOn(CoreAPI, "mediaBrowse").mockImplementation(
      async (params: MediaBrowseParams) =>
        browseResult(params.path ?? "", [mediaEntry()]),
    );

    render(<LibrarySystem />);

    expect(
      await screen.findByRole("heading", { name: "RPG" }),
    ).toBeInTheDocument();
    expect(CoreAPI.mediaBrowse).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/roms/SNES/RPG" }),
      expect.any(AbortSignal),
    );
  });

  it("should restore embedded search after a tab remount", async () => {
    const session = useLibrarySessionStore.getState();
    session.activateDevice("device-a");
    session.setFolderLevels("SNES", [{ name: "Games", path: "/roms/SNES" }]);
    session.setEmbeddedSearchOpen("SNES", true);
    vi.spyOn(CoreAPI, "mediaBrowse").mockResolvedValue(
      browseResult("/roms/SNES", [mediaEntry()]),
    );

    render(<LibrarySystem />);

    expect(
      await screen.findByRole("heading", { name: "library.searchTitle" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("search", { name: "library.searchTitle" }),
    ).toBeInTheDocument();
  });

  it("should keep one loader visible while entering a sole root", async () => {
    try {
      vi.useFakeTimers();
      let resolveRoots!: (value: ReturnType<typeof browseResult>) => void;
      let resolveFolder!: (value: ReturnType<typeof browseResult>) => void;
      const rootsPromise = new Promise<ReturnType<typeof browseResult>>(
        (resolve) => {
          resolveRoots = resolve;
        },
      );
      const folderPromise = new Promise<ReturnType<typeof browseResult>>(
        (resolve) => {
          resolveFolder = resolve;
        },
      );
      const root = mediaEntry({
        mediaId: undefined,
        name: "SNES Games",
        path: "/roms/SNES",
        type: "root",
      });
      const browseSpy = vi
        .spyOn(CoreAPI, "mediaBrowse")
        .mockImplementation((params: MediaBrowseParams) =>
          params.path ? folderPromise : rootsPromise,
        );

      render(<LibrarySystem />);
      await act(() => vi.advanceTimersByTimeAsync(300));
      const loading = screen.getByText("library.loadingFolder");

      await act(async () => {
        resolveRoots(browseResult("", [root]));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(
        browseSpy.mock.calls.some(([params]) => params.path === "/roms/SNES"),
      ).toBe(true);
      expect(screen.getByText("library.loadingFolder")).toBe(loading);

      await act(async () => {
        resolveFolder(browseResult("/roms/SNES", [mediaEntry()]));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(
        screen.queryByText("library.loadingFolder"),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("should automatically enter a sole system root", async () => {
    const root = mediaEntry({
      mediaId: undefined,
      name: "SNES Games",
      path: "/roms/SNES",
      type: "root",
    });
    vi.spyOn(CoreAPI, "mediaBrowse").mockImplementation(
      async (params: MediaBrowseParams) =>
        params.path
          ? browseResult(params.path, [mediaEntry()])
          : browseResult("", [root]),
    );

    render(<LibrarySystem />);

    expect(
      await screen.findByRole("heading", { name: "SNES Games" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Super Game/ }),
    ).toBeInTheDocument();
  });

  it("should show normalized MiSTer folder names", async () => {
    useStatusStore.setState({ corePlatform: "MiSTer" });
    const root = mediaEntry({
      mediaId: undefined,
      name: "_Arcade.zip",
      path: "/media/fat/_Arcade.zip",
      type: "root",
    });
    vi.spyOn(CoreAPI, "mediaBrowse").mockImplementation(
      async (params: MediaBrowseParams) =>
        params.path
          ? browseResult(params.path, [mediaEntry()])
          : browseResult("", [root]),
    );

    render(<LibrarySystem />);

    expect(
      await screen.findByRole("heading", { name: "Arcade" }),
    ).toBeInTheDocument();
  });

  it("should present a resolved singleton folder as its game on any platform", async () => {
    useStatusStore.setState({ corePlatform: "linux" });
    const singleton = mediaEntry({
      mediaId: undefined,
      name: "Game Folder",
      path: "/media/fat/games/SNES/Game Folder",
      type: "directory",
      fileCount: 1,
    });
    const collection = mediaEntry({
      mediaId: undefined,
      name: "Collection",
      path: "/media/fat/games/SNES/Collection",
      type: "directory",
      fileCount: 2,
    });
    const browseSpy = vi
      .spyOn(CoreAPI, "mediaBrowse")
      .mockImplementation(async (params: MediaBrowseParams) =>
        params.path === singleton.path
          ? browseResult(params.path, [
              mediaEntry({
                name: "Game Title",
                path: "/media/fat/games/SNES/Game Folder/Game.sfc",
              }),
            ])
          : browseResult("", [singleton, collection]),
      );
    const user = userEvent.setup();
    vi.mocked(CoreAPI.mediaMeta).mockResolvedValue(
      metadataResult(
        "Game Title",
        "/media/fat/games/SNES/Game Folder/Game.sfc",
      ),
    );

    render(<LibrarySystem />);
    await user.click(await screen.findByRole("button", { name: /Game Title/ }));

    expect(
      screen.getByRole("dialog", { name: "Game Title" }),
    ).toBeInTheDocument();
    expect(browseSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/media/fat/games/SNES/Game Folder",
        systems: ["SNES"],
        maxResults: 2,
      }),
      expect.any(AbortSignal),
    );
  });

  it("should collapse a redundant parent root and enter its child", async () => {
    const parentRoot = mediaEntry({
      mediaId: undefined,
      name: "games",
      path: "/media/fat/games",
      type: "root",
      fileCount: 25,
    });
    const systemRoot = mediaEntry({
      mediaId: undefined,
      name: "CPS2",
      path: "/media/fat/games/CPS2",
      type: "root",
      fileCount: 25,
    });
    const browseSpy = vi
      .spyOn(CoreAPI, "mediaBrowse")
      .mockImplementation(async (params: MediaBrowseParams) =>
        params.path
          ? browseResult(params.path, [mediaEntry()])
          : browseResult("", [parentRoot, systemRoot]),
      );

    render(<LibrarySystem />);

    expect(
      await screen.findByRole("heading", { name: "CPS2" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(browseSpy).toHaveBeenCalledWith(
        expect.objectContaining({ path: "/media/fat/games/CPS2" }),
        expect.any(AbortSignal),
      ),
    );
    expect(
      screen.queryByRole("button", { name: /games/ }),
    ).not.toBeInTheDocument();
  });

  it("should open system-scoped search and return to the same folder", async () => {
    const searchSpy = vi.spyOn(CoreAPI, "mediaSearch").mockResolvedValue({
      results: [],
      total: 0,
      pagination: {
        hasNextPage: false,
        nextCursor: null,
        pageSize: 100,
      },
    });
    const folder = mediaEntry({
      mediaId: undefined,
      name: "Games",
      path: "/roms/SNES/Games",
      type: "root",
    });
    vi.spyOn(CoreAPI, "mediaBrowse").mockImplementation(
      async (params: MediaBrowseParams) =>
        params.path
          ? browseResult(params.path, [mediaEntry()])
          : browseResult("", [folder]),
    );
    const user = userEvent.setup();

    render(<LibrarySystem />);
    expect(
      await screen.findByRole("heading", { name: "Games" }),
    ).toBeInTheDocument();
    const scrollContainer = document.querySelector(
      '[data-scroll-restoration-id="page-scroll"]',
    );
    expect(scrollContainer).toBeInstanceOf(HTMLElement);
    if (!(scrollContainer instanceof HTMLElement)) return;
    scrollContainer.scrollTop = 120;
    fireEvent.scroll(scrollContainer);

    await user.click(
      screen.getByRole("button", { name: "library.searchTitle" }),
    );

    expect(
      document.querySelector('[data-scroll-restoration-id="page-scroll"]'),
    ).toBe(scrollContainer);
    expect(scrollContainer.scrollTop).toBe(0);
    expect(
      screen.getByRole("search", { name: "library.searchTitle" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "library.searchAction" }),
    );
    await waitFor(() =>
      expect(searchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ systems: ["SNES"] }),
        expect.any(AbortSignal),
      ),
    );
    await user.click(screen.getByRole("button", { name: "nav.back" }));

    expect(
      await screen.findByRole("heading", { name: "Games" }),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-scroll-restoration-id="page-scroll"]'),
    ).toBe(scrollContainer);
    await waitFor(() => expect(scrollContainer.scrollTop).toBe(120));
    expect(
      screen.getByRole("button", { name: /Super Game/ }),
    ).toBeInTheDocument();
  });

  it("should open details instead of launching media immediately", async () => {
    vi.spyOn(CoreAPI, "mediaBrowse").mockResolvedValue(
      browseResult("", [mediaEntry()]),
    );
    const runSpy = vi.spyOn(CoreAPI, "run");
    const user = userEvent.setup();

    render(<LibrarySystem />);
    await user.click(await screen.findByRole("button", { name: /Super Game/ }));

    expect(
      screen.getByRole("dialog", { name: "Super Game" }),
    ).toBeInTheDocument();
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("should sort the current folder from Library options", async () => {
    const folder = mediaEntry({
      mediaId: undefined,
      name: "Games",
      path: "/roms/SNES/Games",
      type: "root",
    });
    const browseSpy = vi
      .spyOn(CoreAPI, "mediaBrowse")
      .mockImplementation(async (params: MediaBrowseParams) =>
        params.path
          ? browseResult(params.path, [mediaEntry()])
          : browseResult("", [folder]),
      );
    const indexSpy = vi.spyOn(CoreAPI, "mediaBrowseIndex").mockResolvedValue({
      scheme: "none",
      totalFiles: 1,
      groups: [],
    });
    const user = userEvent.setup();

    render(<LibrarySystem />);
    await screen.findByRole("heading", { name: "Games" });
    await user.click(
      screen.getByRole("button", { name: "library.optionsTitle" }),
    );
    const optionsDialog = screen.getByRole("dialog", {
      name: "library.optionsTitle",
    });
    expect(
      within(optionsDialog).queryByText("library.tags"),
    ).not.toBeInTheDocument();
    await user.click(
      within(optionsDialog).getByRole("radio", {
        name: "library.sortFilenameDesc",
      }),
    );

    await waitFor(() =>
      expect(browseSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/roms/SNES/Games",
          sort: "filename-desc",
        }),
        expect.any(AbortSignal),
      ),
    );
    expect(screen.getByRole("heading", { name: "Games" })).toBeInTheDocument();
    expect(screen.getByLabelText("library.activeOptions")).toHaveTextContent(
      "library.sortFilenameDesc",
    );

    await user.click(
      screen.getByRole("button", { name: "library.optionsTitle" }),
    );
    await user.click(
      within(
        screen.getByRole("dialog", { name: "library.optionsTitle" }),
      ).getByRole("button", { name: "library.goToTitle" }),
    );
    await screen.findByRole("dialog", { name: "library.goToTitle" });
    expect(indexSpy).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "filename-desc" }),
      expect.any(AbortSignal),
    );
  });

  it("should jump to a distant letter with its index cursor", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(CoreAPI, "mediaBrowse").mockImplementation(browseArcade);
    vi.spyOn(CoreAPI, "mediaBrowseIndex").mockResolvedValue(LETTER_INDEX);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<LibrarySystem />);
    await chooseLetter(user, "T");

    await waitFor(() =>
      expect(mockScrollToIndex).toHaveBeenCalledWith(502, {
        align: "start",
      }),
    );
    expect(mockOutOfRangeScroll).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Game 501" }),
    ).toBeInTheDocument();

    // Rows around the target are loaded, so settling does not fetch a bucket.
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(arcadeBrowseCursors()).toEqual([undefined, "letter-t"]);
    expect(CoreAPI.mediaBrowse).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: "letter-t", maxResults: 100 }),
      expect.any(AbortSignal),
    );
  });

  it("should load an earlier letter when a restored jump shows its rows", async () => {
    const session = useLibrarySessionStore.getState();
    session.activateDevice("device-a");
    session.setFolderLevels("SNES", [
      { name: "Arcade", path: ARCADE_ROOT.path },
    ]);
    session.updateBrowseWindow(
      libraryBrowseScrollKey("SNES", "name-asc", ARCADE_ROOT.path),
      () => ({
        anchorKey: "T",
        anchorStart: 502,
        totalDirs: 2,
        loadedKeys: [],
      }),
    );
    mockVirtualScroll.startIndex = 499;
    vi.spyOn(CoreAPI, "mediaBrowse").mockImplementation(browseArcade);
    vi.spyOn(CoreAPI, "mediaBrowseIndex").mockResolvedValue(LETTER_INDEX);

    render(<LibrarySystem />);

    expect(
      await screen.findByRole("button", { name: "Game 500" }),
    ).toBeInTheDocument();
    expect(arcadeBrowseCursors()).toEqual(["letter-t", "letter-s"]);
    expect(CoreAPI.mediaBrowse).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "letter-s", maxResults: 100 }),
      expect.any(AbortSignal),
    );
  });

  it("should not keep a jump that finishes after leaving the folder", async () => {
    let finishJump: (response: MediaBrowseResponse) => void = () => {};
    vi.spyOn(CoreAPI, "mediaBrowse").mockImplementation(async (params) =>
      params.cursor === "letter-t"
        ? new Promise<MediaBrowseResponse>((resolve) => {
            finishJump = resolve;
          })
        : browseArcade(params),
    );
    vi.spyOn(CoreAPI, "mediaBrowseIndex").mockResolvedValue(LETTER_INDEX);
    const user = userEvent.setup();

    render(<LibrarySystem />);
    await chooseLetter(user, "T");
    await waitFor(() => expect(arcadeBrowseCursors()).toContain("letter-t"));
    await user.click(screen.getByRole("button", { name: "nav.back" }));

    await act(async () => {
      finishJump(
        await browseArcade({ path: ARCADE_ROOT.path, cursor: "letter-t" }),
      );
    });

    expect(useLibrarySessionStore.getState().browseWindows).toEqual({});
    expect(mockScrollToIndex).not.toHaveBeenCalled();
  });

  it("should report a letter jump whose cursor page fails", async () => {
    vi.spyOn(CoreAPI, "mediaBrowse").mockImplementation(async (params) => {
      if (params.cursor === "letter-t") throw new Error("browse failed");
      return browseArcade(params);
    });
    vi.spyOn(CoreAPI, "mediaBrowseIndex").mockResolvedValue(LETTER_INDEX);
    const user = userEvent.setup();

    render(<LibrarySystem />);
    await chooseLetter(user, "T");

    await waitFor(() =>
      expect(mockErrorToast).toHaveBeenCalledWith("library.jumpError"),
    );
    expect(useLibrarySessionStore.getState().browseWindows).toEqual({});
    expect(mockScrollToIndex).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "library.optionsTitle" }),
    ).toBeEnabled();
  });

  it("should use browse index groups to jump within loaded rows", async () => {
    const folder = mediaEntry({
      mediaId: undefined,
      name: "Games",
      path: "/roms/SNES/Games",
      type: "root",
    });
    const entries = Array.from({ length: 5 }, (_, index) =>
      mediaEntry({ mediaId: index + 1, name: `Game ${index + 1}` }),
    );
    vi.spyOn(CoreAPI, "mediaBrowse").mockImplementation(
      async (params: MediaBrowseParams) =>
        params.path
          ? { ...browseResult(params.path, entries), totalDirs: 0 }
          : browseResult("", [folder]),
    );
    vi.spyOn(CoreAPI, "mediaBrowseIndex").mockResolvedValue({
      scheme: "latin",
      totalFiles: 5,
      groups: [{ key: "G", label: "G", count: 5, cursor: "", offset: 2 }],
    });
    const user = userEvent.setup();

    render(<LibrarySystem />);
    await user.click(
      await screen.findByRole("button", { name: "library.optionsTitle" }),
    );
    const optionsDialog = screen.getByRole("dialog", {
      name: "library.optionsTitle",
    });
    await user.click(
      within(optionsDialog).getByRole("button", {
        name: "library.goToTitle",
      }),
    );
    const jumpDialog = await screen.findByRole("dialog", {
      name: "library.goToTitle",
    });
    expect(CoreAPI.mediaBrowseIndex).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "name-asc" }),
      expect.any(AbortSignal),
    );
    await user.click(
      within(jumpDialog).getByRole("button", {
        name: "G library.itemCount",
      }),
    );

    await waitFor(() =>
      expect(mockScrollToIndex).toHaveBeenCalledWith(2, {
        align: "start",
      }),
    );
  });
});
