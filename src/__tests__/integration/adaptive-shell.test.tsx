import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { App } from "@capacitor/app";
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
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@/test-utils";
import { RootLayout } from "@/routes/__root";
import { InboxModal } from "@/components/InboxModal";
import { PAGE_SCROLL_RESTORATION_SELECTOR } from "@/components/PageFrame";
import { Library } from "@/routes/library.index";
import { Create } from "@/routes/create.index";
import { Settings } from "@/routes/settings.index";
import { LibraryFavorites } from "@/routes/library.favorites";
import { CoreAPI } from "@/lib/coreApi";
import * as libraryImages from "@/lib/libraryImages";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useLibrarySessionStore } from "@/lib/librarySessionStore";
import { useTabSessionStore } from "@/lib/tabSessionStore";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";
import { responsiveWindow } from "@/test-utils/responsiveWindow";

async function renderShell(
  initialPath = "/library",
  withInbox = false,
  scrollRestoration = false,
  basepath = "/",
) {
  const root = createRootRoute({ component: RootLayout });
  const routes = [
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
      path: "/create",
      component: Create,
    }),
    createRoute({
      getParentRoute: () => root,
      path: "/settings",
      component: Settings,
    }),
  ];
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    scrollRestoration,
    scrollToTopSelectors: [PAGE_SCROLL_RESTORATION_SELECTOR],
    basepath,
  });
  await router.load();
  return {
    ...render(
      <>
        <RouterProvider router={router} />
        {withInbox && <InboxModal />}
      </>,
    ),
    router,
  };
}

async function enableLibrary() {
  useStatusStore.setState({
    connected: true,
    connectionState: ConnectionState.CONNECTED,
    coreVersion: "2.23.0",
    coreVersionPending: false,
    gamesIndex: { exists: true, indexing: false },
  });
  usePreferencesStore.setState({
    accessibleLists: true,
    preferRemoteWriter: true,
  });
  vi.spyOn(libraryImages, "requestLibraryImage").mockResolvedValue(null);
  vi.spyOn(CoreAPI, "systems").mockResolvedValue({
    systems: [{ id: "SNES", name: "Super Nintendo" }],
  });
  vi.spyOn(CoreAPI, "mediaSearch").mockResolvedValue({
    results: [
      {
        mediaId: 42,
        name: "Super Game",
        path: "/roms/SNES/Super Game.sfc",
        system: { id: "SNES", name: "Super Nintendo" },
        tags: [],
      },
    ],
    total: 1,
  });
  vi.spyOn(CoreAPI, "mediaMeta").mockResolvedValue({
    media: {
      path: "/roms/SNES/Super Game.sfc",
      parentDir: "/roms/SNES",
      isMissing: false,
      tags: [],
      properties: {},
      title: {
        slug: "super-game",
        name: "Super Game",
        slugLength: 10,
        slugWordCount: 2,
        system: { id: "SNES", name: "Super Nintendo" },
        tags: [],
        properties: {},
      },
    },
  });
  vi.spyOn(CoreAPI, "hasWriteCapableReader").mockResolvedValue(true);
  vi.spyOn(CoreAPI, "readersWriteCancel").mockResolvedValue();
  vi.spyOn(CoreAPI, "decks").mockResolvedValue({ decks: [] });
  vi.spyOn(CoreAPI, "run").mockResolvedValue();
}

async function selectGame(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /Super Game/ }));
  return screen.findByRole("region", { name: "Super Game" });
}

