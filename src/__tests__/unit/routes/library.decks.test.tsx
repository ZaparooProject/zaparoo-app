import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import { Capacitor } from "@capacitor/core";
import { Clipboard } from "@capacitor/clipboard";
import { render, screen, waitFor, within } from "@/test-utils";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";
import { CoreAPI, CoreApiError } from "@/lib/coreApi";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import type { Deck } from "@/lib/models";
import { DeckDetails } from "@/routes/library.decks.$deckId";
import { NewDeck } from "@/routes/library.decks.new";
import { AddDeckItem } from "@/routes/library.decks.$deckId_.add";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: object) => ({
    ...options,
    useParams: () => ({ deckId: "0k3v9x2rq7bm" }),
  }),
  useNavigate: () => navigate,
}));
vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: () => undefined,
}));

const deck: Deck = {
  deckId: "0k3v9x2rq7bm",
  name: "Weekend",
  description: "Games",
  owned: true,
  locked: false,
  itemCount: 2,
  createdAt: 1,
  updatedAt: 2,
  items: [
    { id: 7, position: 1, kind: "card", name: "", cardId: "CARD0001" },
    {
      id: 8,
      position: 2,
      kind: "script",
      name: "Game",
      zapscript: "**launch.title:NES/Game",
    },
  ],
};

