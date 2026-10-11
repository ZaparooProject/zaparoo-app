import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  act,
  findA11yViolations,
  render,
  screen,
  waitFor,
  within,
} from "@/test-utils";
import { RootLayout } from "@/routes/__root";
import { Library } from "@/routes/library.index";
import { LibrarySystem } from "@/routes/library.$system";
import { LibraryGameSearch } from "@/components/library/LibraryGameSearch";
import { LibraryFavorites } from "@/routes/library.favorites";
import { Route as RecentRoute } from "@/routes/library.recent";
import { Route as TopRoute } from "@/routes/library.top";
import { DeckDetails } from "@/routes/library.decks.$deckId";
import { AddDeckItem } from "@/routes/library.decks.$deckId_.add";
import { CoreAPI } from "@/lib/coreApi";
import * as libraryImages from "@/lib/libraryImages";
import type { Deck, MediaBrowseEntry } from "@/lib/models";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useLibrarySessionStore } from "@/lib/librarySessionStore";
import { useTabSessionStore } from "@/lib/tabSessionStore";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";

const system = { id: "SNES", name: "Super Nintendo", mediaCount: 2 };
const game = {
  mediaId: 42,
  name: "Super Game",
  path: "/roms/SNES/Action/Super Game.sfc",
  system,
  tags: [],
};
const entry: MediaBrowseEntry = {
  mediaId: game.mediaId,
  type: "media",
  name: game.name,
  path: game.path,
  systemId: system.id,
};
const deck: Deck = {
  deckId: "0k3v9x2rq7bm",
  name: "Weekend",
  description: "Games",
  owned: true,
  locked: false,
  itemCount: 2,
  createdAt: 1,
  updatedAt: 1,
  items: [
    {
      id: 1,
      position: 1,
      kind: "script",
      name: "Alpha",
      zapscript: "**launch.title:SNES/Alpha",
    },
    {
      id: 2,
      position: 2,
      kind: "script",
      name: "Beta",
      zapscript: "**launch.title:SNES/Beta",
    },
  ],
};

function responsiveWindow(initialWidth: number) {
  let width = initialWidth;
  const listeners = new Set<() => void>();
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    get matches() {
      const minimum = /min-width:\s*(\d+)px/.exec(query);
      return minimum ? width >= Number(minimum[1]) : false;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: unknown) => {
      listeners.add(listener as () => void);
    },
    removeEventListener: (_type: string, listener: unknown) => {
      listeners.delete(listener as () => void);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  }));
  return async (next: number) => {
    await act(() => {
      width = next;
      listeners.forEach((listener) => listener());
    });
  };
}