describe("Adaptive application shell", () => {
  beforeEach(async () => {
    useStatusStore.setState({
      ...useStatusStore.getInitialState(),
      connected: false,
      connectionState: ConnectionState.IDLE,
      encryptionState: "plaintext",
      safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
    });
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
    });
    useLibrarySessionStore.getState().reset();
    useTabSessionStore.getState().reset();
    await seedActiveDevice({ address: "192.168.1.100", name: "Living room" });
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    { width: 1440, path: "/library", top: 0, base: "/" },
    { width: 1440, path: "/library", top: 0, base: "/app" },
    { width: 820, path: "/library", top: 450, base: "/" },
    { width: 390, path: "/library/favorites", top: 620, base: "/" },
  ])(
    "opens $path at $top from navigation at $width ($base)",
    async ({ width, path, top, base }) => {
      const resize = responsiveWindow(width === 390 ? 1440 : width);
      await enableLibrary();
      const user = userEvent.setup();
      useTabSessionStore
        .getState()
        .rememberLocation("/library/favorites", "/library/favorites");
      useTabSessionStore.getState().rememberScroll("/library", 0, 450);
      useTabSessionStore
        .getState()
        .rememberScroll("library:favorites:list", 0, 620);
      const draft = { query: "draft", system: "SNES", tags: [] };
      useTabSessionStore.getState().setCreateSearch(draft);
      const { router } = await renderShell(
        `${base === "/" ? "" : base}/create`,
        false,
        true,
        base,
      );
      if (width === 390) {
        const desktopNav = within(
          await screen.findByRole("navigation", { name: "nav.mainNavigation" }),
        );
        await user.click(desktopNav.getByRole("link", { name: "nav.create" }));
        expect(router.state.location.state.appNavigationSource).toBe(
          "desktop-sidebar",
        );
        await resize(390);
      }
      if (width === 820)
        await user.click(
          await screen.findByRole("button", { name: "nav.openMenu" }),
        );
      const navigation = await screen.findByRole("navigation", {
        name: "nav.mainNavigation",
      });
      const link = within(navigation).getByRole("link", {
        name: "nav.library",
      });
      expect(link).toHaveAttribute(
        "href",
        `${base === "/" ? "" : base}${width === 390 ? "/library/favorites" : "/library"}`,
      );
      await user.click(link);
      await waitFor(() => {
        expect(router.state.location.pathname).toBe(path);
        expect(
          document.querySelector(PAGE_SCROLL_RESTORATION_SELECTOR),
        ).toHaveProperty("scrollTop", top);
      });
      expect(useTabSessionStore.getState().createSearch).toEqual(draft);
    },
  );

  it("restores desktop history per entry, starts sidebar children at top, and leaves modified clicks alone", async () => {
    const resize = responsiveWindow(1440);
    await enableLibrary();
    const user = userEvent.setup();
    useTabSessionStore
      .getState()
      .rememberScroll("library:favorites:list", 0, 620);
    const { router } = await renderShell("/create", false, true);
    const nav = within(
      await screen.findByRole("navigation", { name: "nav.mainNavigation" }),
    );
    const group = nav.getByRole("link", { name: "nav.library" }).closest("li")!;
    await user.click(
      within(group).getByRole("button", { name: "nav.expandSection" }),
    );
    let favorites = nav.getByRole("link", {
      name: "library.favorites",
    });
    const setScroll = (top: number) => {
      const scroll = document.querySelector<HTMLElement>(
        PAGE_SCROLL_RESTORATION_SELECTOR,
      )!;
      scroll.scrollTop = top;
      fireEvent.scroll(scroll);
      return scroll;
    };
    setScroll(160);
    const initialHistoryLength = router.history.length;
    await user.click(nav.getByRole("link", { name: "nav.create" }));
    await waitFor(() =>
      expect(
        document.querySelector(PAGE_SCROLL_RESTORATION_SELECTOR),
      ).toHaveProperty("scrollTop", 0),
    );
    expect(router.history.length).toBe(initialHistoryLength);
    await user.click(favorites);
    await waitFor(() =>
      expect(
        document.querySelector(PAGE_SCROLL_RESTORATION_SELECTOR),
      ).toHaveProperty("scrollTop", 0),
    );
    setScroll(250);
    await user.click(nav.getByRole("link", { name: "nav.create" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/create"));
    setScroll(440);
    await user.click(favorites);
    await waitFor(() =>
      expect(
        document.querySelector(PAGE_SCROLL_RESTORATION_SELECTOR),
      ).toHaveProperty("scrollTop", 0),
    );
    const current = setScroll(90);
    await resize(390);
    expect(router.state.location.pathname).toBe("/library/favorites");
    expect(document.querySelector(PAGE_SCROLL_RESTORATION_SELECTOR)).toBe(
      current,
    );
    expect(current.scrollTop).toBe(90);
    await resize(1440);
    expect(current.scrollTop).toBe(90);
    favorites = nav.getByRole("link", { name: "library.favorites" });
    fireEvent.click(favorites, { ctrlKey: true });
    expect(current.scrollTop).toBe(90);
    act(() => router.history.back());
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/create");
      expect(
        document.querySelector(PAGE_SCROLL_RESTORATION_SELECTOR),
      ).toHaveProperty("scrollTop", 440);
    });
    act(() => router.history.back());
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/library/favorites");
      expect(
        document.querySelector(PAGE_SCROLL_RESTORATION_SELECTOR),
      ).toHaveProperty("scrollTop", 250);
    });
    act(() => router.history.forward());
    await waitFor(() => expect(router.state.location.pathname).toBe("/create"));
    act(() => router.history.forward());
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/library/favorites");
      expect(
        document.querySelector(PAGE_SCROLL_RESTORATION_SELECTOR),
      ).toHaveProperty("scrollTop", 90);
    });
    const historyLength = router.history.length;
    await user.click(favorites);
    await waitFor(() =>
      expect(
        document.querySelector(PAGE_SCROLL_RESTORATION_SELECTOR),
      ).toHaveProperty("scrollTop", 0),
    );
    expect(router.history.length).toBe(historyLength);
  });

  it("should keep one navigation and page instance across phone, drawer and sidebar widths", async () => {
    const resize = responsiveWindow(390);
    await renderShell();
    const navigation = await screen.findByRole("navigation", {
      name: "nav.mainNavigation",
    });
    const heading = screen.getByRole("heading", {
      name: "library.title",
      level: 1,
    });
    expect(
      within(navigation).getByRole("link", { name: "nav.library" }),
    ).toHaveAttribute("aria-current", "page");
    await resize(820);
    await resize(1440);
    await resize(390);
    expect(
      screen.getAllByRole("navigation", { name: "nav.mainNavigation" }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("heading", { name: "library.title", level: 1 }),
    ).toBe(heading);
    expect(screen.getByRole("navigation", { name: "nav.mainNavigation" })).toBe(
      navigation,
    );
  });

  it("should expand a group without navigating and keep one group open at a time", async () => {
    responsiveWindow(1440);
    const user = userEvent.setup();
    const { router, baseElement } = await renderShell();
    const navigation = screen.getByRole("navigation", {
      name: "nav.mainNavigation",
    });
    const library = within(navigation).getByRole("listitem", {
      name: "nav.library",
    });
    const create = within(navigation).getByRole("listitem", {
      name: "nav.create",
    });
    expect(
      within(library).getByRole("link", { name: "nav.search" }),
    ).toBeVisible();
    await user.click(
      within(create).getByRole("button", { name: "nav.expandSection" }),
    );
    expect(router.state.location.pathname).toBe("/library");
    expect(
      within(create).getByRole("link", { name: "create.customHeading" }),
    ).toHaveAttribute("href", "/create/custom");
    expect(
      within(library).queryByRole("link", { name: "nav.search" }),
    ).not.toBeInTheDocument();
    await user.click(
      within(navigation).getByRole("link", { name: "nav.settings" }),
    );
    await screen.findByRole("heading", { name: "settings.title" });
    const settings = within(navigation).getByRole("listitem", {
      name: "nav.settings",
    });
    expect(
      within(settings).getByRole("button", { name: "nav.collapseSection" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      within(create).queryByRole("link", { name: "create.customHeading" }),
    ).not.toBeInTheDocument();
    expect(
      within(settings).getByRole("link", { name: "nav.devices" }),
    ).toBeVisible();
    await user.click(
      within(settings).getByRole("button", { name: "nav.collapseSection" }),
    );
    expect(
      within(navigation).queryByRole("button", { name: "nav.collapseSection" }),
    ).not.toBeInTheDocument();
    expect(await findA11yViolations(baseElement)).toEqual([]);
  });

  it("should list sidebar destinations in landing-page order under their groups", async () => {
    responsiveWindow(1440);
    await enableLibrary();
    const user = userEvent.setup();
    await renderShell();
    const navigation = screen.getByRole("navigation", {
      name: "nav.mainNavigation",
    });
    const names = (section: string) =>
      within(within(navigation).getByRole("listitem", { name: section }))
        .getAllByRole("link")
        .slice(1)
        .map((link) => link.textContent);
    const library = within(navigation).getByRole("listitem", {
      name: "nav.library",
    });

    expect(names("nav.library")).toEqual([
      "nav.search",
      "library.systems",
      "nav.all",
      "library.favorites",
      "library.playLater",
      "library.liked",
      "library.disliked",
      "library.recentlyPlayed",
      "library.topPlayed",
    ]);
    expect(
      within(
        within(library).getByRole("list", { name: "library.collections" }),
      ).getAllByRole("link"),
    ).toHaveLength(7);

    const expand = (section: string) =>
      user.click(
        within(
          within(navigation).getByRole("listitem", { name: section }),
        ).getByRole("button", { name: "nav.expandSection" }),
      );
    await expand("nav.create");
    expect(names("nav.create")).toEqual([
      "create.searchGameHeading",
      "decks.new",
      "create.mappingsHeading",
      "create.customHeading",
      "create.nfcHeading",
    ]);

    await expand("nav.settings");
    const settings = within(
      within(navigation).getByRole("listitem", { name: "nav.settings" }),
    );
    const grouped = (group: string) =>
      within(settings.getByRole("list", { name: group }))
        .getAllByRole("link")
        .map((link) => link.textContent);
    expect(grouped("settings.groups.app")).toEqual([
      "settings.languageRegion.title",
      "settings.accessibility.title",
      "online.title",
    ]);
    expect(grouped("settings.groups.device")).toEqual([
      "nav.devices",
      "nav.media",
      "settings.readers.title",
      "settings.playControls.title",
      "settings.advanced.title",
    ]);
    expect(grouped("settings.groups.support")).toEqual([
      "settings.help.title",
      "settings.about.title",
    ]);
  });

  it("should switch between the Library systems and collections views from the sidebar", async () => {
    responsiveWindow(1440);
    await enableLibrary();
    const user = userEvent.setup();
    const { router } = await renderShell();
    const navigation = within(
      screen.getByRole("navigation", { name: "nav.mainNavigation" }),
    );
    const systems = navigation.getByRole("link", { name: "library.systems" });
    const collections = navigation.getByRole("link", { name: "nav.all" });
    expect(systems).toHaveAttribute("aria-current", "page");
    expect(collections).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "library.systems", level: 2 }),
    ).toBeVisible();

    await user.click(collections);
    expect(router.state.location.pathname).toBe("/library");
    expect(
      await screen.findByRole("heading", {
        name: "library.collections",
        level: 2,
      }),
    ).toBeVisible();
    expect(collections).toHaveAttribute("aria-current", "page");
    expect(systems).not.toHaveAttribute("aria-current");

    await user.click(systems);
    expect(
      screen.getByRole("heading", { name: "library.systems", level: 2 }),
    ).toBeVisible();
    expect(systems).toHaveAttribute("aria-current", "page");

    // The section link itself always opens the Systems view on desktop.
    await user.click(collections);
    await screen.findByRole("heading", {
      name: "library.collections",
      level: 2,
    });
    await user.click(navigation.getByRole("link", { name: "nav.library" }));
    expect(
      await screen.findByRole("heading", { name: "library.systems", level: 2 }),
    ).toBeVisible();
    expect(systems).toHaveAttribute("aria-current", "page");
  });

  it("should focus the destination after drawer navigation and keep desktop navigation nonmodal", async () => {
    const resize = responsiveWindow(820);
    const user = userEvent.setup();
    const { router } = await renderShell();
    const toggle = screen.getByRole("button", { name: "nav.openMenu" });
    await user.click(toggle);
    const drawer = screen.getByRole("dialog", { name: "nav.menu" });
    await user.click(
      within(drawer).getByRole("link", { name: "nav.settings" }),
    );
    const heading = await screen.findByRole("heading", {
      name: "settings.title",
    });
    expect(heading).toHaveFocus();
    expect(router.state.location.pathname).toBe("/settings");
    expect(
      screen.queryByRole("dialog", { name: "nav.menu" }),
    ).not.toBeInTheDocument();
    await user.click(toggle);
    const currentLink = screen.getByRole("link", { name: "nav.settings" });
    currentLink.focus();
    await resize(1440);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "nav.settings" })).toBe(
      currentLink,
    );
    expect(currentLink).toHaveFocus();
    expect(screen.getByRole("main")).not.toHaveAttribute("inert");
    await resize(820);
    expect(screen.getByRole("button", { name: "nav.openMenu" })).toHaveFocus();
    expect(router.state.location.pathname).toBe("/settings");
  });

  it("should lead reading order with navigation from tablet width and keep the phone dock in the footer", async () => {
    const resize = responsiveWindow(1440);
    await renderShell();
    const navigation = await screen.findByRole("navigation", {
      name: "nav.mainNavigation",
    });
    const main = screen.getByRole("main");
    const footer = screen.getByRole("contentinfo");
    const precedesMain = () =>
      Boolean(
        navigation.compareDocumentPosition(main) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      );

    expect(precedesMain()).toBe(true);
    expect(footer).not.toContainElement(navigation);

    await resize(820);
    expect(
      screen.getByRole("button", { name: "nav.openMenu" }),
    ).toBeInTheDocument();
    expect(precedesMain()).toBe(true);
    expect(footer).not.toContainElement(navigation);

    await resize(390);
    expect(precedesMain()).toBe(false);
    expect(footer).toContainElement(navigation);
  });

  it("should name the tablet menu dialog separately from its navigation landmark", async () => {
    responsiveWindow(820);
    const user = userEvent.setup();
    await renderShell();
    await user.click(screen.getByRole("button", { name: "nav.openMenu" }));

    const drawer = screen.getByRole("dialog", { name: "nav.menu" });
    expect(
      within(drawer).getByRole("navigation", { name: "nav.mainNavigation" }),
    ).toBeInTheDocument();
  });

  it("should return focus to the menu button when the drawer reselects the current page", async () => {
    responsiveWindow(820);
    const user = userEvent.setup();
    const { router } = await renderShell();
    const toggle = screen.getByRole("button", { name: "nav.openMenu" });
    await user.click(toggle);
    const drawer = screen.getByRole("dialog", { name: "nav.menu" });

    await user.click(within(drawer).getByRole("link", { name: "nav.library" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "nav.menu" }),
      ).not.toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe("/library");
    expect(toggle).toHaveFocus();
  });

  it("should mark only the exact sidebar destination as the current page", async () => {
    responsiveWindow(1440);
    await enableLibrary();
    await renderShell("/library/favorites");
    const navigation = within(
      await screen.findByRole("navigation", { name: "nav.mainNavigation" }),
    );

    expect(
      navigation.getByRole("link", { name: "library.favorites" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      navigation.getByRole("link", { name: "nav.library" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("should hide the Settings badge inside Settings on the sidebar as on the dock", async () => {
    const resize = responsiveWindow(1440);
    useStatusStore.setState({
      connected: true,
      connectionState: ConnectionState.CONNECTED,
      coreVersion: "2.23.0",
      coreVersionPending: false,
      inboxMessages: [
        { id: 1, title: "Notice", body: "", severity: 0, createdAt: "" },
      ] as never,
    });
    const user = userEvent.setup();
    await renderShell("/library");
    const navigation = within(
      await screen.findByRole("navigation", { name: "nav.mainNavigation" }),
    );
    const settings = navigation.getByRole("link", {
      name: "nav.settingsWithNotifications",
    });

    await user.click(settings);
    await screen.findByRole("heading", { name: "settings.title" });

    expect(
      navigation.getByRole("link", { name: "nav.settings" }),
    ).toBeInTheDocument();
    await resize(390);
    expect(
      within(
        screen.getByRole("navigation", { name: "nav.mainNavigation" }),
      ).getByRole("link", { name: "nav.settings" }),
    ).toBeInTheDocument();
  });

  it("should list Create destinations as unavailable while disconnected like the landing cards", async () => {
    responsiveWindow(1440);
    await renderShell("/create");
    const navigation = within(
      await screen.findByRole("navigation", { name: "nav.mainNavigation" }),
    );

    // The disabled landing card and the sidebar entry share the same name.
    for (const search of navigation.getAllByText("create.searchGameHeading")) {
      expect(search.closest("a")).toHaveAttribute("aria-disabled", "true");
    }
    expect(navigation.getByText("create.mappingsHeading")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(
      navigation.getByRole("link", { name: "create.customHeading" }),
    ).not.toHaveAttribute("aria-disabled");
  });

  it("should consume app Back in the navigation drawer before navigating away", async () => {
    responsiveWindow(820);
    const user = userEvent.setup();
    const { router } = await renderShell();
    await user.click(screen.getByRole("button", { name: "nav.openMenu" }));
    await waitFor(() =>
      expect(App.addListener).toHaveBeenCalledWith(
        "backButton",
        expect.any(Function),
      ),
    );
    const callback = [...vi.mocked(App.addListener).mock.calls]
      .reverse()
      .find(([name]) => name === "backButton")?.[1];
    expect(callback).toBeDefined();
    await act(async () => {
      await callback?.({ canGoBack: true });
    });
    expect(
      screen.queryByRole("dialog", { name: "nav.menu" }),
    ).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/library");
    expect(screen.getByRole("button", { name: "nav.openMenu" })).toHaveFocus();
  });

  it("should preserve Settings overview navigation and heading through phone/tablet/desktop changes", async () => {
    const resize = responsiveWindow(1440);
    const { router, baseElement } = await renderShell("/settings");
    const heading = await screen.findByRole("heading", {
      name: "settings.title",
    });
    const app = screen.getByRole("navigation", { name: "settings.groups.app" });
    const online = within(app).getByRole("link", { name: /online.title/ });
    expect(online).toHaveAttribute("href", "/settings/online");
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(screen.getByRole("heading", { name: "settings.title" })).toBe(
        heading,
      );
      expect(
        screen.getByRole("navigation", { name: "settings.groups.app" }),
      ).toBe(app);
      expect(online).toBeVisible();
      expect(router.state.location.pathname).toBe("/settings");
    }
    expect(await findA11yViolations(baseElement)).toEqual([]);
  });

  it("should retain one content-owned Settings heading and Inbox action across resize", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    useStatusStore.setState({
      coreVersion: "2.23.0",
      coreVersionPending: false,
    });
    await renderShell("/settings", true);
    const heading = await screen.findByRole("heading", {
      name: "settings.title",
    });
    const scroll = heading.closest<HTMLElement>("[data-scroll-restoration-id]");
    expect(scroll).not.toBeNull();
    const inbox = within(scroll!).getByRole("button", {
      name: "inbox.openLabel",
    });
    await user.click(inbox);
    const dialog = await screen.findByRole("dialog", { name: "inbox.title" });
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(screen.getByRole("dialog", { name: "inbox.title" })).toBe(dialog);
      expect(
        within(scroll!).getByRole("heading", {
          name: "settings.title",
          hidden: true,
        }),
      ).toBe(heading);
      expect(
        within(scroll!).getByRole("button", {
          name: "inbox.openLabel",
          hidden: true,
        }),
      ).toBe(inbox);
    }
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("dialog", { name: "inbox.title" }),
    ).not.toBeInTheDocument();
    expect(inbox).toHaveFocus();
  });

  it("should preserve device-entry draft and sheet identity across wide presentation changes", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    await renderShell("/settings");
    await user.click(
      await screen.findByRole("button", { name: "settings.deviceHistory" }),
    );
    const sheet = screen.getByRole("dialog", { name: "scan.deviceSheetTitle" });
    await user.click(
      within(sheet).getByRole("button", {
        name: "settings.deviceSetup.addDeviceManually",
      }),
    );
    const input = screen.getByRole("textbox", { name: "settings.device" });
    await user.clear(input);
    await user.type(input, "192.168.1.200");
    await resize(820);
    expect(screen.getByRole("textbox", { name: "settings.device" })).toBe(
      input,
    );
    expect(input).toHaveValue("192.168.1.200");
    await resize(390);
    await resize(1440);
    expect(screen.getByRole("textbox", { name: "settings.device" })).toBe(
      input,
    );
    expect(input).toHaveValue("192.168.1.200");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("should preserve selected detail surface and focus while changing between pane and modal", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    await enableLibrary();
    await renderShell("/library/favorites");
    const row = await screen.findByRole("button", { name: /Super Game/ });
    await user.click(row);
    const pane = await screen.findByRole("region", { name: "Super Game" });
    expect(row).toHaveFocus();
    expect(row).toHaveAttribute("aria-current", "true");
    expect(CoreAPI.run).not.toHaveBeenCalled();
    await resize(390);
    expect(screen.getByRole("dialog", { name: "Super Game" })).toBe(pane);
    expect(
      within(pane).getByRole("heading", { name: "Super Game" }),
    ).toHaveFocus();
    await resize(1440);
    expect(screen.getByRole("region", { name: "Super Game" })).toBe(pane);
    expect(
      within(pane).getByRole("heading", { name: "Super Game" }),
    ).toHaveFocus();
    expect(CoreAPI.mediaMeta).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("region", { name: "Super Game" }),
    ).not.toBeInTheDocument();
    expect(row).not.toHaveAttribute("aria-current");
  });

  it("should retain contextual write through resize and cancel only on explicit dismissal", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    await enableLibrary();
    let writeSignal: AbortSignal | undefined;
    vi.spyOn(CoreAPI, "write").mockImplementation(
      (_params, signal) =>
        new Promise<void>((resolve) => {
          writeSignal = signal;
          signal?.addEventListener("abort", () => resolve(), { once: true });
        }),
    );
    await renderShell("/library/favorites");
    const pane = await selectGame(user);
    const write = within(pane).getByRole("button", { name: "library.write" });
    await waitFor(() => expect(write).toBeEnabled());
    await user.click(write);
    await waitFor(() => expect(CoreAPI.write).toHaveBeenCalled());
    await resize(390);
    await resize(1440);
    expect(screen.getByRole("region", { name: "Super Game" })).toBe(pane);
    expect(
      within(pane).getByRole("button", { name: "reader.cancelAction" }),
    ).toBe(write);
    expect(writeSignal?.aborted).toBe(false);
    expect(CoreAPI.write).toHaveBeenCalledTimes(1);
    expect(CoreAPI.readersWriteCancel).not.toHaveBeenCalled();
    await user.click(within(pane).getByRole("button", { name: "nav.close" }));
    await waitFor(() => expect(writeSignal?.aborted).toBe(true));
    expect(CoreAPI.readersWriteCancel).toHaveBeenCalledTimes(1);
  });

  it("should preserve child-dialog draft and restore surviving pane after resize", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    await enableLibrary();
    await renderShell("/library/favorites");
    const pane = await selectGame(user);
    await user.click(
      within(pane).getByRole("button", { name: "decks.addAction" }),
    );
    const child = screen.getByRole("dialog", { name: "decks.addAction" });
    const search = within(child).getByRole("searchbox", {
      name: "decks.search",
    });
    await user.type(search, "Weekend");
    await resize(390);
    await resize(1440);
    expect(screen.getByRole("dialog", { name: "decks.addAction" })).toBe(child);
    expect(search).toHaveValue("Weekend");
    expect(search).toHaveFocus();
    expect(pane.inert).toBe(true);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("region", { name: "Super Game" })).toBe(pane);
    expect(pane.inert).toBe(false);
  });

  it("should open tablet navigation over a Library pane and return focus on Escape", async () => {
    responsiveWindow(1180);
    const user = userEvent.setup();
    await enableLibrary();
    await renderShell("/library/favorites");
    const pane = await selectGame(user);
    const toggle = screen.getByRole("button", { name: "nav.openMenu" });
    await user.click(toggle);
    const drawer = screen.getByRole("dialog", { name: "nav.menu" });
    expect(drawer).toHaveFocus();
    expect(screen.getByRole("main")).toHaveAttribute("inert");
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("dialog", { name: "nav.menu" }),
    ).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
    expect(screen.getByRole("region", { name: "Super Game" })).toBe(pane);
  });

  it("should restore wide Library selection without reopening a phone sheet on tab return", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    await enableLibrary();
    const { router } = await renderShell("/library/favorites");
    await selectGame(user);
    const navigation = screen.getByRole("navigation", {
      name: "nav.mainNavigation",
    });
    await user.click(
      within(navigation).getByRole("link", { name: "nav.create" }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/create"));
    await user.click(
      within(
        within(navigation).getByRole("listitem", { name: "nav.library" }),
      ).getByRole("button", { name: "nav.expandSection" }),
    );
    await user.click(
      within(navigation).getByRole("link", { name: "library.favorites" }),
    );
    expect(
      await screen.findByRole("region", { name: "Super Game" }),
    ).toBeVisible();
    await user.click(
      within(navigation).getByRole("link", { name: "nav.create" }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/create"));
    await resize(390);
    await user.click(
      within(navigation).getByRole("link", { name: "nav.library" }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/library/favorites"),
    );
    expect(
      screen.queryByRole("dialog", { name: "Super Game" }),
    ).not.toBeInTheDocument();
    await resize(1440);
    expect(
      await screen.findByRole("region", { name: "Super Game" }),
    ).toBeVisible();
    expect(CoreAPI.run).not.toHaveBeenCalled();
  });

  it("should navigate real destinations and reuse shell device sheet from Settings", async () => {
    responsiveWindow(1440);
    const user = userEvent.setup();
    const { router } = await renderShell();
    const navigation = await screen.findByRole("navigation", {
      name: "nav.mainNavigation",
    });
    await user.click(
      within(navigation).getByRole("link", { name: "nav.create" }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/create"));
    await user.click(
      within(navigation).getByRole("link", { name: "nav.settings" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "settings.deviceHistory" }),
    );
    expect(
      screen.getAllByRole("dialog", { name: "scan.deviceSheetTitle" }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("navigation", {
        name: "nav.mainNavigation",
        hidden: true,
      }),
    ).toHaveLength(1);
  });
});
