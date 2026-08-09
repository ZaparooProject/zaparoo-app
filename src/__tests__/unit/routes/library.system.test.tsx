import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { act, fireEvent, render, screen, waitFor, within } from "@/test-utils";
import { CoreAPI } from "@/lib/coreApi";
import type { MediaBrowseEntry, MediaBrowseParams } from "@/lib/models";
import { useStatusStore } from "@/lib/store";
import {
  libraryBrowseScrollKey,
  useLibrarySessionStore,
} from "@/lib/librarySessionStore";
import { useTabSessionStore } from "@/lib/tabSessionStore";
import { LibrarySystem } from "@/routes/library.$system";

const { mockNavigate, mockOutOfRangeScroll, mockScrollToIndex } = vi.hoisted(
  () => ({
    mockNavigate: vi.fn(),
    mockOutOfRangeScroll: vi.fn(),
    mockScrollToIndex: vi.fn(),
  }),
);

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
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 5) }, (_, index) => ({
        key: index,
        index,
        size: 88,
        start: index * 88,
      })),
    getTotalSize: () => count * 88,
    measureElement: vi.fn(),
    measure: vi.fn(),
    scrollToIndex: (index: number, options: { align: string }) => {
      if (index >= count) mockOutOfRangeScroll(index, count);
      mockScrollToIndex(index, options);
    },
  }),
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

vi.mock("@/components/library/LibraryArtwork", () => ({
  LibraryArtwork: () => <span aria-hidden="true" />,
}));

vi.mock("@/components/library/LibraryMediaDetailsModal", () => ({
  LibraryMediaDetailsModal: ({
    isOpen,
    entry,
  }: {
    isOpen: boolean;
    entry: MediaBrowseEntry | null;
  }) =>
    isOpen && entry ? (
      <div role="dialog" aria-label={entry.name}>
        {entry.name}
      </div>
    ) : null,
}));

vi.mock("@/components/library/LibraryGameSearch", () => ({
  LibraryGameSearch: ({
    initialSystemId,
    onBack,
  }: {
    initialSystemId?: string;
    onBack?: () => void;
  }) => (
    <div aria-label="contextual library search">
      <span>{initialSystemId}</span>
      <button onClick={onBack}>close contextual search</button>
    </div>
  ),
}));

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

describe("Library system browser", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockReset();
    mockOutOfRangeScroll.mockReset();
    mockScrollToIndex.mockReset();
    useLibrarySessionStore.getState().reset();
    useTabSessionStore.getState().reset();
    useStatusStore.setState({
      connected: true,
      targetDeviceAddress: "device-a",
      coreVersion: "2.15.0",
      coreVersionPending: false,
      corePlatform: null,
      gamesIndex: { exists: true, indexing: false },
    });
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [{ id: "SNES", name: "Super Nintendo" }],
    });
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
      screen.getByLabelText("contextual library search"),
    ).toHaveTextContent("SNES");
  });

  it("should keep one loader visible while entering a sole root", async () => {
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

    try {
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
      screen.getByLabelText("contextual library search"),
    ).toHaveTextContent("SNES");
    await user.click(
      screen.getByRole("button", { name: "close contextual search" }),
    );

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

  it("should wait for distant letter rows before scrolling", async () => {
    const folder = mediaEntry({
      mediaId: undefined,
      name: "Arcade",
      path: "/media/fat/_Arcade",
      type: "root",
    });
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      mediaEntry({ mediaId: index + 1, name: `Game ${index + 1}` }),
    );
    const jumpPage = Array.from({ length: 500 }, (_, index) =>
      mediaEntry({ mediaId: index + 101, name: `Game ${index + 101}` }),
    );
    const browseSpy = vi
      .spyOn(CoreAPI, "mediaBrowse")
      .mockImplementation(async (params: MediaBrowseParams) => {
        if (!params.path) return browseResult("", [folder]);
        if (!params.cursor) {
          return {
            ...browseResult(params.path, firstPage),
            totalFiles: 600,
            totalDirs: 0,
            pagination: {
              hasNextPage: true,
              pageSize: 100,
              nextCursor: "next-page",
            },
          };
        }
        return {
          ...browseResult(params.path, jumpPage),
          totalFiles: 600,
          totalDirs: 0,
          pagination: {
            hasNextPage: false,
            pageSize: 500,
            nextCursor: null,
          },
        };
      });
    vi.spyOn(CoreAPI, "mediaBrowseIndex").mockResolvedValue({
      scheme: "latin",
      totalFiles: 600,
      groups: [
        {
          key: "T",
          label: "T",
          count: 100,
          cursor: "letter-t",
          offset: 500,
        },
      ],
    });
    const user = userEvent.setup();

    render(<LibrarySystem />);
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
      ).getByRole("button", { name: "T library.itemCount" }),
    );

    await waitFor(() =>
      expect(mockScrollToIndex).toHaveBeenCalledWith(500, {
        align: "start",
      }),
    );
    expect(mockOutOfRangeScroll).not.toHaveBeenCalled();
    expect(browseSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: "next-page",
        maxResults: 500,
      }),
      expect.any(AbortSignal),
    );
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
