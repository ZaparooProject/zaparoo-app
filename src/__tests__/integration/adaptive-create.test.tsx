import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import {
  act,
  findA11yViolations,
  render,
  screen,
  waitFor,
  within,
} from "@/test-utils";
import { RootLayout } from "@/routes/__root";
import { Create } from "@/routes/create.index";
import { CustomText } from "@/routes/create.custom";
import { NfcUtils } from "@/routes/create.nfc";
import { Mappings } from "@/routes/create.mappings";
import { Search } from "@/routes/-pages/Search";
import { MappingEditor } from "@/routes/-pages/MappingEditor";
import { NewDeck } from "@/routes/library.decks.new";
import { Route as CreateDeckRoute } from "@/routes/create.decks.new";
import { DeckDetails } from "@/routes/library.decks.$deckId";
import { CoreAPI } from "@/lib/coreApi";
import type { Deck } from "@/lib/models";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";
import { responsiveWindow } from "@/test-utils/responsiveWindow";

const system = {
  id: "nes",
  name: "Nintendo Entertainment System",
  mediaCount: 1,
};
const game = {
  name: "Super Mario Bros.",
  system,
  path: "NES/Mario.nes",
  tags: [],
};
const deck: Deck = {
  deckId: "0k3v9x2rq7bm",
  name: "Desk collection",
  description: "Weekend games",
  owned: true,
  locked: false,
  itemCount: 0,
  items: [],
  createdAt: 1,
  updatedAt: 1,
};

