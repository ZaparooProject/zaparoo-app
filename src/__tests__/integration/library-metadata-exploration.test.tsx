import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { App as mockApp } from "../../../__mocks__/@capacitor/app";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor, within } from "@/test-utils";
import { RootLayout } from "@/routes/__root";
import { PAGE_SCROLL_RESTORATION_SELECTOR } from "@/components/PageFrame";
import { Library } from "@/routes/library.index";
import { LibraryFavorites } from "@/routes/library.favorites";
import { Route as SearchRoute } from "@/routes/library.search";
import { Index } from "@/routes/-pages/Index";
import { CoreAPI } from "@/lib/coreApi";
import * as libraryImages from "@/lib/libraryImages";
import { useLibrarySessionStore } from "@/lib/librarySessionStore";
import { useTabSessionStore } from "@/lib/tabSessionStore";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";
import type { TagInfo } from "@/lib/models";

const system = { id: "SNES", name: "Super Nintendo", mediaCount: 2 };
const game = {
  mediaId: 42,
  name: "Super Game",
  path: "/roms/SNES/Super Game.sfc",
  system,
  tags: [],
};
const result = {
  ...game,
  mediaId: 99,
  name: "Stern Result",
  path: "/roms/SNES/Stern Result.sfc",
};
const tags: TagInfo[] = [
  { type: "developer", tag: "stern", label: "Stern" },
  { type: "developer", tag: "studio-two", label: "Second Studio" },
  { type: "publisher", tag: "publisher-id", label: "Publisher Name" },
  { type: "genre", tag: "platformer", label: "Platformer" },
  { type: "year", tag: "1994" },
  { type: "players", tag: "2" },
  { type: "region", tag: "us" },
  { type: "lang", tag: "en" },
  { type: "edition", tag: "special" },
  { type: "rev", tag: "rev-2" },
  { type: "custom", tag: "unknown-value" },
];

function viewport(width: number) {
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches:
      width >= Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? Infinity),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  }));
}
async function app(path: string, basepath?: string) {
  const root = createRootRoute({ component: RootLayout });
  const router = createRouter({
    basepath,
    scrollRestoration: true,
    scrollToTopSelectors: [PAGE_SCROLL_RESTORATION_SELECTOR],
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: "/", component: Index }),
      createRoute({
        getParentRoute: () => root,
        path: "/library",
        component: Library,
      }),
      createRoute({
        getParentRoute: () => root,
        path: "/library/favorites",
        component: LibraryFavorites,
      }),
      createRoute({
        getParentRoute: () => root,
        path: "/library/search",
        component: SearchRoute.options.component,
        validateSearch: SearchRoute.options.validateSearch,
      }),
    ]),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return router;
}
async function openGame(role: "dialog" | "region" = "dialog") {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /^Super Game/ }));
  const details = await screen.findByRole(role, { name: game.name });
  await within(details).findByRole("link", {
    name: "library.developer: Stern",
  });
  return details;
}