describe("deck routes", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(false);
    navigate.mockClear();
    CoreAPI.reset();
    await seedActiveDevice({ recordId: "device-a" });
    usePreferencesStore.setState({
      nfcAvailable: false,
      accessibleLists: false,
      showFilenames: false,
    });
    useStatusStore.setState({
      connected: true,
      connectionState: ConnectionState.CONNECTED,
      coreVersion: "2.18.0",
      coreVersionPending: false,
    });
    vi.spyOn(CoreAPI, "deckGet").mockResolvedValue(deck);
    vi.spyOn(CoreAPI, "mediaLookup").mockResolvedValue({ match: null });
    vi.spyOn(CoreAPI, "hasWriteCapableReader").mockResolvedValue(false);
    vi.spyOn(CoreAPI, "decks").mockResolvedValue({ decks: [deck] });
  });

  it("creates an empty deck and opens its detail", async () => {
    const create = vi
      .spyOn(CoreAPI, "deckNew")
      .mockResolvedValue({ ...deck, itemCount: 0, items: [] });
    render(<NewDeck />);
    await userEvent
      .setup()
      .type(screen.getByRole("textbox", { name: "decks.name" }), "Weekend");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "decks.create" }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ name: "Weekend", description: "" }),
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: "/library/decks/$deckId",
        params: { deckId: deck.deckId },
        replace: true,
      }),
    );
  });

  it("returns to Create without resetting its scroll", async () => {
    render(<NewDeck backTo="/create" />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "nav.back" }));
    expect(navigate).toHaveBeenCalledWith({
      to: "/create",
      resetScroll: false,
    });
  });

  it("shows a missing deck without retrying Core's answer", async () => {
    const get = vi
      .spyOn(CoreAPI, "deckGet")
      .mockRejectedValue(new CoreApiError("invalid deck id", 1));
    render(<DeckDetails />);
    expect(await screen.findByText("decks.loadError")).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("retries a deck once when the connection drops mid-request", async () => {
    const get = vi
      .spyOn(CoreAPI, "deckGet")
      .mockRejectedValueOnce(new Error("Request cancelled: connection reset"))
      .mockResolvedValue(deck);
    render(<DeckDetails />);
    expect(
      await screen.findByText("CARD0001", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("keeps an empty deck writable but not playable", async () => {
    vi.spyOn(CoreAPI, "deckGet").mockResolvedValue({
      ...deck,
      itemCount: 0,
      items: [],
    });
    vi.spyOn(CoreAPI, "hasWriteCapableReader").mockResolvedValue(true);
    render(<DeckDetails />);
    const actions = await screen.findByRole("group", { name: "decks.actions" });
    expect(await screen.findByText("decks.noItems")).toBeInTheDocument();
    expect(
      within(actions).getByRole("button", { name: "decks.play" }),
    ).toBeDisabled();
    expect(
      within(actions).getByRole("button", { name: "decks.open" }),
    ).toBeDisabled();
    await waitFor(() =>
      expect(
        within(actions).getByRole("button", { name: "library.writeAction" }),
      ).toBeEnabled(),
    );
  });

  it("returns from a deck without resetting Collections scroll", async () => {
    render(<DeckDetails />);
    await screen.findByText("CARD0001");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "nav.back" }));
    expect(navigate).toHaveBeenCalledWith({
      to: "/library",
      resetScroll: false,
    });
  });

  it("returns from new deck without resetting Collections scroll", async () => {
    render(<NewDeck />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "nav.back" }));
    expect(navigate).toHaveBeenCalledWith({
      to: "/library",
      resetScroll: false,
    });
  });

  it("renders Markdown descriptions and omits technical tag warnings", async () => {
    vi.spyOn(CoreAPI, "deckGet").mockResolvedValue({
      ...deck,
      description:
        "**Weekend picks** and [more](https://example.com)\n\n- Game one",
    });
    render(<DeckDetails />);
    expect(await screen.findByText("Weekend picks")).toContainHTML("strong");
    expect(screen.getByRole("link", { name: "more" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
    expect(screen.getByText("Game one")).toBeInTheDocument();
    expect(
      screen.queryByText("decks.writeLocalWarning"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "decks.description" }),
    ).not.toBeInTheDocument();
  });

  it("places the item count below Add media for editable decks", async () => {
    render(<DeckDetails />);
    const add = await screen.findByRole("button", { name: "decks.addMedia" });
    const count = screen.getByText("decks.items");
    expect(add.compareDocumentPosition(count)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("shows Open, Play, Write, Share in the deck action rail and runs distinct commands", async () => {
    const open = vi.spyOn(CoreAPI, "deckOpen").mockResolvedValue();
    const run = vi.spyOn(CoreAPI, "run").mockResolvedValue();
    render(<DeckDetails />);
    const actions = await screen.findByRole("group", { name: "decks.actions" });
    expect(
      within(actions)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "decks.open",
      "decks.play",
      "library.writeAction",
      "decks.share",
    ]);
    await userEvent
      .setup()
      .click(within(actions).getByRole("button", { name: "decks.open" }));
    await waitFor(() => expect(open).toHaveBeenCalledWith(deck.deckId));
    expect(run).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .click(within(actions).getByRole("button", { name: "decks.play" }));
    await waitFor(() =>
      expect(run).toHaveBeenCalledWith({
        text: `**playlist.play:deck://${deck.deckId}`,
      }),
    );
  });

  it("shows and copies a share link even when a deck has not been synced", async () => {
    const user = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<DeckDetails />);
    const actions = await screen.findByRole("group", { name: "decks.actions" });
    await user.click(
      within(actions).getByRole("button", { name: "decks.share" }),
    );
    const share = screen.getByRole("dialog", { name: "decks.share" });
    const url = `https://zpr.au/d$${deck.deckId}`;
    expect(within(share).getByText(url)).toBeInTheDocument();
    await user.click(
      within(share).getByRole("button", { name: "decks.copyLink" }),
    );
    expect(copy).toHaveBeenCalledWith(url);
  });

  it("copies the deck link with Capacitor Clipboard on native platforms", async () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    const copy = vi.spyOn(Clipboard, "write").mockResolvedValue();
    render(<DeckDetails />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "decks.share" }),
    );
    await user.click(
      within(screen.getByRole("dialog", { name: "decks.share" })).getByRole(
        "button",
        { name: "decks.copyLink" },
      ),
    );
    expect(copy).toHaveBeenCalledWith({
      string: `https://zpr.au/d$${deck.deckId}`,
    });
  });

  it("reports clipboard failures instead of claiming the link was copied", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("Clipboard denied"),
    );
    const success = vi.spyOn(toast, "success");
    const error = vi.spyOn(toast, "error");
    render(<DeckDetails />);
    await user.click(
      await screen.findByRole("button", { name: "decks.share" }),
    );
    await user.click(
      within(screen.getByRole("dialog", { name: "decks.share" })).getByRole(
        "button",
        { name: "decks.copyLink" },
      ),
    );
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith("decks.copyLinkError"),
    );
    expect(success).not.toHaveBeenCalledWith("decks.linkCopied");
  });

  it("writes a Play deck tag so scanning starts playback", async () => {
    usePreferencesStore.setState({ nfcAvailable: true });
    const write = vi.spyOn(CoreAPI, "write").mockResolvedValue();
    render(<DeckDetails />);
    const actions = await screen.findByRole("group", { name: "decks.actions" });
    await userEvent
      .setup()
      .click(
        within(actions).getByRole("button", { name: "library.writeAction" }),
      );
    await waitFor(() =>
      expect(write).toHaveBeenCalledWith(
        { text: `**playlist.play:deck://${deck.deckId}` },
        expect.any(AbortSignal),
      ),
    );
  });

  it("animates the item sheet and plays ID-only cards through their zap links", async () => {
    const run = vi.spyOn(CoreAPI, "run").mockResolvedValue();
    render(<DeckDetails />);
    await screen.findByRole("button", { name: /CARD0001/ });
    const sheet = screen
      .getByText("decks.unnamedItem")
      .closest('[role="dialog"]');
    expect(sheet).not.toBeNull();
    expect(sheet).toHaveAttribute("aria-hidden", "true");
    expect(sheet).toHaveStyle({ transform: "translate3d(0, 100%, 0)" });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /CARD0001/ }));
    const details = screen.getByRole("dialog", { name: "CARD0001" });
    expect(details).toBe(sheet);
    expect(details).toHaveStyle({ transform: "translate3d(0, 0, 0)" });
    expect(
      within(details).getByText("https://zpr.au/c$CARD0001"),
    ).toBeInTheDocument();
    await userEvent
      .setup()
      .click(within(details).getByRole("button", { name: "decks.play" }));
    await waitFor(() =>
      expect(run).toHaveBeenCalledWith({ text: "https://zpr.au/c$CARD0001" }),
    );
    expect(
      within(details).getByRole("button", { name: "library.writeAction" }),
    ).toBeDisabled();
    await userEvent
      .setup()
      .click(within(details).getAllByRole("button", { name: "nav.close" })[0]!);
    expect(sheet).toHaveAttribute("aria-hidden", "true");
    expect(sheet).toHaveStyle({ transform: "translate3d(0, 100%, 0)" });
  });

  it("shows rendered card art and exact playable ZapScript without extra metadata", async () => {
    vi.spyOn(CoreAPI, "deckGet").mockResolvedValue({
      ...deck,
      items: [
        {
          id: 7,
          position: 1,
          kind: "card",
          name: "Metroid card",
          cardId: "CARD0001",
          scripts: [{ name: "Play", zapscript: "**launch.system:SNES" }],
          metadata: {
            set: { name: "Favorites" },
            media: { title: "Super Metroid" },
            tags: ["SNES"],
            number: 3,
            image_url: "https://images.example/card.png",
            rendered_url: "https://images.example/rendered-card.png",
          },
        },
      ],
    });
    const run = vi.spyOn(CoreAPI, "run").mockResolvedValue();
    render(<DeckDetails />);
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: /Metroid card/ }));
    const details = screen.getByRole("dialog", { name: "Metroid card" });
    expect(
      within(details).getByText("**launch.system:SNES"),
    ).toBeInTheDocument();
    expect(within(details).queryByText("Favorites")).not.toBeInTheDocument();
    expect(
      within(details).queryByText("Super Metroid"),
    ).not.toBeInTheDocument();
    expect(within(details).queryByText("SNES")).not.toBeInTheDocument();
    expect(
      within(details).getByRole("img", { name: "library.imageAlt" }),
    ).toHaveAttribute("src", "https://images.example/rendered-card.png");
    await userEvent
      .setup()
      .click(within(details).getByRole("button", { name: "decks.play" }));
    await waitFor(() =>
      expect(run).toHaveBeenCalledWith({ text: "https://zpr.au/c$CARD0001" }),
    );
  });

  it("does not substitute an individual image when a rendered card image is unavailable", async () => {
    vi.spyOn(CoreAPI, "deckGet").mockResolvedValue({
      ...deck,
      items: [
        {
          id: 7,
          position: 1,
          kind: "card",
          name: "Card",
          cardId: "CARD0001",
          scripts: [{ name: "Play", zapscript: "**launch.system:NES" }],
          metadata: { image_url: "https://images.example/individual.png" },
        },
      ],
    });
    render(<DeckDetails />);
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: /Card decks.card/ }));
    expect(
      within(screen.getByRole("dialog", { name: "Card" })).queryByRole("img"),
    ).not.toBeInTheDocument();
  });

  it("shows cached playlist ZapScript but plays multi-script cards through their zap links", async () => {
    vi.spyOn(CoreAPI, "deckGet").mockResolvedValue({
      ...deck,
      items: [
        {
          id: 7,
          position: 1,
          kind: "card",
          name: "Card",
          cardId: "CARD0001",
          scripts: [
            { name: "One", zapscript: "**launch.system:NES" },
            { name: "Two", zapscript: "**launch.system:SNES" },
          ],
        },
      ],
    });
    const run = vi.spyOn(CoreAPI, "run").mockResolvedValue();
    render(<DeckDetails />);
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: /Card decks.card/ }));
    const details = screen.getByRole("dialog", { name: "Card" });
    const script =
      '**playlist.open:{"id":"deck://0k3v9x2rq7bm/CARD0001","name":"Card","items":[{"name":"One","zapscript":"**launch.system:NES"},{"name":"Two","zapscript":"**launch.system:SNES"}]}';
    expect(within(details).getByText(script)).toBeInTheDocument();
    await userEvent
      .setup()
      .click(within(details).getByRole("button", { name: "decks.play" }));
    await waitFor(() =>
      expect(run).toHaveBeenCalledWith({ text: "https://zpr.au/c$CARD0001" }),
    );
  });

  it("shows and plays the stored ZapScript even when a local media anchor exists", async () => {
    vi.spyOn(CoreAPI, "deckGet").mockResolvedValue({
      ...deck,
      items: [
        {
          id: 8,
          position: 1,
          kind: "script",
          name: "Game",
          zapscript: "**launch.title:NES/Game",
          media: {
            system: "NES",
            path: "/games/NES/Game.nes",
            name: "Game",
            available: true,
          },
        },
      ],
    });
    const meta = vi.spyOn(CoreAPI, "mediaMeta").mockResolvedValue({
      media: {
        path: "/games/NES/Game.nes",
        parentDir: "/games/NES",
        isMissing: false,
        tags: [],
        properties: {},
        title: {
          slug: "game",
          name: "Game",
          slugLength: 4,
          slugWordCount: 1,
          system: { id: "NES", name: "NES" },
          tags: [],
          properties: {
            "property:description": { text: "A good game", contentType: "" },
          },
        },
      },
    });
    vi.spyOn(CoreAPI, "mediaImage").mockRejectedValue(new Error("no artwork"));
    const run = vi.spyOn(CoreAPI, "run").mockResolvedValue();
    render(<DeckDetails />);
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: /Game NES/ }));
    const details = screen.getByRole("dialog", { name: "Game" });
    expect(
      within(details).getByText("**launch.title:NES/Game"),
    ).toBeInTheDocument();
    expect(within(details).queryByText("A good game")).not.toBeInTheDocument();
    expect(meta).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .click(within(details).getByRole("button", { name: "decks.play" }));
    await waitFor(() =>
      expect(run).toHaveBeenCalledWith({
        text: "**launch.title:NES/Game",
      }),
    );
  });

  it("reorders from the mobile grip with keyboard controls without opening item details", async () => {
    const measure = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const row = this.closest("li");
        if (row?.parentElement) {
          const index = Array.from(row.parentElement.children).indexOf(row);
          return new DOMRect(0, index * 64, 320, 64);
        }
        if (
          (this.style.position === "fixed" && this.style.zIndex === "40") ||
          (this.getAttribute("aria-hidden") === "true" &&
            this.classList.contains("bg-background"))
        ) {
          return new DOMRect(0, 0, 320, 64);
        }
        return measure.call(this);
      },
    );
    const update = vi.spyOn(CoreAPI, "deckUpdate").mockResolvedValue({
      ...deck,
      items: [deck.items![1]!, deck.items![0]!],
    });
    render(<DeckDetails />);
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "decks.edit" }));
    const grip = (
      await screen.findAllByRole("button", {
        name: "decks.reorderItem",
      })
    )[0]!;
    grip.focus();
    const user = userEvent.setup();
    await user.keyboard("[Space]");
    expect(grip).toHaveAttribute("aria-pressed", "true");
    await user.keyboard("[ArrowDown]");
    await waitFor(() =>
      expect(
        document.querySelector('[aria-live="assertive"]')?.textContent,
      ).toBe("decks.dragOver"),
    );
    await user.keyboard("[Space]");
    expect(update).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole("button", { name: "save" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        deckId: deck.deckId,
        name: deck.name,
        description: deck.description,
        items: [{ id: 8 }, { id: 7 }],
      }),
    );
    expect(
      screen.queryByRole("dialog", { name: "CARD0001" }),
    ).not.toBeInTheDocument();
  });

  it("shows reorder controls only in the existing edit mode", async () => {
    render(<DeckDetails />);
    const user = userEvent.setup();
    const edit = await screen.findByRole("button", { name: "decks.edit" });
    expect(
      screen.queryByRole("button", { name: "decks.reorderItem" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "decks.moveDown" }),
    ).not.toBeInTheDocument();
    await user.click(edit);
    expect(
      screen.queryByRole("group", { name: "decks.actions" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("decks.items")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Game decks.script/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByText("Game"));
    expect(
      screen.queryByRole("dialog", { name: "Game" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "decks.reorderItem" }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: "decks.moveDown" }),
    ).toHaveLength(2);
    await user.click(screen.getAllByRole("button", { name: "nav.cancel" })[1]!);
    expect(
      screen.getByRole("group", { name: "decks.actions" }),
    ).toBeInTheDocument();
    expect(screen.getByText("decks.items")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Game decks.script/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "decks.reorderItem" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "decks.moveDown" }),
    ).not.toBeInTheDocument();
  });

  it("retains draft order after a failed Save so the user can retry or cancel", async () => {
    let rejectUpdate!: (reason?: unknown) => void;
    const pending = new Promise<Deck>((_resolve, reject) => {
      rejectUpdate = reject;
    });
    vi.spyOn(CoreAPI, "deckUpdate").mockReturnValue(pending);
    const error = vi.spyOn(toast, "error");
    render(<DeckDetails />);
    await screen.findByText("CARD0001");
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "decks.edit" }));
    await userEvent
      .setup()
      .click(screen.getAllByRole("button", { name: "decks.moveDown" })[0]!);
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Game");
    await userEvent.setup().click(screen.getByRole("button", { name: "save" }));
    expect(
      screen.getAllByRole("button", { name: "nav.cancel" })[0],
    ).toBeDisabled();
    rejectUpdate(new Error("offline"));
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith("decks.updateError"),
    );
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Game");
    expect(
      screen.getByRole("textbox", { name: "decks.name" }),
    ).toBeInTheDocument();
  });

  it("keeps keyboard focus on the moved item when its arrow becomes unavailable", async () => {
    render(<DeckDetails />);
    await screen.findByText("CARD0001");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "decks.edit" }));
    await user.click(
      screen.getAllByRole("button", { name: "decks.moveDown" })[0]!,
    );
    expect(screen.getAllByRole("listitem")[1]).toHaveTextContent("CARD0001");
    expect(
      screen.getAllByRole("button", { name: "decks.moveUp" })[1],
    ).toHaveFocus();
  });

  it.each([0, 1])(
    "discards name and order drafts with cancel control %i",
    async (cancelIndex) => {
      const update = vi.spyOn(CoreAPI, "deckUpdate");
      render(<DeckDetails />);
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole("button", { name: "decks.edit" }),
      );
      expect(
        screen.queryByRole("button", { name: "decks.addMedia" }),
      ).not.toBeInTheDocument();
      const name = screen.getByRole("textbox", { name: "decks.name" });
      await user.clear(name);
      await user.type(name, "Unsaved name");
      await user.click(
        screen.getAllByRole("button", { name: "decks.moveDown" })[0]!,
      );
      expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Game");
      expect(update).not.toHaveBeenCalled();
      await user.click(
        screen.getAllByRole("button", { name: "nav.cancel" })[cancelIndex]!,
      );
      expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("CARD0001");
      expect(
        screen.getByRole("button", { name: "decks.addMedia" }),
      ).toBeInTheDocument();
      expect(update).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "decks.edit" }));
      expect(screen.getByRole("textbox", { name: "decks.name" })).toHaveValue(
        deck.name,
      );
    },
  );

  it("shows ID-only cards and reorders by stable item IDs", async () => {
    const update = vi.spyOn(CoreAPI, "deckUpdate").mockResolvedValue({
      ...deck,
      items: [deck.items![1]!, deck.items![0]!],
    });
    render(<DeckDetails />);
    expect(await screen.findByText("CARD0001")).toBeInTheDocument();
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "decks.edit" }));
    await userEvent
      .setup()
      .click(screen.getAllByRole("button", { name: "decks.moveDown" })[0]!);
    expect(update).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole("button", { name: "save" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        deckId: deck.deckId,
        name: deck.name,
        description: deck.description,
        items: [{ id: 8 }, { id: 7 }],
      }),
    );
  });

  it("confirms removal from item details before changing an owned deck", async () => {
    const update = vi
      .spyOn(CoreAPI, "deckUpdate")
      .mockResolvedValue({ ...deck, items: [deck.items![1]!] });
    render(<DeckDetails />);
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: /CARD0001/ }));
    const details = screen.getByRole("dialog", { name: "CARD0001" });
    const actions = within(details).getByRole("group", {
      name: "decks.itemActions",
    });
    await userEvent
      .setup()
      .click(within(actions).getByRole("button", { name: "decks.remove" }));
    expect(update).not.toHaveBeenCalled();
    const confirm = screen.getByRole("dialog", { name: "decks.remove" });
    await userEvent
      .setup()
      .click(within(confirm).getByRole("button", { name: "decks.remove" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        deckId: deck.deckId,
        removeItemIds: [7],
      }),
    );
  });

  it("writes the selected item's exact script instead of the deck Play command", async () => {
    usePreferencesStore.setState({ nfcAvailable: true });
    const write = vi.spyOn(CoreAPI, "write").mockResolvedValue();
    render(<DeckDetails />);
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: /Game decks.script/ }));
    const details = screen.getByRole("dialog", { name: "Game" });
    await userEvent
      .setup()
      .click(
        within(details).getByRole("button", { name: "library.writeAction" }),
      );
    await waitFor(() =>
      expect(write).toHaveBeenCalledWith(
        { text: "**launch.title:NES/Game" },
        expect.any(AbortSignal),
      ),
    );
  });

  it.each([
    {
      showFilenames: false,
      relativePath: "SNES/Metroid.sfc",
      expected: "@SNES/Super Metroid (region:us)",
    },
    {
      showFilenames: true,
      relativePath: "SNES/Metroid.sfc",
      expected: "SNES/Metroid.sfc",
    },
    {
      showFilenames: true,
      relativePath: undefined,
      expected: "/games/SNES/Metroid.sfc",
    },
  ])(
    "quick-adds the selected result value with filename mode $showFilenames: $expected",
    async ({ showFilenames, relativePath, expected }) => {
      usePreferencesStore.setState({ accessibleLists: true, showFilenames });
      useStatusStore.setState((state) => ({
        gamesIndex: { ...state.gamesIndex, exists: true },
      }));
      vi.spyOn(CoreAPI, "mediaSearch").mockResolvedValue({
        results: [
          {
            mediaId: 42,
            system: { id: "SNES", name: "SNES" },
            name: "Super Metroid",
            path: "/games/SNES/Metroid.sfc",
            relativePath,
            zapScript: "@SNES/Super Metroid (region:us)",
            tags: [],
          },
        ],
        total: 1,
        pagination: { nextCursor: null, hasNextPage: false, pageSize: 1 },
      });
      const successToast = vi.spyOn(toast, "success");
      let finishAdd!: (value: Deck) => void;
      const update = vi.spyOn(CoreAPI, "deckUpdate").mockReturnValue(
        new Promise<Deck>((resolve) => {
          finishAdd = resolve;
        }),
      );
      render(<DeckDetails />);
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole("button", { name: "decks.addMedia" }),
      );
      await user.type(
        screen.getByRole("searchbox", { name: "create.search.gameInput" }),
        "metroid",
      );
      await user.click(
        screen.getByRole("button", { name: "create.search.searchButton" }),
      );
      await user.click(
        await screen.findByRole("button", {
          name: /Metroid/,
        }),
      );
      await waitFor(() =>
        expect(update).toHaveBeenCalledWith({
          deckId: deck.deckId,
          addItems: [
            { kind: "script", name: "Super Metroid", zapscript: expected },
          ],
        }),
      );
      expect(
        screen.queryByRole("dialog", { name: "create.search.title" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "decks.addMedia" }),
      ).toBeDisabled();
      const page = screen
        .getByRole("button", { name: "decks.addMedia" })
        .closest('[data-scroll-restoration-id="page-scroll"]')!;
      expect(page).not.toBeNull();
      Object.defineProperty(page, "scrollHeight", {
        configurable: true,
        value: 1600,
      });
      const updatedDeck: Deck = {
        ...deck,
        itemCount: 3,
        items: [
          ...deck.items!,
          {
            id: 9,
            position: 3,
            kind: "script",
            name: "Super Metroid",
            zapscript: expected,
          },
        ],
      };
      vi.mocked(CoreAPI.deckGet).mockResolvedValue(updatedDeck);
      finishAdd(updatedDeck);
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "decks.addMedia" }),
        ).toBeEnabled(),
      );
      expect(screen.getAllByRole("listitem").at(-1)).toHaveTextContent(
        "Super Metroid",
      );
      expect(page.scrollTop).toBe(1600);
      expect(successToast).not.toHaveBeenCalled();
    },
  );

  it("passes selected tag filters from deck media search to Core", async () => {
    useStatusStore.setState((state) => ({
      gamesIndex: { ...state.gamesIndex, exists: true },
    }));
    vi.spyOn(CoreAPI, "mediaTags").mockResolvedValue({
      tags: [{ type: "genre", tag: "Platformer" }],
    });
    const search = vi.spyOn(CoreAPI, "mediaSearch").mockResolvedValue({
      results: [],
      total: 0,
      pagination: { nextCursor: null, hasNextPage: false, pageSize: 0 },
    });
    render(<DeckDetails />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "decks.addMedia" }),
    );
    await user.click(
      screen.getByRole("button", { name: "create.search.tagsInput" }),
    );
    const picker = screen.getByRole("dialog", {
      name: "create.search.selectTags",
    });
    await user.click(
      within(picker).getByRole("button", { name: "tagSelector.expandAll" }),
    );
    await user.click(
      await within(picker).findByRole("checkbox", { name: /Platformer/ }),
    );
    await user.click(
      within(picker).getByRole("button", { name: "tagSelector.apply" }),
    );
    await user.type(
      screen.getByRole("searchbox", { name: "create.search.gameInput" }),
      "mario",
    );
    await user.click(
      screen.getByRole("button", { name: "create.search.searchButton" }),
    );
    await waitFor(() =>
      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "mario",
          systems: [],
          tags: ["genre:Platformer"],
        }),
        expect.any(AbortSignal),
      ),
    );
  });

  it("reopens media search after an add failure so the user can retry", async () => {
    usePreferencesStore.setState({ accessibleLists: true });
    useStatusStore.setState((state) => ({
      gamesIndex: { ...state.gamesIndex, exists: true },
    }));
    vi.spyOn(CoreAPI, "mediaSearch").mockResolvedValue({
      results: [
        {
          mediaId: 42,
          system: { id: "SNES", name: "SNES" },
          name: "Super Metroid",
          path: "/games/SNES/Metroid.sfc",
          tags: [],
        },
      ],
      total: 1,
    });
    const update = vi
      .spyOn(CoreAPI, "deckUpdate")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ ...deck, itemCount: 3 });
    const errorToast = vi.spyOn(toast, "error");
    render(<DeckDetails />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "decks.addMedia" }),
    );
    await user.type(
      screen.getByRole("searchbox", { name: "create.search.gameInput" }),
      "metroid",
    );
    await user.click(
      screen.getByRole("button", { name: "create.search.searchButton" }),
    );
    await user.click(
      await screen.findByRole("button", { name: /Super Metroid/ }),
    );
    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith("decks.addError"),
    );
    expect(
      screen.getByRole("dialog", { name: "create.search.title" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Super Metroid/ }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "create.search.title" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("opens a full page for custom items from the media search sheet", async () => {
    render(<DeckDetails />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "decks.addMedia" }),
    );
    await user.click(
      screen.getByRole("button", { name: "decks.addCustomScript" }),
    );
    expect(navigate).toHaveBeenCalledWith({
      to: "/library/decks/$deckId/add",
      params: { deckId: deck.deckId },
      resetScroll: false,
    });
  });

  it("adds a custom ZapScript from a full page and returns to the deck", async () => {
    const update = vi
      .spyOn(CoreAPI, "deckUpdate")
      .mockResolvedValue({ ...deck, itemCount: 3 });
    render(<AddDeckItem />);
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole("textbox", { name: "decks.itemName" }),
      "Random game",
    );
    await user.type(
      screen.getByRole("textbox", { name: "decks.script" }),
      "**launch.random:SNES",
    );
    await user.click(screen.getByRole("button", { name: "decks.addItem" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        deckId: deck.deckId,
        addItems: [
          {
            kind: "script",
            name: "Random game",
            zapscript: "**launch.random:SNES",
          },
        ],
      }),
    );
    expect(navigate).toHaveBeenCalledWith({
      to: "/library/decks/$deckId",
      params: { deckId: deck.deckId },
      resetScroll: false,
      replace: true,
    });
  });

  it("lets the full-page ZapScript editor open its own search modal", async () => {
    render(<AddDeckItem />);
    const user = userEvent.setup();
    const editor = await screen.findByRole("textbox", { name: "decks.script" });
    expect(editor.closest('[role="dialog"]')).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "create.custom.commandPalette" }),
    );
    await user.click(
      screen.getByRole("button", { name: "create.custom.insertMedia" }),
    );
    expect(
      screen.getByRole("dialog", { name: "create.search.title" }),
    ).toBeInTheDocument();
  });

  it("returns from the custom item page without losing deck scroll", async () => {
    render(<AddDeckItem />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "nav.back" }));
    expect(navigate).toHaveBeenCalledWith({
      to: "/library/decks/$deckId",
      params: { deckId: deck.deckId },
      resetScroll: false,
    });
  });

  it("keeps cached decks read-only on the advanced item page", async () => {
    vi.spyOn(CoreAPI, "deckGet").mockResolvedValue({ ...deck, owned: false });
    render(<AddDeckItem />);
    expect(await screen.findByText("decks.readOnly")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "decks.addItem" }),
    ).not.toBeInTheDocument();
  });

  it("still adds an ID-only card from the custom item page", async () => {
    const update = vi
      .spyOn(CoreAPI, "deckUpdate")
      .mockResolvedValue({ ...deck, itemCount: 3 });
    render(<AddDeckItem />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("radio", { name: "decks.card" }));
    await user.type(
      screen.getByRole("textbox", { name: "decks.cardId" }),
      "CARD0002",
    );
    await user.click(screen.getByRole("button", { name: "decks.addItem" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        deckId: deck.deckId,
        addItems: [{ kind: "card", cardId: "CARD0002" }],
      }),
    );
  });

  it("renames an owned deck and saves its description", async () => {
    const update = vi
      .spyOn(CoreAPI, "deckUpdate")
      .mockResolvedValue({ ...deck, name: "Arcade", description: "Favorites" });
    render(<DeckDetails />);
    const user = userEvent.setup();
    expect(
      await screen.findByRole("button", { name: "decks.edit" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "decks.delete" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "decks.options" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "decks.edit" }));
    expect(
      screen.getByRole("button", { name: "decks.delete" }),
    ).toBeInTheDocument();
    const name = screen.getByRole("textbox", { name: "decks.name" });
    expect(name).toHaveFocus();
    await user.clear(name);
    await user.type(name, "Arcade");
    const description = screen.getByRole("textbox", {
      name: "decks.description",
    });
    await user.clear(description);
    await user.type(description, "Favorites");
    await user.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        deckId: deck.deckId,
        name: "Arcade",
        description: "Favorites",
      }),
    );
  });

  it("deletes an owned deck only from its edit form and after confirmation", async () => {
    const remove = vi.spyOn(CoreAPI, "deckDelete").mockResolvedValue();
    render(<DeckDetails />);
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "decks.edit" }));
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "decks.delete" }));
    expect(remove).not.toHaveBeenCalled();
    const confirm = screen.getByRole("dialog", { name: "decks.delete" });
    await userEvent
      .setup()
      .click(within(confirm).getByRole("button", { name: "nav.cancel" }));
    expect(remove).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "decks.delete" }));
    await userEvent
      .setup()
      .click(
        within(screen.getByRole("dialog", { name: "decks.delete" })).getByRole(
          "button",
          { name: "decks.delete" },
        ),
      );
    await waitFor(() => expect(remove).toHaveBeenCalledWith(deck.deckId));
  });

  it("deletes an unlocked cached deck only after confirmation", async () => {
    vi.spyOn(CoreAPI, "deckGet").mockResolvedValue({ ...deck, owned: false });
    const remove = vi.spyOn(CoreAPI, "deckDelete").mockResolvedValue();
    render(<DeckDetails />);
    expect(
      await screen.findByRole("button", { name: "decks.delete" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "decks.edit" }),
    ).not.toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "decks.delete" }));
    expect(remove).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .click(
        within(screen.getByRole("dialog", { name: "decks.delete" })).getByRole(
          "button",
          { name: "decks.delete" },
        ),
      );
    await waitFor(() => expect(remove).toHaveBeenCalledWith(deck.deckId));
  });

  it("keeps cached decks read-only but removable when unlocked", async () => {
    vi.spyOn(CoreAPI, "deckGet").mockResolvedValue({ ...deck, owned: false });
    render(<DeckDetails />);
    expect(
      await screen.findByRole("img", { name: "decks.readOnly" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "decks.addItem" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "decks.edit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "decks.delete" }),
    ).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Game decks.script/ }));
    const details = screen.getByRole("dialog", { name: "Game" });
    expect(
      within(details).queryByRole("button", { name: "decks.remove" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "decks.reorderItem" }),
    ).not.toBeInTheDocument();
  });

  it("allows opening and writing a locked deck without allowing edits or deletion", async () => {
    usePreferencesStore.setState({ nfcAvailable: true });
    vi.spyOn(CoreAPI, "deckGet").mockResolvedValue({ ...deck, locked: true });
    render(<DeckDetails />);
    expect(
      await screen.findByRole("img", { name: "decks.locked" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "decks.open" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "decks.share" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "library.writeAction" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "decks.edit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "decks.delete" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "decks.addItem" }),
    ).not.toBeInTheDocument();
  });

  it("hides all deck actions before Core 2.18", () => {
    useStatusStore.setState({ coreVersion: "2.17.9" });
    const get = vi.spyOn(CoreAPI, "deckGet");
    render(<DeckDetails />);
    expect(screen.getByText("library.updateCore")).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });
});