async function renderCreate(path: string, basepath?: string) {
  const root = createRootRoute({ component: RootLayout });
  const pages = [
    { path: "/create", component: Create },
    { path: "/create/custom", component: CustomText },
    { path: "/create/nfc", component: NfcUtils },
    { path: "/create/mappings", component: Mappings },
    { path: "/create/mappings/new", component: MappingEditor },
    {
      path: "/create/search",
      component: Search,
      loader: () => ({
        systemQuery: "all",
        tagQuery: [],
        systems: { systems: [system] },
      }),
    },
    { path: "/create/decks/new", component: CreateDeckRoute.options.component },
    { path: "/library/decks/new", component: NewDeck },
    { path: "/library/decks/$deckId", component: DeckDetails },
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

describe("Adaptive Create pages", () => {
  beforeEach(async () => {
    useStatusStore.setState({
      ...useStatusStore.getInitialState(),
      connected: true,
      connectionState: ConnectionState.CONNECTED,
      coreVersion: "2.23.0",
      coreVersionPending: false,
      encryptionState: "plaintext",
      gamesIndex: {
        ...useStatusStore.getInitialState().gamesIndex,
        exists: true,
      },
    });
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
      accessibleLists: true,
    });
    await seedActiveDevice();
    vi.spyOn(CoreAPI, "mappings").mockResolvedValue({ mappings: [] });
    vi.spyOn(CoreAPI, "newMapping").mockResolvedValue();
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
    vi.spyOn(CoreAPI, "readers").mockResolvedValue({ readers: [] });
    vi.spyOn(CoreAPI, "run").mockResolvedValue();
    vi.spyOn(CoreAPI, "deckGet").mockResolvedValue(deck);
    vi.spyOn(CoreAPI, "deckNew").mockResolvedValue(deck);
  });
  afterEach(() => vi.restoreAllMocks());

  it("retains destinations and scrolling title through resize", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    const { router, baseElement } = await renderCreate("/create");
    const heading = await screen.findByRole("heading", {
      name: "create.title",
    });
    const search = within(pageScroll(heading)).getByRole("link", {
      name: /create.searchGameHeading/,
    });
    const newDeck = within(pageScroll(heading)).getByRole("link", {
      name: /decks.new/,
    });
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(screen.getByRole("heading", { name: "create.title" })).toBe(
        heading,
      );
      expect(
        within(pageScroll(heading)).getByRole("link", {
          name: /create.searchGameHeading/,
        }),
      ).toBe(search);
      expect(newDeck).toHaveAttribute("href", "/create/decks/new");
      expect(router.state.location.pathname).toBe("/create");
    }
    expect(await findA11yViolations(baseElement)).toEqual([]);
    await user.click(search);
    await screen.findByRole("heading", { name: "create.search.title" });
    expect(router.state.location.pathname).toBe("/create/search");
  });

  it("retains custom text, cursor and focus with embedded parent navigation", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    const { router } = await renderCreate("/app/create/custom", "/app");
    const heading = await screen.findByRole("heading", {
      name: "create.custom.title",
    });
    const editor = screen.getByRole("textbox", {
      name: "create.custom.textareaLabel",
    }) as HTMLTextAreaElement;
    await user.type(editor, "**launch.title:NES/Mario");
    editor.setSelectionRange(9, 15);
    const parent = within(pageScroll(heading)).getByRole("link", {
      name: "create.title",
      hidden: true,
    });
    expect(parent).toHaveAttribute("href", "/app/create");
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(
        screen.getByRole("textbox", { name: "create.custom.textareaLabel" }),
      ).toBe(editor);
      expect(editor).toHaveValue("**launch.title:NES/Mario");
      expect(editor).toHaveFocus();
      expect(editor.selectionStart).toBe(9);
      expect(editor.selectionEnd).toBe(15);
      expect(usePreferencesStore.getState().customText).toBe(
        "**launch.title:NES/Mario",
      );
    }
    expect(CoreAPI.run).not.toHaveBeenCalled();
    expect(Nfc.startScanSession).not.toHaveBeenCalled();
    await user.click(parent);
    await screen.findByRole("heading", { name: "create.title" });
    expect(router.history.location.pathname).toBe("/app/create");
  });

  it("retains mapping drafts and pending save without duplicate mutations", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    let finish!: () => void;
    vi.mocked(CoreAPI.newMapping).mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const { router } = await renderCreate("/create/mappings/new");
    const label = await screen.findByRole("textbox", {
      name: "create.mappings.editor.label",
    });
    const pattern = screen.getByRole("textbox", {
      name: "create.mappings.editor.pattern",
    });
    await user.type(label, "Desk rule");
    await user.type(pattern, "CARD-42");
    const save = screen.getByRole("button", {
      name: "create.mappings.editor.save",
    });
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(
        screen.getByRole("textbox", { name: "create.mappings.editor.pattern" }),
      ).toBe(pattern);
      expect(pattern).toHaveValue("CARD-42");
      expect(pattern).toHaveFocus();
      expect(label).toHaveValue("Desk rule");
    }
    await user.click(save);
    await waitFor(() => expect(CoreAPI.newMapping).toHaveBeenCalledTimes(1));
    for (const width of [390, 820, 1440]) {
      await resize(width);
      expect(save).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "create.mappings.editor.save" }),
      ).toBe(save);
      expect(pattern).toHaveValue("CARD-42");
      expect(CoreAPI.newMapping).toHaveBeenCalledTimes(1);
    }
    await act(() => finish());
    await screen.findByRole("heading", { name: "create.mappings.title" });
    expect(router.state.location.pathname).toBe("/create/mappings");
  });

  it("retains submitted search, selected result and modal through resize", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    const { router } = await renderCreate("/create/search");
    const query = await screen.findByRole("searchbox", {
      name: "create.search.gameInput",
    });
    await user.type(query, "Mario");
    await user.click(
      screen.getByRole("button", { name: "create.search.searchButton" }),
    );
    await user.click(
      await screen.findByRole("button", { name: /Super Mario Bros\./ }),
    );
    const dialog = await screen.findByRole("dialog");
    const requestCount = vi.mocked(CoreAPI.mediaSearch).mock.calls.length;
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(screen.getByRole("dialog")).toBe(dialog);
      expect(
        screen.getByRole("searchbox", {
          name: "create.search.gameInput",
          hidden: true,
        }),
      ).toBe(query);
      expect(query).toHaveValue("Mario");
      expect(within(dialog).getByText("Super Mario Bros.")).toBeInTheDocument();
      expect(CoreAPI.mediaSearch).toHaveBeenCalledTimes(requestCount);
      expect(router.state.location.pathname).toBe("/create/search");
    }
    expect(CoreAPI.run).not.toHaveBeenCalled();
    expect(Nfc.startScanSession).not.toHaveBeenCalled();
  });

  it("keeps active local NFC read session until explicit cancellation", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    await renderCreate("/create/nfc");
    await user.click(
      await screen.findByRole("button", { name: "create.nfc.readTab.scanTag" }),
    );
    await waitFor(() => expect(Nfc.startScanSession).toHaveBeenCalledTimes(1));
    const cancel = screen.getByRole("button", { name: "reader.cancelAction" });
    const stopCount = vi.mocked(Nfc.stopScanSession).mock.calls.length;
    const listenerCount = vi.mocked(Nfc.addListener).mock.calls.length;
    const tab = screen.getByRole("tab", { name: "create.nfc.tabs.read" });
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(screen.getByRole("button", { name: "reader.cancelAction" })).toBe(
        cancel,
      );
      expect(screen.getByRole("tab", { name: "create.nfc.tabs.read" })).toBe(
        tab,
      );
      expect(tab).toHaveAttribute("aria-selected", "true");
      expect(Nfc.startScanSession).toHaveBeenCalledTimes(1);
      expect(Nfc.stopScanSession).toHaveBeenCalledTimes(stopCount);
      expect(Nfc.addListener).toHaveBeenCalledTimes(listenerCount);
    }
    await user.click(cancel);
    await screen.findByRole("button", { name: "create.nfc.readTab.scanTag" });
    expect(vi.mocked(Nfc.stopScanSession).mock.calls.length).toBeGreaterThan(
      stopCount,
    );
    await user.click(
      screen.getByRole("tab", { name: "create.nfc.tabs.tools" }),
    );
    const tools = screen.getByRole("tab", { name: "create.nfc.tabs.tools" });
    await resize(390);
    expect(tools).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "create.nfc.tabs.tools" })).toBe(
      tools,
    );
  });

  it("retains new-deck draft and pending creation through resize", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    let finish!: (value: Deck) => void;
    vi.mocked(CoreAPI.deckNew).mockReturnValue(
      new Promise<Deck>((resolve) => {
        finish = resolve;
      }),
    );
    const { router } = await renderCreate("/create/decks/new");
    const heading = await screen.findByRole("heading", { name: "decks.new" });
    expect(
      within(pageScroll(heading)).getByRole("link", {
        name: "create.title",
        hidden: true,
      }),
    ).toHaveAttribute("href", "/create");
    const name = screen.getByRole("textbox", { name: "decks.name" });
    await user.type(name, "Desk collection");
    const description = screen.getByRole("textbox", {
      name: "decks.description",
    });
    await user.type(description, "Weekend games");
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(screen.getByRole("textbox", { name: "decks.name" })).toBe(name);
      expect(name).toHaveValue("Desk collection");
      expect(screen.getByRole("textbox", { name: "decks.description" })).toBe(
        description,
      );
      expect(description).toHaveValue("Weekend games");
      expect(description).toHaveFocus();
    }
    const save = screen.getByRole("button", { name: "decks.create" });
    await user.click(save);
    await waitFor(() => expect(CoreAPI.deckNew).toHaveBeenCalledTimes(1));
    expect(CoreAPI.deckNew).toHaveBeenCalledWith({
      name: "Desk collection",
      description: "Weekend games",
    });
    for (const width of [390, 820, 1440]) {
      await resize(width);
      expect(screen.getByRole("button", { name: "decks.create" })).toBe(save);
      expect(save).toBeDisabled();
      expect(CoreAPI.deckNew).toHaveBeenCalledTimes(1);
    }
    await act(() => finish(deck));
    await screen.findByRole("heading", { name: "Desk collection" });
    expect(router.state.location.pathname).toBe(
      `/library/decks/${deck.deckId}`,
    );
  });

  it("keeps shared deck editor parent rooted in Library", async () => {
    const resize = responsiveWindow(1440);
    await renderCreate("/library/decks/new");
    const heading = await screen.findByRole("heading", { name: "decks.new" });
    const parent = within(pageScroll(heading)).getByRole("link", {
      name: "library.title",
      hidden: true,
    });
    expect(parent).toHaveAttribute("href", "/library");
    await resize(390);
    await resize(1440);
    expect(
      within(pageScroll(heading)).getByRole("link", {
        name: "library.title",
        hidden: true,
      }),
    ).toBe(parent);
  });
});
