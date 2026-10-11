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
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@/test-utils";
import { RootLayout } from "@/routes/__root";
import { CustomText } from "@/routes/create.custom";
import { DeckDetails } from "@/routes/library.decks.$deckId";
import { CoreAPI } from "@/lib/coreApi";
import type { Deck, SearchResultsResponse } from "@/lib/models";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";
import * as libraryImages from "@/lib/libraryImages";

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

async function renderDialogs(path = "/create/custom") {
  const root = createRootRoute({ component: RootLayout });
  const custom = createRoute({
    getParentRoute: () => root,
    path: "/create/custom",
    component: CustomText,
  });
  const details = createRoute({
    getParentRoute: () => root,
    path: "/library/decks/$deckId",
    component: DeckDetails,
  });
  const router = createRouter({
    routeTree: root.addChildren([custom, details]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  return { ...render(<RouterProvider router={router} />), router };
}

function scriptEditor() {
  return screen.getByRole("textbox", {
    name: "create.custom.textareaLabel",
  }) as HTMLTextAreaElement;
}

function startSheetDrag(target: HTMLElement) {
  fireEvent.touchStart(target, {
    touches: [{ clientX: 100, clientY: 20 }],
  });
  fireEvent.touchMove(target, {
    touches: [{ clientX: 100, clientY: 180 }],
  });
}
function endSheetDrag(target: HTMLElement) {
  fireEvent.touchEnd(target, {
    touches: [],
    changedTouches: [{ clientX: 100, clientY: 180 }],
  });
}

// DOM geometry is controlled here for gesture thresholds, not rendered layout proof.
function dialogHeight(dialog: HTMLElement) {
  vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    right: 390,
    bottom: 320,
    left: 0,
    width: 390,
    height: 320,
    toJSON: () => ({}),
  });
}

describe("Adaptive dialogs", () => {
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
    vi.spyOn(libraryImages, "requestLibraryImage").mockResolvedValue(null);
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({ systems: [system] });
    vi.spyOn(CoreAPI, "mediaTags").mockResolvedValue({
      tags: [{ type: "genre", tag: "Platformer" }],
    });
    vi.spyOn(CoreAPI, "mediaSearch").mockResolvedValue({
      results: [game],
      total: 1,
    });
    vi.spyOn(CoreAPI, "mediaMeta").mockResolvedValue({
      media: {
        path: game.path,
        parentDir: "NES",
        isMissing: false,
        tags: [],
        properties: {},
        title: {
          slug: "mario",
          name: game.name,
          slugLength: 5,
          slugWordCount: 1,
          system,
          tags: [],
          properties: {},
        },
      },
    });
    vi.spyOn(CoreAPI, "readers").mockResolvedValue({ readers: [] });
    vi.spyOn(CoreAPI, "run").mockResolvedValue();
    vi.spyOn(CoreAPI, "deckGet").mockResolvedValue(deck);
    vi.spyOn(CoreAPI, "deckUpdate").mockResolvedValue(deck);
  });
  afterEach(() => vi.restoreAllMocks());

  it("should preserve command chooser focus and insert at saved editor cursor after resizing", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    const { baseElement } = await renderDialogs();
    const editor = scriptEditor();
    await user.type(editor, "A|B");
    editor.setSelectionRange(1, 1);
    fireEvent.select(editor);
    await user.click(
      screen.getByRole("button", { name: "create.custom.insertCommand" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "create.custom.commandsTitle",
    });
    const command = within(dialog).getByRole("button", { name: "stop" });
    await act(() => command.focus());
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(
        screen.getByRole("dialog", { name: "create.custom.commandsTitle" }),
      ).toBe(dialog);
      expect(within(dialog).getByRole("button", { name: "stop" })).toBe(
        command,
      );
      expect(command).toHaveFocus();
      expect(dialog.style.transform).toBe(
        width >= 760 ? "translate3d(-50%, -50%, 0)" : "translate3d(0, 0, 0)",
      );
      expect(dialog.style.transition).toBe(
        width >= 760 ? "none" : "transform 0.2s ease-in-out",
      );
      expect(editor).toHaveValue("A|B");
    }
    expect(await findA11yViolations(baseElement)).toEqual([]);
    await user.click(command);
    await waitFor(() => expect(editor).toHaveFocus());
    expect(editor).toHaveValue("A**stop|B");
    expect(editor.selectionStart).toBe("A**stop".length);
    expect(editor.selectionEnd).toBe(editor.selectionStart);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(dialog.style.transform).toBe("translate3d(-50%, -50%, 0)");
    expect(dialog.style.transition).toBe("none");
    expect(dialog.style.visibility).toBe("hidden");
    expect(CoreAPI.run).not.toHaveBeenCalled();
  });

  it("should cancel an active phone drag on widening without closing or changing draft", async () => {
    const resize = responsiveWindow(390);
    const user = userEvent.setup();
    const { router } = await renderDialogs();
    const editor = scriptEditor();
    await user.type(editor, "A|B");
    const trigger = screen.getByRole("button", {
      name: "create.custom.insertCommand",
    });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", {
      name: "create.custom.commandsTitle",
    });
    const heading = within(dialog).getByRole("heading", {
      name: "create.custom.commandsTitle",
    });
    dialogHeight(dialog);
    startSheetDrag(heading);
    await resize(820);
    endSheetDrag(heading);
    expect(
      screen.getByRole("dialog", { name: "create.custom.commandsTitle" }),
    ).toBe(dialog);
    startSheetDrag(heading);
    endSheetDrag(heading);
    expect(
      screen.getByRole("dialog", { name: "create.custom.commandsTitle" }),
    ).toBe(dialog);
    expect(editor).toHaveValue("A|B");
    expect(router.state.location.pathname).toBe("/create/custom");
    await resize(390);
    startSheetDrag(heading);
    endSheetDrag(heading);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(editor).toHaveValue("A|B");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("should retain confirmation actions through resize and dismiss only dialog with Escape", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    const { router } = await renderDialogs();
    const editor = scriptEditor();
    await user.type(editor, "Keep this draft");
    const trigger = screen.getByRole("button", { name: "create.custom.clear" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", {
      name: "create.custom.clearConfirmTitle",
    });
    const cancel = within(dialog).getByRole("button", { name: "nav.cancel" });
    await act(() => cancel.focus());
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(
        screen.getByRole("dialog", { name: "create.custom.clearConfirmTitle" }),
      ).toBe(dialog);
      expect(cancel).toHaveFocus();
      expect(editor).toHaveValue("Keep this draft");
    }
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/create/custom");
    expect(editor).toHaveValue("Keep this draft");
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    await user.click(
      within(
        screen.getByRole("dialog", { name: "create.custom.clearConfirmTitle" }),
      ).getByRole("button", { name: "create.custom.clear" }),
    );
    expect(editor).toHaveValue("");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("should preserve filters, pending search and selected detail through nested dialog resizing", async () => {
    const resize = responsiveWindow(390);
    const user = userEvent.setup();
    let finishSearch!: (response: SearchResultsResponse) => void;
    vi.mocked(CoreAPI.mediaSearch).mockReturnValue(
      new Promise((resolve) => {
        finishSearch = resolve;
      }),
    );
    await renderDialogs();
    const editor = scriptEditor();
    await user.type(editor, "A|B");
    editor.setSelectionRange(1, 1);
    fireEvent.select(editor);
    await user.click(
      screen.getByRole("button", { name: "create.custom.insertMedia" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "create.search.title",
    });
    const query = within(dialog).getByRole("searchbox", {
      name: "create.search.gameInput",
    }) as HTMLInputElement;
    await user.type(query, "Mario");
    const systems = within(dialog).getByRole("combobox", {
      name: "create.search.systemInput",
    });
    await user.selectOptions(systems, "nes");
    await user.click(
      within(dialog).getByRole("button", { name: "create.search.tagsInput" }),
    );
    const tags = await screen.findByRole("dialog", {
      name: "create.search.selectTags",
    });
    await user.type(
      within(tags).getByRole("searchbox", { name: "tagSelector.searchTags" }),
      "Platformer",
    );
    const tag = await within(tags).findByRole("checkbox", {
      name: /Platformer/,
    });
    await user.click(tag);
    await resize(1440);
    expect(
      screen.getByRole("dialog", { name: "create.search.selectTags" }),
    ).toBe(tags);
    expect(tag).toBeChecked();
    expect(tag).toHaveFocus();
    await user.click(
      within(tags).getByRole("button", { name: "tagSelector.applyCount" }),
    );
    expect(screen.getByRole("dialog", { name: "create.search.title" })).toBe(
      dialog,
    );
    const search = within(dialog).getByRole("button", {
      name: "create.search.searchButton",
    });
    await user.click(search);
    await waitFor(() => expect(CoreAPI.mediaSearch).toHaveBeenCalledTimes(1));
    await user.click(query);
    query.setSelectionRange(1, 3);
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(screen.getByRole("dialog", { name: "create.search.title" })).toBe(
        dialog,
      );
      expect(query).toHaveValue("Mario");
      expect(query).toHaveFocus();
      expect(query.selectionStart).toBe(1);
      expect(query.selectionEnd).toBe(3);
      expect(systems).toHaveValue("nes");
      expect(search).toBeDisabled();
      expect(CoreAPI.mediaSearch).toHaveBeenCalledTimes(1);
      expect(vi.mocked(CoreAPI.mediaSearch).mock.calls[0]?.[1]?.aborted).toBe(
        false,
      );
    }
    await act(() =>
      useStatusStore.setState({
        safeInsets: {
          top: "44px",
          bottom: "280px",
          left: "52px",
          right: "16px",
        },
      }),
    );
    expect(screen.getByRole("dialog", { name: "create.search.title" })).toBe(
      dialog,
    );
    expect(query).toHaveFocus();
    expect(query).toHaveValue("Mario");
    expect(vi.mocked(CoreAPI.mediaSearch).mock.calls[0]?.[1]?.aborted).toBe(
      false,
    );
    expect(CoreAPI.mediaSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "Mario",
        systems: ["nes"],
        tags: ["genre:Platformer"],
      }),
      expect.any(AbortSignal),
    );
    await act(() => finishSearch({ results: [game], total: 1 }));
    const result = await within(dialog).findByRole("button", {
      name: /Super Mario Bros\./,
    });
    await user.click(result);
    const details = await screen.findByRole("dialog", { name: game.name });
    const insert = within(details).getByRole("button", {
      name: "create.custom.insert",
    });
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(screen.getByRole("dialog", { name: game.name })).toBe(details);
      expect(
        within(details).getByRole("button", { name: "create.custom.insert" }),
      ).toBe(insert);
      expect(editor).toHaveValue("A|B");
    }
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "create.search.title" })).toBe(
      dialog,
    );
    expect(query).toHaveValue("Mario");
    expect(systems).toHaveValue("nes");
    expect(
      within(dialog).getByRole("button", { name: /Super Mario Bros\./ }),
    ).toBe(result);
    await user.click(result);
    await user.click(
      within(screen.getByRole("dialog", { name: game.name })).getByRole(
        "button",
        { name: "create.custom.insert" },
      ),
    );
    expect(editor).toHaveValue("ANES/Mario.nes|B");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(CoreAPI.mediaSearch).toHaveBeenCalledTimes(1);
    expect(CoreAPI.run).not.toHaveBeenCalled();
  });

  it("should add selected media once while pending deck save survives picker resizing", async () => {
    const resize = responsiveWindow(1440);
    const user = userEvent.setup();
    let finishSave!: (response: Deck) => void;
    vi.mocked(CoreAPI.deckUpdate).mockReturnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    await renderDialogs(`/library/decks/${deck.deckId}`);
    await user.click(
      await screen.findByRole("button", { name: "decks.addMedia" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "create.search.title",
    });
    const query = within(dialog).getByRole("searchbox", {
      name: "create.search.gameInput",
    });
    await user.type(query, "Mario");
    await user.click(
      within(dialog).getByRole("button", {
        name: "create.search.searchButton",
      }),
    );
    const result = await within(dialog).findByRole("button", {
      name: /Super Mario Bros\./,
    });
    for (const width of [820, 390, 1440]) {
      await resize(width);
      expect(screen.getByRole("dialog", { name: "create.search.title" })).toBe(
        dialog,
      );
      expect(query).toHaveValue("Mario");
      expect(
        within(dialog).getByRole("button", { name: /Super Mario Bros\./ }),
      ).toBe(result);
    }
    await user.click(result);
    await waitFor(() => expect(CoreAPI.deckUpdate).toHaveBeenCalledTimes(1));
    expect(CoreAPI.deckUpdate).toHaveBeenCalledWith({
      deckId: deck.deckId,
      addItems: [{ kind: "script", name: game.name, zapscript: game.path }],
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    for (const width of [390, 820, 1440]) {
      await resize(width);
      expect(
        screen.getByRole("button", { name: "decks.addMedia" }),
      ).toBeDisabled();
      expect(CoreAPI.deckUpdate).toHaveBeenCalledTimes(1);
    }
    const updated: Deck = {
      ...deck,
      itemCount: 1,
      items: [
        {
          id: 1,
          position: 0,
          kind: "script",
          name: game.name,
          zapscript: game.path,
        },
      ],
    };
    vi.mocked(CoreAPI.deckGet).mockResolvedValue(updated);
    await act(() => finishSave(updated));
    expect(
      await screen.findByRole("button", { name: /Super Mario Bros\./ }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "decks.addMedia" }),
    ).toBeEnabled();
    expect(CoreAPI.deckUpdate).toHaveBeenCalledTimes(1);
  });
});