describe("game metadata exploration", () => {
  beforeEach(async () => {
    viewport(390);
    useLibrarySessionStore.getState().reset();
    useTabSessionStore.getState().reset();
    useStatusStore.setState({
      ...useStatusStore.getInitialState(),
      connected: true,
      connectionState: ConnectionState.CONNECTED,
      coreVersion: "2.23.0",
      coreVersionPending: false,
      corePlatform: "MiSTer",
      encryptionState: "plaintext",
      gamesIndex: { exists: true, indexing: false },
    });
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
      accessibleLists: true,
      preferRemoteWriter: true,
      nfcAvailable: false,
      keepScreenAwake: false,
    });
    await seedActiveDevice({ recordId: "device-a" });
    vi.spyOn(libraryImages, "requestLibraryImage").mockResolvedValue(null);
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({ systems: [system] });
    vi.spyOn(CoreAPI, "isConnected").mockReturnValue(true);
    vi.spyOn(CoreAPI, "mediaTags").mockResolvedValue({ tags });
    vi.spyOn(CoreAPI, "mediaSearch").mockImplementation(async (params) => ({
      results: params.tags?.includes("user:favorite") ? [game] : [result],
      total: 1,
    }));
    vi.spyOn(CoreAPI, "mediaMeta").mockImplementation(async (params) => ({
      media: {
        path: params.mediaId === result.mediaId ? result.path : game.path,
        parentDir: "/roms/SNES",
        isMissing: false,
        tags,
        properties: {},
        launcherOverride: "RetroArch",
        title: {
          name: params.mediaId === result.mediaId ? result.name : game.name,
          slug: "super-game",
          slugLength: 10,
          slugWordCount: 2,
          system,
          tags: [],
          properties: {
            "property:description": {
              text: "Game description",
              contentType: "text/plain",
            },
          },
        },
      },
    }));
    vi.spyOn(CoreAPI, "hasWriteCapableReader").mockResolvedValue(false);
    vi.spyOn(CoreAPI, "decks").mockResolvedValue({ decks: [] });
    vi.spyOn(CoreAPI, "mediaHistory").mockResolvedValue({ entries: [] });
    vi.spyOn(CoreAPI, "history").mockResolvedValue({ entries: [] });
    vi.spyOn(CoreAPI, "readers").mockResolvedValue({ readers: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it("links individual facts and friendly tag labels using exact raw filters and embedded basepath", async () => {
    const router = await app("/app/library/favorites", "/app");
    const details = await openGame();
    for (const [name, raw] of [
      ["library.developer: Stern", "developer:stern"],
      ["library.developer: Second Studio", "developer:studio-two"],
      ["library.publisher: Publisher Name", "publisher:publisher-id"],
      ["library.genre: Platformer", "genre:platformer"],
      ["library.releaseYear: 1994", "year:1994"],
      ["library.players: library.playerCount", "players:2"],
      ["tagSelector.type.region: library.tagValues.region.us", "region:us"],
      ["tagSelector.type.lang: library.tagValues.lang.en", "lang:en"],
      [
        "tagSelector.type.edition: library.tagValues.edition.special",
        "edition:special",
      ],
      [/^library\.tags: custom:/, "custom:unknown-value"],
    ] as const) {
      const link = within(details).getByRole("link", { name });
      const target = new URL(link.getAttribute("href")!, "https://app.invalid");
      expect(target.pathname).toBe("/app/library/search");
      expect(target.searchParams.get("tag")).toBe(raw);
      expect(target.searchParams.get("system")).toBe("SNES");
    }
    expect(
      within(details).queryByRole("link", {
        name: /Game description|RetroArch|\/roms\//,
      }),
    ).not.toBeInTheDocument();
    await userEvent
      .setup()
      .click(
        within(details).getByRole("link", { name: "library.developer: Stern" }),
      );
    await screen.findByRole("heading", {
      level: 1,
      name: "library.searchTitle",
    });
    await waitFor(() =>
      expect(CoreAPI.mediaSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          systems: ["SNES"],
          tags: ["developer:stern"],
        }),
        expect.any(AbortSignal),
      ),
    );
    expect(router.history.location.pathname).toBe("/app/library/search");
    expect(
      await screen.findByRole("button", { name: /^Stern Result/ }),
    ).toBeVisible();
  });

  it.each([390, 1440])(
    "restores details with browser Back/Forward without replacing source entry at %ipx",
    async (width) => {
      viewport(width);
      const router = await app("/library/favorites");
      const sourceKey = router.history.location.state.__TSR_key;
      const details = await openGame(width >= 1100 ? "region" : "dialog");
      await userEvent.setup().click(
        within(details).getByRole("link", {
          name: "library.developer: Stern",
        }),
      );
      await screen.findByRole("heading", {
        name: "library.searchTitle",
        level: 1,
      });
      await act(() => router.history.back());
      expect(
        await screen.findByRole(width >= 1100 ? "region" : "dialog", {
          name: game.name,
        }),
      ).toBeVisible();
      expect(router.history.location.state.__TSR_key).toBe(sourceKey);
      await act(() => router.history.forward());
      await screen.findByRole("heading", {
        name: "library.searchTitle",
        level: 1,
      });
      await act(() => router.history.back());
      const returned = await screen.findByRole(
        width >= 1100 ? "region" : "dialog",
        { name: game.name },
      );
      const user = userEvent.setup();
      if (width < 1100) await user.keyboard("{Escape}");
      else
        await user.click(
          within(returned).getByRole("button", { name: "nav.close" }),
        );
      expect(
        useLibrarySessionStore.getState().metadataReturns[sourceKey!],
      ).toBeUndefined();
      await act(() => router.history.forward());
      await screen.findByRole("heading", {
        name: "library.searchTitle",
        level: 1,
      });
      await act(() => router.history.back());
      await screen.findByRole("heading", {
        name: "library.favorites",
        level: 1,
      });
      expect(
        screen.queryByRole(width >= 1100 ? "region" : "dialog", {
          name: game.name,
        }),
      ).not.toBeInTheDocument();
    },
  );

  it("returns to the originating details after the same collection selected another game", async () => {
    const other = {
      ...game,
      mediaId: 7,
      name: "Other Game",
      path: "/roms/SNES/Other Game.sfc",
    };
    vi.mocked(CoreAPI.mediaSearch).mockImplementation(async (params) => ({
      results: params.tags?.includes("user:favorite")
        ? [game, other]
        : [result],
      total: 2,
    }));
    const describeMedia = vi.mocked(CoreAPI.mediaMeta).getMockImplementation()!;
    vi.mocked(CoreAPI.mediaMeta).mockImplementation(async (params, signal) => {
      const response = await describeMedia(params, signal);
      if (params.mediaId !== other.mediaId) return response;
      return {
        media: {
          ...response.media,
          path: other.path,
          title: { ...response.media.title, name: other.name },
        },
      };
    });
    const user = userEvent.setup();
    const router = await app("/library/favorites");
    await user.click(
      within(await openGame()).getByRole("link", {
        name: "library.developer: Stern",
      }),
    );
    await screen.findByRole("heading", {
      level: 1,
      name: "library.searchTitle",
    });

    await act(() => router.navigate({ to: "/library/favorites" }));
    await user.click(
      await screen.findByRole("button", { name: /^Other Game/ }),
    );
    await screen.findByRole("dialog", { name: other.name });

    await act(() => router.history.go(-2));
    expect(
      await screen.findByRole("dialog", { name: game.name }),
    ).toBeVisible();
    expect(
      screen.queryByRole("dialog", { name: other.name }),
    ).not.toBeInTheDocument();
  });

  it("uses page Back to return to Home cover details", async () => {
    viewport(1440);
    const router = await app("/");
    const user = userEvent.setup();
    const favoritesHeading = await screen.findByRole("heading", {
      name: "scan.favoritesHeading",
    });
    await user.click(
      within(favoritesHeading.closest("section")!).getByRole("button", {
        name: "scan.coverRowDetails",
      }),
    );
    const details = await screen.findByRole("dialog", { name: game.name });
    await within(details).findByRole("link", {
      name: "library.publisher: Publisher Name",
    });
    await user.click(
      within(details).getByRole("link", {
        name: "library.publisher: Publisher Name",
      }),
    );
    await screen.findByRole("heading", {
      level: 1,
      name: "library.searchTitle",
    });
    await user.click(screen.getByRole("button", { name: "nav.back" }));
    expect(
      await screen.findByRole("dialog", { name: game.name }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe("/");
  });

  it("returns to phone Now Playing details without adding a Launch action", async () => {
    useStatusStore.setState({
      playing: {
        systemId: system.id,
        systemName: system.name,
        mediaName: game.name,
        mediaPath: game.path,
      },
    });
    await app("/");
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: `library.details: ${game.name}`,
      }),
    );
    const details = await screen.findByRole("dialog", { name: game.name });
    await user.click(
      await within(details).findByRole("link", {
        name: "library.developer: Stern",
      }),
    );
    await screen.findByRole("heading", {
      name: "library.searchTitle",
      level: 1,
    });
    await user.click(screen.getByRole("button", { name: "nav.back" }));
    const returned = await screen.findByRole("dialog", { name: game.name });
    expect(returned).toBeVisible();
    expect(
      within(returned).queryByRole("button", { name: "library.launch" }),
    ).not.toBeInTheDocument();
  });

  it("keeps source query and selected result while drilling into another metadata query", async () => {
    const router = await app(
      "/library/search?system=SNES&tag=developer%3Astern",
    );
    const user = userEvent.setup();
    const input = await screen.findByRole("searchbox", {
      name: "library.searchInput",
    });
    await user.type(input, "puzzle");
    await user.click(
      screen.getByRole("button", { name: "library.searchAction" }),
    );
    await waitFor(() =>
      expect(CoreAPI.mediaSearch).toHaveBeenCalledWith(
        expect.objectContaining({ query: "puzzle", tags: ["developer:stern"] }),
        expect.any(AbortSignal),
      ),
    );
    await user.click(
      await screen.findByRole("button", { name: /^Stern Result/ }),
    );
    const details = await screen.findByRole("dialog", { name: result.name });
    await user.click(
      await within(details).findByRole("link", {
        name: "library.publisher: Publisher Name",
      }),
    );
    await screen.findByRole("heading", {
      name: "library.searchTitle",
      level: 1,
    });
    expect(
      screen.getByRole("searchbox", { name: "library.searchInput" }),
    ).toHaveValue("");
    await act(() => router.history.back());
    expect(
      await screen.findByRole("dialog", { name: result.name }),
    ).toBeVisible();
    expect(
      screen.getByRole("searchbox", {
        name: "library.searchInput",
        hidden: true,
      }),
    ).toHaveValue("puzzle");
  });

  it("does not restore details after the active device changes", async () => {
    const router = await app("/library/favorites");
    const details = await openGame();
    await userEvent
      .setup()
      .click(
        within(details).getByRole("link", { name: "library.developer: Stern" }),
      );
    await screen.findByRole("heading", {
      name: "library.searchTitle",
      level: 1,
    });
    await act(async () => {
      await seedActiveDevice({ recordId: "device-b" });
    });
    await waitFor(() =>
      expect(useLibrarySessionStore.getState().deviceAddress).toBe("device-b"),
    );
    await act(() => router.history.back());
    await screen.findByRole("heading", { name: "library.favorites", level: 1 });
    expect(
      screen.queryByRole("dialog", { name: game.name }),
    ).not.toBeInTheDocument();
    expect(useLibrarySessionStore.getState().metadataReturns).toEqual({});
  });

  it("starts exploration at top and restores source scroll on Back", async () => {
    const router = await app("/library/favorites");
    const heading = await screen.findByRole("heading", {
      name: "library.favorites",
      level: 1,
    });
    const source = heading.closest<HTMLElement>(
      "[data-scroll-restoration-id]",
    )!;
    const originKey = router.history.location.state.__TSR_key;
    source.scrollTop = 150;
    fireEvent.scroll(source);
    useTabSessionStore.getState().rememberScroll("/library/search", 0, 900);
    const details = await openGame();
    await userEvent
      .setup()
      .click(
        within(details).getByRole("link", { name: "library.developer: Stern" }),
      );
    const searchHeading = await screen.findByRole("heading", {
      name: "library.searchTitle",
      level: 1,
    });
    expect(router.history.location.state.__TSR_key).not.toBe(originKey);
    await waitFor(() =>
      expect(
        searchHeading.closest<HTMLElement>("[data-scroll-restoration-id]")!
          .scrollTop,
      ).toBe(0),
    );
    await act(() => router.history.back());
    await screen.findByRole("dialog", { name: game.name });
    expect(
      screen
        .getByRole("heading", {
          name: "library.favorites",
          level: 1,
          hidden: true,
        })
        .closest<HTMLElement>("[data-scroll-restoration-id]")!.scrollTop,
    ).toBe(150);
  });

  it("does not mark or dismiss originating details on modified click", async () => {
    const router = await app("/library/favorites");
    const details = await openGame();
    const user = userEvent.setup();
    await user.keyboard("{Control>}");
    await user.click(
      within(details).getByRole("link", { name: "library.developer: Stern" }),
    );
    await user.keyboard("{/Control}");
    expect(router.state.location.pathname).toBe("/library/favorites");
    expect(details).toBeVisible();
    expect(useLibrarySessionStore.getState().metadataReturns).toEqual({});
  });

  it("returns to originating phone details with the shared Android Back handler", async () => {
    await app("/library/favorites");
    const details = await openGame();
    await userEvent
      .setup()
      .click(
        within(details).getByRole("link", { name: "library.developer: Stern" }),
      );
    await screen.findByRole("heading", {
      name: "library.searchTitle",
      level: 1,
    });
    const registration = mockApp.addListener.mock.calls.find(
      ([event]) => event === "backButton",
    );
    expect(registration).toBeDefined();
    await act(() => registration![1]({ canGoBack: true }));
    expect(
      await screen.findByRole("dialog", { name: game.name }),
    ).toBeVisible();
  });

  it("explores system summary without inventing a tag filter", async () => {
    await app("/library/favorites");
    const details = await openGame();
    const link = within(details).getByRole("link", {
      name: "library.system: SNES",
    });
    expect(
      new URL(
        link.getAttribute("href")!,
        "https://app.invalid",
      ).searchParams.has("tag"),
    ).toBe(false);
    await userEvent.setup().click(link);
    await waitFor(() =>
      expect(CoreAPI.mediaSearch).toHaveBeenCalledWith(
        expect.objectContaining({ systems: ["SNES"], tags: [] }),
        expect.any(AbortSignal),
      ),
    );
    expect(
      await screen.findByRole("button", { name: /^Stern Result/ }),
    ).toBeVisible();
  });

  it("does not send tag-filtered RPCs on unsupported Core", async () => {
    useStatusStore.setState({ coreVersion: "2.0.0" });
    await app("/library/search?system=SNES&tag=lang%3Aen");
    expect(
      await screen.findByRole("heading", {
        name: "library.searchTitle",
        level: 1,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "library.searchAction" }),
    ).toBeDisabled();
    expect(CoreAPI.mediaSearch).not.toHaveBeenCalled();
  });

  it("auto-runs direct filtered URLs but does not force a source-return Back action", async () => {
    await app("/library/search?system=SNES&tag=lang%3Aen");
    await waitFor(() =>
      expect(CoreAPI.mediaSearch).toHaveBeenCalledWith(
        expect.objectContaining({ systems: ["SNES"], tags: ["lang:en"] }),
        expect.any(AbortSignal),
      ),
    );
    expect(
      await screen.findByRole("button", { name: /^Stern Result/ }),
    ).toBeVisible();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "nav.back" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "library.title" }),
    ).toBeVisible();
  });
});