async function renderLibrary(path: string, basepath?: string) {
  const root = createRootRoute({ component: RootLayout });
  const pages = [
    { path: "/library", component: Library },
    { path: "/library/$system", component: LibrarySystem },
    { path: "/library/search", component: LibraryGameSearch },
    { path: "/library/favorites", component: LibraryFavorites },
    { path: "/library/recent", component: RecentRoute.options.component },
    { path: "/library/top", component: TopRoute.options.component },
    { path: "/library/decks/$deckId", component: DeckDetails },
    { path: "/library/decks/$deckId/add", component: AddDeckItem },
  ];
  const router = createRouter({
    basepath,
    routeTree: root.addChildren(
      pages.map((page) => createRoute({ getParentRoute: () => root, ...page })),
    ),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  return { ...render(<RouterProvider router={router} />), router };
}

function pageScroll(heading: HTMLElement) {
  return heading.closest<HTMLElement>("[data-scroll-restoration-id]")!;
}

async function resizeSelectedMedia(resize: (width: number) => Promise<void>) {
  const surface = await screen.findByRole("region", { name: game.name });
  for (const width of [820, 390, 1440]) {
    await resize(width);
    const role = width >= 1100 ? "region" : "dialog";
    expect(await screen.findByRole(role, { name: game.name })).toBe(surface);
  }
  return surface;
}

describe("Adaptive Library pages", () => {
  beforeEach(async () => {
    useStatusStore.setState({
      ...useStatusStore.getInitialState(),
      connected: true,
      connectionState: ConnectionState.CONNECTED,
      coreVersion: "2.23.0",
      coreVersionPending: false,
      encryptionState: "plaintext",
      gamesIndex: { exists: true, indexing: false },
    });
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
      accessibleLists: true,
      preferRemoteWriter: true,
    });
    useLibrarySessionStore.getState().reset();
    useTabSessionStore.getState().reset();
    await seedActiveDevice({ recordId: "device-a" });
    vi.spyOn(libraryImages, "requestLibraryImage").mockResolvedValue(null);
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({ systems: [system] });
    vi.spyOn(CoreAPI, "media").mockResolvedValue({
      database: useStatusStore.getState().gamesIndex,
      active: [],
    });
    vi.spyOn(CoreAPI, "mediaTags").mockResolvedValue({ tags: [] });
    vi.spyOn(CoreAPI, "mediaSearch").mockResolvedValue({
      results: [game],
      total: 1,
    });
    vi.spyOn(CoreAPI, "mediaBrowse").mockImplementation(async (params) => ({
      path: params.path ?? "",
      totalFiles: params.path ? 1 : 0,
      totalDirs: params.path ? 0 : 2,
      entries: params.path
        ? [entry]
        : [
            { type: "directory", name: "Action", path: "/roms/SNES/Action" },
            { type: "directory", name: "Puzzle", path: "/roms/SNES/Puzzle" },
          ],
    }));
    vi.spyOn(CoreAPI, "mediaMeta").mockResolvedValue({
      media: {
        path: game.path,
        parentDir: "/roms/SNES/Action",
        isMissing: false,
        tags: [],
        properties: {},
        title: {
          slug: "super-game",
          name: game.name,
          slugLength: 10,
          slugWordCount: 2,
          system,
          tags: [],
          properties: {},
        },
      },
    });
    vi.spyOn(CoreAPI, "mediaHistory").mockResolvedValue({
      entries: [
        {
          systemId: system.id,
          systemName: system.name,
          mediaName: game.name,
          mediaPath: game.path,
          startedAt: "2026-09-01T10:00:00Z",
          playTime: 60,
        },
      ],
    });
    vi.spyOn(CoreAPI, "mediaHistoryTop").mockResolvedValue({
      entries: [
        {
          systemId: system.id,
          systemName: system.name,
          mediaName: game.name,
          mediaPath: game.path,
          lastPlayedAt: "2026-09-01T10:00:00Z",
          totalPlayTime: 60,
          sessionCount: 1,
        },
      ],
    });
    vi.spyOn(CoreAPI, "decks").mockResolvedValue({ decks: [deck] });
    vi.spyOn(CoreAPI, "deckGet").mockResolvedValue(deck);
    vi.spyOn(CoreAPI, "deckUpdate").mockResolvedValue(deck);
    vi.spyOn(CoreAPI, "hasWriteCapableReader").mockResolvedValue(true);
    vi.spyOn(CoreAPI, "readersWriteCancel").mockResolvedValue();
    vi.spyOn(CoreAPI, "run").mockResolvedValue();
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    { path: "/library/favorites", title: "library.favorites" },
    { path: "/library/recent", title: "library.recentlyPlayed" },
    { path: "/library/top", title: "library.topPlayed" },
  ])(
    "uses standard wide breadcrumbs for $path without replacing the heading",
    async ({ path, title }) => {
      const resize = responsiveWindow(1440);
      const user = userEvent.setup();
      const { router, baseElement } = await renderLibrary(
        `/app${path}`,
        "/app",
      );
      const heading = await screen.findByRole("heading", {
        name: title,
        level: 1,
      });
      const breadcrumb = screen.getByRole("navigation", {
        name: "nav.breadcrumbs",
      });
      const parent = within(breadcrumb).getByRole("link", {
        name: "library.title",
      });
      expect(parent).toHaveAttribute("href", "/app/library");
      expect(parent).not.toHaveAttribute("aria-current", "page");
      expect(
        within(breadcrumb).queryByRole("link", { name: title }),
      ).not.toBeInTheDocument();
      expect(
        within(breadcrumb).getByRole("listitem", { current: "page" }),
      ).toContainElement(heading);
      heading.focus();
      for (const width of [820, 390, 1440]) {
        await resize(width);
        expect(screen.getByRole("heading", { name: title, level: 1 })).toBe(
          heading,
        );
        expect(heading).toHaveFocus();
        if (width < 760) {
          expect(
            screen.queryByRole("navigation", { name: "nav.breadcrumbs" }),
          ).not.toBeInTheDocument();
        } else {
          expect(
            screen.getByRole("navigation", { name: "nav.breadcrumbs" }),
          ).toBe(breadcrumb);
          expect(
            within(breadcrumb).getByRole("link", { name: "library.title" }),
          ).toBe(parent);
        }
      }
      expect(await findA11yViolations(baseElement)).toEqual([]);
      await user.click(parent);
      expect(router.state.location.pathname).toBe("/library");
      expect(router.history.location.pathname).toBe("/app/library");
    },
  );

  it("keeps root title, actions and Systems/Collections choice through resize", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    const { baseElement } = await renderLibrary("/library");
    const heading = await screen.findByRole("heading", {
      name: "library.title",
      level: 1,
    });
    const scroll = pageScroll(heading);
    const search = within(scroll).getByRole("button", {
      name: "library.searchTitle",
    });
    await user.click(screen.getByRole("tab", { name: "library.collections" }));
    const collections = screen.getByRole("tab", {
      name: "library.collections",
    });
    const deckSearch = await screen.findByRole("searchbox", {
      name: "decks.search",
    });
    await user.type(deckSearch, "week");
    const deckLink = await within(
      screen.getByRole("region", { name: "decks.title" }),
    ).findByRole("link", { name: /^Weekend/ });
    const deckRequests = vi.mocked(CoreAPI.decks).mock.calls.length;
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(
        screen.getByRole("heading", { name: "library.title", level: 1 }),
      ).toBe(heading);
      expect(
        within(scroll).getByRole("button", { name: "library.searchTitle" }),
      ).toBe(search);
      expect(screen.getByRole("tab", { name: "library.collections" })).toBe(
        collections,
      );
      expect(collections).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("searchbox", { name: "decks.search" })).toBe(
        deckSearch,
      );
      expect(deckSearch).toHaveValue("week");
      expect(deckSearch).toHaveFocus();
      expect(
        within(screen.getByRole("region", { name: "decks.title" })).getByRole(
          "link",
          { name: /^Weekend/ },
        ),
      ).toBe(deckLink);
      expect(CoreAPI.decks).toHaveBeenCalledTimes(deckRequests);
    }
    expect(await findA11yViolations(baseElement)).toEqual([]);
  });

  it("jumps to earlier folder breadcrumbs without changing route or heading owner", async () => {
    responsiveWindow(1440);
    const user = userEvent.setup();
    useLibrarySessionStore.getState().activateDevice("device-a");
    useLibrarySessionStore.getState().setFolderLevels("SNES", [
      { name: "Action", path: "/roms/SNES/Action" },
      { name: "Arcade", path: "/roms/SNES/Action/Arcade" },
      { name: "Classics", path: "/roms/SNES/Action/Arcade/Classics" },
    ]);
    const { router } = await renderLibrary("/library/SNES");
    const heading = await screen.findByRole("heading", {
      name: "Classics",
      level: 1,
    });
    const trail = screen.getByRole("navigation", { name: "nav.breadcrumbs" });
    expect(
      within(trail).getByRole("link", { name: "library.title" }),
    ).toHaveAttribute("href", "/library");
    expect(
      within(trail).getByRole("button", { name: "Arcade" }),
    ).toBeInTheDocument();
    await user.click(within(trail).getByRole("button", { name: "Action" }));
    expect(
      await screen.findByRole("heading", { name: "Action", level: 1 }),
    ).toBe(heading);
    expect(useLibrarySessionStore.getState().folderLevels.SNES).toEqual([
      { name: "Action", path: "/roms/SNES/Action" },
    ]);
    expect(router.state.location.pathname).toBe("/library/SNES");
    expect(
      within(trail).queryByRole("button", { name: "Arcade" }),
    ).not.toBeInTheDocument();
    expect(CoreAPI.run).not.toHaveBeenCalled();
  });

  it("keeps folder search draft and selected details; parent actions stay in same route", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    const { router } = await renderLibrary("/library/SNES");
    const systemHeading = await screen.findByRole("heading", { level: 1 });
    const folder = await screen.findByRole("button", { name: /^Action/ });
    const systemTitle = systemHeading.textContent!;
    await user.click(folder);
    const folderHeading = await screen.findByRole("heading", {
      name: "Action",
      level: 1,
    });
    const scroll = pageScroll(folderHeading);
    await user.click(
      within(scroll).getByRole("button", { name: "library.searchTitle" }),
    );
    await screen.findByRole("heading", {
      name: "library.searchTitle",
      level: 1,
    });
    const query = screen.getByRole("searchbox", {
      name: "library.searchInput",
    });
    await user.type(query, "Super");
    await user.click(
      screen.getByRole("button", { name: "library.searchAction" }),
    );
    await user.click(
      await screen.findByRole("button", { name: /^Super Game/ }),
    );
    const surface = await resizeSelectedMedia(resize);
    expect(screen.getByRole("searchbox", { name: "library.searchInput" })).toBe(
      query,
    );
    expect(query).toHaveValue("Super");
    await user.click(
      within(surface).getByRole("button", { name: "nav.close" }),
    );
    await user.click(
      within(scroll).getByRole("button", { name: "Action", hidden: true }),
    );
    await screen.findByRole("heading", { name: "Action", level: 1 });
    expect(router.state.location.pathname).toBe("/library/SNES");
    expect(useLibrarySessionStore.getState().folderLevels.SNES).toHaveLength(1);
    await user.click(
      within(scroll).getByRole("button", {
        name: systemTitle,
        hidden: true,
      }),
    );
    await waitFor(() =>
      expect(useLibrarySessionStore.getState().folderLevels.SNES).toEqual([]),
    );
    expect(router.state.location.pathname).toBe("/library/SNES");
    expect(CoreAPI.run).not.toHaveBeenCalled();
  });

  it("retains tagged search draft and returns to collection without route navigation", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    const { router } = await renderLibrary("/library/favorites");
    const heading = await screen.findByRole("heading", {
      name: "library.favorites",
      level: 1,
    });
    const scroll = pageScroll(heading);
    await user.click(
      within(scroll).getByRole("button", { name: "library.searchFavorites" }),
    );
    const query = await screen.findByRole("searchbox", {
      name: "library.searchInput",
    });
    await user.type(query, "Super");
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(
        screen.getByRole("searchbox", { name: "library.searchInput" }),
      ).toBe(query);
      expect(query).toHaveValue("Super");
      expect(query).toHaveFocus();
      expect(router.state.location.pathname).toBe("/library/favorites");
    }
    await user.click(
      within(scroll).getByRole("button", {
        name: "library.favorites",
        hidden: true,
      }),
    );
    await screen.findByRole("heading", { name: "library.favorites", level: 1 });
    expect(useLibrarySessionStore.getState().embeddedSearchOpen.favorites).toBe(
      false,
    );
    expect(router.state.location.pathname).toBe("/library/favorites");
  });

  it("keeps selected favourites on modified parent click, clears on ordinary navigation", async () => {
    responsiveWindow(1440);
    const user = userEvent.setup();
    const { router } = await renderLibrary("/library/favorites");
    const heading = await screen.findByRole("heading", {
      name: "library.favorites",
      level: 1,
    });
    await user.click(
      await screen.findByRole("button", { name: /^Super Game/ }),
    );
    await screen.findByRole("region", { name: game.name });
    const parent = within(pageScroll(heading)).getByRole("link", {
      name: "library.title",
      hidden: true,
    });
    await user.keyboard("{Control>}");
    await user.click(parent);
    await user.keyboard("{/Control}");
    expect(router.state.location.pathname).toBe("/library/favorites");
    expect(screen.getByRole("region", { name: game.name })).toBeInTheDocument();
    expect(
      Object.values(useLibrarySessionStore.getState().selectedMedia),
    ).toHaveLength(1);
    await user.click(parent);
    await screen.findByRole("heading", { name: "library.title", level: 1 });
    expect(router.state.location.pathname).toBe("/library");
    expect(
      Object.values(useLibrarySessionStore.getState().selectedMedia),
    ).toHaveLength(0);
  });

  it("retains standalone search and selected media without repeating search on resize", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    await renderLibrary("/library/search");
    const query = await screen.findByRole("searchbox", {
      name: "library.searchInput",
    });
    await user.type(query, "Super");
    await user.click(
      screen.getByRole("button", { name: "library.searchAction" }),
    );
    await user.click(
      await screen.findByRole("button", { name: /^Super Game/ }),
    );
    const requestCount = vi.mocked(CoreAPI.mediaSearch).mock.calls.length;
    await resizeSelectedMedia(resize);
    expect(screen.getByRole("searchbox", { name: "library.searchInput" })).toBe(
      query,
    );
    expect(query).toHaveValue("Super");
    expect(CoreAPI.mediaSearch).toHaveBeenCalledTimes(requestCount);
    expect(CoreAPI.run).not.toHaveBeenCalled();
  });

  it.each([
    ["recent", "library.recentlyPlayed"],
    ["top", "library.topPlayed"],
  ])(
    "retains %s collection selection and embedded parent href through resize",
    async (path, title) => {
      const resize = responsiveWindow(1440);
      const user = userEvent.setup();
      const { router } = await renderLibrary(`/app/library/${path}`, "/app");
      const heading = await screen.findByRole("heading", {
        name: title,
        level: 1,
      });
      const parent = within(pageScroll(heading)).getByRole("link", {
        name: "library.title",
        hidden: true,
      });
      expect(parent).toHaveAttribute("href", "/app/library");
      await user.click(
        await screen.findByRole("button", { name: /^Super Game/ }),
      );
      await resizeSelectedMedia(resize);
      await user.click(parent);
      await screen.findByRole("heading", { name: "library.title", level: 1 });
      expect(router.history.location.pathname).toBe("/app/library");
      expect(CoreAPI.run).not.toHaveBeenCalled();
    },
  );

  it("retains deck metadata/order draft and pending save through resize", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    let finish!: (value: Deck) => void;
    vi.mocked(CoreAPI.deckUpdate).mockReturnValue(
      new Promise<Deck>((resolve) => {
        finish = resolve;
      }),
    );
    await renderLibrary(`/library/decks/${deck.deckId}`);
    const heading = await screen.findByRole("heading", {
      name: deck.name,
      level: 1,
    });
    const scroll = pageScroll(heading);
    await user.click(
      within(scroll).getByRole("button", { name: "decks.edit" }),
    );
    const name = screen.getByRole("textbox", { name: "decks.name" });
    const description = screen.getByRole("textbox", {
      name: "decks.description",
    });
    await user.clear(name);
    await user.type(name, "Edited weekend");
    const list = within(scroll).getByRole("list", { name: "decks.items" });
    await user.click(
      within(within(list).getAllByRole("listitem")[0]!).getByRole("button", {
        name: "decks.moveDown",
      }),
    );
    await user.clear(description);
    await user.type(description, "Draft description");
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(screen.getByRole("textbox", { name: "decks.name" })).toBe(name);
      expect(name).toHaveValue("Edited weekend");
      expect(description).toHaveValue("Draft description");
      expect(description).toHaveFocus();
      expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent(
        "Beta",
      );
      expect(CoreAPI.deckUpdate).not.toHaveBeenCalled();
    }
    const save = screen.getByRole("button", { name: "save" });
    await user.click(save);
    await waitFor(() => expect(CoreAPI.deckUpdate).toHaveBeenCalledTimes(1));
    for (const width of [390, 820, 1440]) {
      await resize(width);
      expect(save).toBeDisabled();
      expect(name).toHaveValue("Edited weekend");
      expect(CoreAPI.deckUpdate).toHaveBeenCalledTimes(1);
    }
    const updated = {
      ...deck,
      name: "Edited weekend",
      description: "Draft description",
      items: [...deck.items!].reverse(),
    };
    vi.mocked(CoreAPI.deckGet).mockResolvedValue(updated);
    await act(() => finish(updated));
    await screen.findByRole("heading", { name: "Edited weekend", level: 1 });
    expect(
      screen.queryByRole("textbox", { name: "decks.name" }),
    ).not.toBeInTheDocument();
  });

  it("keeps deck share modal mounted through desktop/tablet/phone transitions", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    await renderLibrary(`/library/decks/${deck.deckId}`);
    await user.click(
      await screen.findByRole("button", { name: "decks.share" }),
    );
    const modal = await screen.findByRole("dialog", { name: "decks.share" });
    const copy = within(modal).getByRole("button", { name: "decks.copyLink" });
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(screen.getByRole("dialog", { name: "decks.share" })).toBe(modal);
      expect(
        within(modal).getByRole("button", { name: "decks.copyLink" }),
      ).toBe(copy);
    }
    expect(CoreAPI.deckUpdate).not.toHaveBeenCalled();
  });

  it("retains deck-item script draft and pending save with parameterized embedded parent link", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    let finish!: (value: Deck) => void;
    vi.mocked(CoreAPI.deckUpdate).mockReturnValue(
      new Promise<Deck>((resolve) => {
        finish = resolve;
      }),
    );
    const { router } = await renderLibrary(
      `/app/library/decks/${deck.deckId}/add`,
      "/app",
    );
    const heading = await screen.findByRole("heading", {
      name: "decks.addCustom",
      level: 1,
    });
    const name = await screen.findByRole("textbox", { name: "decks.itemName" });
    const parent = within(pageScroll(heading)).getByRole("link", {
      name: deck.name,
      hidden: true,
    });
    expect(parent).toHaveAttribute("href", `/app/library/decks/${deck.deckId}`);
    await user.type(name, "Custom");
    const script = screen.getByRole("textbox", {
      name: "decks.script",
    });
    await user.type(script, "**launch.title:SNES/Game");
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(script).toHaveValue("**launch.title:SNES/Game");
      expect(script).toHaveFocus();
      expect(name).toHaveValue("Custom");
    }
    const add = screen.getByRole("button", { name: "decks.addItem" });
    await user.click(add);
    await waitFor(() => expect(CoreAPI.deckUpdate).toHaveBeenCalledTimes(1));
    expect(CoreAPI.deckUpdate).toHaveBeenCalledWith({
      deckId: deck.deckId,
      addItems: [
        {
          kind: "script",
          name: "Custom",
          zapscript: "**launch.title:SNES/Game",
        },
      ],
    });
    for (const width of [390, 820, 1440]) {
      await resize(width);
      expect(add).toBeDisabled();
      expect(CoreAPI.deckUpdate).toHaveBeenCalledTimes(1);
    }
    await act(() => finish(deck));
    await screen.findByRole("heading", { name: deck.name, level: 1 });
    expect(router.history.location.pathname).toBe(
      `/app/library/decks/${deck.deckId}`,
    );
  });
});
