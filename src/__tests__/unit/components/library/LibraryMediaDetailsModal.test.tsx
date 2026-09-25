import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import { render as renderWithWrapper } from "@testing-library/react";
import {
  act,
  createProvidersWithQueryClient,
  createTestQueryClient,
  render,
  screen,
  waitFor,
  within,
} from "@/test-utils";
import { CoreAPI } from "@/lib/coreApi";
import type { MediaBrowseEntry, MediaMetaResponse } from "@/lib/models";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { LibraryMediaDetailsModal } from "@/components/library/LibraryMediaDetailsModal";

const mockRequestLibraryImage = vi.fn();
vi.mock("@/lib/libraryImages", () => ({
  requestLibraryImage: (...args: unknown[]) => mockRequestLibraryImage(...args),
}));

vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({ impact: vi.fn() }),
}));

const ENTRY: MediaBrowseEntry = {
  mediaId: 42,
  name: "Super Game",
  path: "/roms/SNES/Super Game.sfc",
  type: "media",
  systemId: "SNES",
  tags: [{ type: "region", tag: "us" }],
  disambiguatingTags: [{ type: "region", tag: "us" }],
};

const META_RESPONSE: MediaMetaResponse = {
  media: {
    path: ENTRY.path,
    parentDir: "/roms/SNES",
    isMissing: false,
    tags: [
      { type: "region", tag: "us" },
      { type: "edition", tag: "special", label: "Special Edition" },
      { type: "scraper.gamelist.xml", tag: "scraped" },
    ],
    properties: {
      "property:manual": {
        text: "/manuals/Super Game.pdf",
        contentType: "application/pdf",
      },
      "property:xml-game-id": {
        text: "12345",
        contentType: "",
      },
    },
    launcherOverride: "RetroArch",
    availableImageTypes: ["boxart", "screenshot"],
    title: {
      slug: "super-game",
      secondarySlug: "super-game-alt",
      name: "Super Game",
      slugLength: 10,
      slugWordCount: 2,
      system: { id: "SNES", name: "Super Nintendo" },
      tags: [
        { type: "developer", tag: "studio", label: "Studio" },
        { type: "publisher", tag: "publisher", label: "Publisher" },
        { type: "year", tag: "1994" },
        { type: "players", tag: "2" },
        { type: "genre", tag: "platformer", label: "Platformer" },
        { type: "rating", tag: "0.8" },
      ],
      properties: {
        "property:description": {
          text: "A platform adventure.",
          contentType: "",
        },
      },
      availableImageTypes: ["screenshot"],
    },
  },
};

function renderModal(
  overrides: Partial<
    React.ComponentProps<typeof LibraryMediaDetailsModal>
  > = {},
) {
  const props: React.ComponentProps<typeof LibraryMediaDetailsModal> = {
    isOpen: true,
    close: vi.fn(),
    entry: ENTRY,
    systemId: "SNES",
    deviceKey: "device-a",
    ...overrides,
  };
  return { ...render(<LibraryMediaDetailsModal {...props} />), props };
}

describe("LibraryMediaDetailsModal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockRequestLibraryImage.mockReset();
    mockRequestLibraryImage.mockResolvedValue({
      url: "data:image/webp;base64,AAAA",
      typeTag: "property:image-boxart",
    });
    vi.spyOn(CoreAPI, "mediaMeta").mockResolvedValue(META_RESPONSE);
    vi.spyOn(CoreAPI, "hasWriteCapableReader").mockResolvedValue(false);
    useStatusStore.setState({
      connected: true,
      connectionState: ConnectionState.CONNECTED,
      coreVersion: "2.15.0",
      coreVersionPending: false,
    });
    usePreferencesStore.setState({
      showFilenames: false,
      nfcAvailable: false,
    });
    useStatusStore.getState().setWriteQueue("");
  });

  it("keeps preference and write actions but omits Launch for Now Playing", async () => {
    useStatusStore.setState({ coreVersion: "2.18.0" });
    const { props } = renderModal({ context: "nowPlaying" });

    const dialog = await screen.findByRole("dialog", { name: "Super Game" });
    expect(await within(dialog).findByText("Platformer")).toBeVisible();
    expect(
      within(dialog).queryByRole("button", { name: "library.launch" }),
    ).not.toBeInTheDocument();
    const actions = within(dialog).getByRole("group", {
      name: "library.mediaActions",
    });
    for (const name of [
      "library.addFavorite",
      "library.addLike",
      "library.addDislike",
      "library.addPlayLater",
      "library.write",
    ]) {
      expect(within(actions).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("link", { name: "accessibility.skipToActions" }),
    ).toBeInTheDocument();

    await userEvent
      .setup()
      .click(within(dialog).getAllByRole("button", { name: "nav.close" })[0]!);
    expect(props.close).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "adds the selected result value from details with filename mode %s",
    async (showFilenames) => {
      usePreferencesStore.setState({ showFilenames });
      useStatusStore.setState({ coreVersion: "2.18.0" });
      vi.spyOn(CoreAPI, "decks").mockResolvedValue({
        decks: [
          {
            deckId: "0k3v9x2rq7bm",
            name: "Weekend",
            description: "",
            owned: true,
            locked: false,
            itemCount: 0,
            createdAt: 1,
            updatedAt: 1,
          },
          {
            deckId: "0k3v9x2rq7bn",
            name: "Locked",
            description: "",
            owned: true,
            locked: true,
            itemCount: 0,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      });
      const success = vi.spyOn(toast, "success");
      const update = vi.spyOn(CoreAPI, "deckUpdate").mockResolvedValue({
        deckId: "0k3v9x2rq7bm",
        name: "Weekend",
        description: "",
        owned: true,
        locked: false,
        itemCount: 1,
        items: [],
        createdAt: 1,
        updatedAt: 2,
      });
      renderModal({
        entry: {
          ...ENTRY,
          zapScript: "@SNES/Super Game (region:us)",
          relativePath: "SNES/Super Game.sfc",
        },
      });
      const dialog = await screen.findByRole("dialog", { name: "Super Game" });
      expect(
        within(dialog).getByRole("button", { name: "library.launch" }),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole("button", { name: "library.write" }),
      ).toBeInTheDocument();
      await userEvent
        .setup()
        .click(within(dialog).getByRole("button", { name: "decks.addAction" }));
      const picker = await screen.findByRole("dialog", {
        name: "decks.addAction",
      });
      expect(
        await within(picker).findByRole("button", { name: /Weekend/ }),
      ).toBeInTheDocument();
      expect(
        within(picker).queryByRole("button", { name: /Locked/ }),
      ).not.toBeInTheDocument();
      await userEvent
        .setup()
        .click(within(picker).getByRole("button", { name: /Weekend/ }));
      await waitFor(() =>
        expect(update).toHaveBeenCalledWith({
          deckId: "0k3v9x2rq7bm",
          addItems: [
            {
              kind: "script",
              name: ENTRY.name,
              zapscript: showFilenames
                ? "SNES/Super Game.sfc"
                : "@SNES/Super Game (region:us)",
            },
          ],
        }),
      );
      await waitFor(() => expect(success).toHaveBeenCalledWith("decks.added"));
    },
  );

  it("separates deck creation from searchable selection and preserves search on cancel", async () => {
    useStatusStore.setState({ coreVersion: "2.18.0" });
    vi.spyOn(CoreAPI, "decks").mockResolvedValue({ decks: [] });
    const create = vi.spyOn(CoreAPI, "deckNew").mockResolvedValue({
      deckId: "newdeck",
      name: "Weekend",
      description: "",
      owned: true,
      locked: false,
      itemCount: 1,
      items: [],
      createdAt: 1,
      updatedAt: 1,
    });
    const success = vi.spyOn(toast, "success");
    renderModal({ entry: { ...ENTRY, zapScript: "@SNES/Super Game" } });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "decks.addAction" }),
    );
    let picker = screen.getByRole("dialog", { name: "decks.addAction" });
    expect(
      within(picker).queryByRole("textbox", { name: "decks.name" }),
    ).not.toBeInTheDocument();
    await user.type(
      within(picker).getByRole("searchbox", { name: "decks.search" }),
      "Weekend",
    );
    expect(
      await within(picker).findByText("decks.noMatching"),
    ).toBeInTheDocument();
    await user.click(within(picker).getByRole("button", { name: "decks.new" }));
    let form = screen.getByRole("dialog", { name: "decks.new" });
    expect(
      within(form).getByRole("button", { name: "decks.createAndAdd" }),
    ).toBeDisabled();
    await user.click(within(form).getByRole("button", { name: "nav.cancel" }));
    picker = screen.getByRole("dialog", { name: "decks.addAction" });
    expect(
      within(picker).getByRole("searchbox", { name: "decks.search" }),
    ).toHaveValue("Weekend");
    await user.click(within(picker).getByRole("button", { name: "decks.new" }));
    form = screen.getByRole("dialog", { name: "decks.new" });
    await user.type(
      within(form).getByRole("textbox", { name: "decks.name" }),
      "Weekend",
    );
    await user.click(
      within(form).getByRole("button", { name: "decks.createAndAdd" }),
    );
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        name: "Weekend",
        items: [
          { kind: "script", name: ENTRY.name, zapscript: "@SNES/Super Game" },
        ],
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "decks.new" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("dialog", { name: "Super Game" }),
    ).toBeInTheDocument();
    expect(success).toHaveBeenCalledWith("decks.added");
  });

  it("should render persistent actions and curated game metadata", async () => {
    const user = userEvent.setup();
    renderModal();

    expect(
      await screen.findByRole("dialog", { name: "Super Game" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "accessibility.skipToActions" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("A platform adventure."),
    ).toBeInTheDocument();
    expect(screen.getByText("SNES • 1994 • library.playerCount")).toBeVisible();
    expect(screen.getByText("library.developer")).toBeVisible();
    expect(screen.getByText("Studio")).toBeVisible();
    expect(
      screen.getByText("Special Edition").closest("[aria-label]"),
    ).toHaveAttribute("aria-label", "edition special");
    expect(screen.getByText("library.publisher")).toBeVisible();
    expect(screen.getByText("Publisher")).toBeVisible();
    expect(screen.getByText("library.genre")).toBeVisible();
    expect(screen.getByText("Platformer")).toBeVisible();
    expect(screen.getByText("library.rating")).toBeVisible();
    expect(screen.getByText("0.8")).toBeVisible();
    expect(screen.getByText("library.tags")).toBeVisible();
    expect(screen.getAllByLabelText("region us")).toHaveLength(1);
    expect(screen.queryByText("super-game-alt")).not.toBeInTheDocument();
    expect(screen.queryByText("/roms/SNES")).not.toBeInTheDocument();
    expect(
      screen.queryByText("library.mediaAvailable"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("/manuals/Super Game.pdf"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("12345")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("scraper.gamelist.xml scraped"),
    ).not.toBeInTheDocument();

    const actions = screen.getByRole("group", {
      name: "library.mediaActions",
    });
    const favorite = screen.getByRole("button", {
      name: "library.addFavorite",
    });
    const write = screen.getByRole("button", { name: "library.write" });
    const launch = screen.getByRole("button", { name: "library.launch" });
    const cover = screen.getByRole("img", { name: "library.imageAlt" });
    expect(favorite).toHaveTextContent("library.favorite");
    expect(write).toHaveTextContent("library.writeAction");
    expect(within(actions).getByRole("button", { name: "library.write" })).toBe(
      write,
    );
    expect(
      within(actions).queryByRole("button", { name: "library.launch" }),
    ).not.toBeInTheDocument();
    expect(write).toBeDisabled();
    expect(
      write.compareDocumentPosition(launch) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(launch).toBeVisible();
    expect(launch).toBeEnabled();
    expect(cover).toHaveAttribute("src", "data:image/webp;base64,AAAA");

    const path = screen.getByText("/roms/SNES/Super Game.sfc");
    expect(path).not.toBeVisible();
    await user.click(
      screen.getByText("library.technicalDetails", { selector: "span" }),
    );
    expect(path).toBeVisible();
    expect(screen.getByText("RetroArch")).toBeVisible();
  });

  it("should retain full content while the sheet closes", async () => {
    const view = renderModal();
    const dialog = await screen.findByRole("dialog", { name: "Super Game" });
    await screen.findByText("A platform adventure.");

    view.rerender(
      <LibraryMediaDetailsModal
        {...view.props}
        isOpen={false}
        entry={null}
        systemId=""
      />,
    );

    expect(screen.getAllByRole("dialog", { hidden: true })).toContain(dialog);
    expect(dialog).toHaveStyle({
      transform: "translate3d(0, 100%, 0)",
      transition: "transform 0.2s ease-in-out",
    });
    expect(dialog).toHaveTextContent("Super Game");
    expect(dialog).toHaveTextContent("A platform adventure.");
    expect(
      screen.getByRole("button", { name: "library.launch", hidden: true }),
    ).toBeInTheDocument();
  });

  it("should represent favorite state as an action, not a metadata tag", async () => {
    vi.spyOn(CoreAPI, "mediaMeta").mockResolvedValue({
      media: {
        ...META_RESPONSE.media,
        tags: [...META_RESPONSE.media.tags, { type: "user", tag: "favorite" }],
      },
    });
    renderModal({
      entry: {
        ...ENTRY,
        tags: [...(ENTRY.tags ?? []), { type: "user", tag: "favorite" }],
      },
    });

    const favoriteButton = await screen.findByRole("button", {
      name: "library.removeFavorite",
    });
    expect(favoriteButton).toHaveAccessibleName("library.removeFavorite");
    expect(favoriteButton).toHaveTextContent("library.favorite");
    expect(screen.queryByLabelText("user favorite")).not.toBeInTheDocument();
  });

  it("should show all 2.18 preference actions without exposing preference tags as metadata", async () => {
    useStatusStore.setState({ coreVersion: "2.18.0" });
    vi.spyOn(CoreAPI, "mediaMeta").mockResolvedValue({
      media: {
        ...META_RESPONSE.media,
        tags: [
          { type: "user", tag: "liked" },
          { type: "user", tag: "playlater" },
          { type: "region", tag: "us" },
        ],
      },
    });
    renderModal();
    const actions = await screen.findByRole("group", {
      name: "library.mediaActions",
    });
    expect(
      await within(actions).findByRole("button", {
        name: "library.removeLike",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(actions).getByRole("button", { name: "library.addDislike" }),
    ).toBeInTheDocument();
    expect(
      within(actions).getByRole("button", { name: "library.removePlayLater" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("user liked")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("user playlater")).not.toBeInTheDocument();
  });

  it("should lazy-load alternate image types", async () => {
    const user = userEvent.setup();
    renderModal();

    const next = await screen.findByRole("button", {
      name: "library.nextImage",
    });
    await user.click(next);

    await waitFor(() => {
      expect(mockRequestLibraryImage).toHaveBeenCalledWith(
        ENTRY,
        "SNES",
        expect.objectContaining({
          imageTypes: ["screenshot"],
          maxSize: 512,
          priority: "detail",
        }),
      );
    });
  });

  it("should not apply another device's missing cover to the same media", async () => {
    mockRequestLibraryImage.mockImplementation(
      (
        _entry: MediaBrowseEntry,
        _systemId: string,
        options: { deviceKey: string },
      ) =>
        Promise.resolve(
          options.deviceKey === "device-b"
            ? {
                url: "data:image/webp;base64,BBBB",
                typeTag: "property:image-boxart",
              }
            : null,
        ),
    );
    const wrapper = createProvidersWithQueryClient(createTestQueryClient());
    const props: React.ComponentProps<typeof LibraryMediaDetailsModal> = {
      isOpen: true,
      close: vi.fn(),
      entry: ENTRY,
      systemId: "SNES",
      deviceKey: "device-a",
    };
    const { rerender } = renderWithWrapper(
      <LibraryMediaDetailsModal {...props} />,
      { wrapper },
    );
    await screen.findByText("A platform adventure.");
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "library.nextImage" }),
      ).not.toBeInTheDocument();
    });

    // Search keeps the sheet open when the active device changes.
    rerender(<LibraryMediaDetailsModal {...props} deviceKey="device-b" />);

    expect(
      await screen.findByRole("img", { name: "library.imageAlt" }),
    ).toHaveAttribute("src", "data:image/webp;base64,BBBB");
  });

  it("should not repeat a cached cover when details reopen from another list", async () => {
    const user = userEvent.setup();
    const wrapper = createProvidersWithQueryClient(createTestQueryClient());
    const props: React.ComponentProps<typeof LibraryMediaDetailsModal> = {
      isOpen: true,
      close: vi.fn(),
      entry: ENTRY,
      systemId: "SNES",
      deviceKey: "device-a",
    };
    const { unmount } = renderWithWrapper(
      <LibraryMediaDetailsModal {...props} />,
      { wrapper },
    );
    await screen.findByRole("img", { name: "library.imageAlt" });
    unmount();

    // Favorites builds its own entry object, and the cover is still cached.
    renderWithWrapper(
      <LibraryMediaDetailsModal {...props} entry={{ ...ENTRY }} />,
      { wrapper },
    );
    await user.click(
      await screen.findByRole("button", { name: "library.nextImage" }),
    );

    await waitFor(() => {
      expect(mockRequestLibraryImage).toHaveBeenCalledWith(
        expect.objectContaining({ mediaId: ENTRY.mediaId }),
        "SNES",
        expect.objectContaining({ imageTypes: ["screenshot"] }),
      );
    });
    expect(
      screen.getByRole("button", { name: "library.nextImage" }),
    ).toBeDisabled();
    expect(mockRequestLibraryImage).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ imageTypes: ["boxart"] }),
    );
  });

  it("should move focus when carousel navigation reaches a bound", async () => {
    const user = userEvent.setup();
    renderModal();

    const next = await screen.findByRole("button", {
      name: "library.nextImage",
    });
    const previous = screen.getByRole("button", {
      name: "library.previousImage",
    });

    await user.click(next);
    await waitFor(() => expect(previous).toHaveFocus());

    await user.click(previous);
    await waitFor(() => expect(next).toHaveFocus());
  });

  it("should add favorites only after explicit details action", async () => {
    const updateSpy = vi.spyOn(CoreAPI, "mediaTagsUpdate").mockResolvedValue({
      tags: [{ type: "user", tag: "favorite" }],
    });
    const user = userEvent.setup();
    renderModal();

    await user.click(
      await screen.findByRole("button", { name: "library.addFavorite" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      mediaId: 42,
      add: ["user:favorite"],
    });
    expect(
      await screen.findByRole("button", { name: "library.removeFavorite" }),
    ).toBeInTheDocument();
  });

  it("should launch only after explicit action and keep details open", async () => {
    const user = userEvent.setup();
    const runSpy = vi.spyOn(CoreAPI, "run").mockResolvedValue();
    const { props } = renderModal();

    expect(runSpy).not.toHaveBeenCalled();
    await user.click(
      await screen.findByRole("button", { name: "library.launch" }),
    );

    await waitFor(() => {
      expect(runSpy).toHaveBeenCalledWith({ text: ENTRY.path });
    });
    expect(props.close).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Super Game" }),
    ).toBeInTheDocument();
  });

  it("keeps the launch caption stable while its icon shows progress", async () => {
    let finish!: () => void;
    vi.spyOn(CoreAPI, "run").mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderModal();
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "library.launch" }));
    const pending = screen.getByRole("button", { name: "library.launching" });
    expect(pending).toHaveTextContent("library.launch");
    expect(pending).toBeDisabled();
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    await act(async () => finish());
    expect(
      screen.getByRole("button", { name: "library.launch" }),
    ).toBeEnabled();
  });

  it("should not launch while Core is reconnecting", async () => {
    const user = userEvent.setup();
    const runSpy = vi.spyOn(CoreAPI, "run").mockResolvedValue();
    useStatusStore.getState().setConnectionState(ConnectionState.RECONNECTING);
    renderModal();

    const launch = await screen.findByRole("button", {
      name: "library.launch",
    });
    expect(launch).toBeDisabled();
    await user.click(launch);

    expect(runSpy).not.toHaveBeenCalled();
  });

  it("should offer ZapScript and relative path before NFC writing", async () => {
    usePreferencesStore.setState({ nfcAvailable: true });
    const user = userEvent.setup();
    const { props } = renderModal({
      entry: {
        ...ENTRY,
        zapScript: "@SNES/Super Game",
        relativePath: "SNES/Super Game.sfc",
      },
    });

    await user.click(
      await screen.findByRole("button", { name: "library.write" }),
    );

    const writeDialog = await screen.findByRole("dialog", {
      name: "create.search.writeLabel",
    });
    expect(useStatusStore.getState().writeQueue).toBe("");
    expect(
      within(writeDialog).getByRole("radio", {
        name: /create\.search\.zapscriptLabel/i,
      }),
    ).toBeChecked();
    expect(
      within(writeDialog).getByRole("radio", {
        name: /create\.search\.pathLabel: SNES\/Super Game\.sfc/i,
      }),
    ).not.toBeChecked();

    await user.click(
      within(writeDialog).getByRole("button", {
        name: "create.search.writeLabel",
      }),
    );

    expect(useStatusStore.getState().writeQueue).toBe("@SNES/Super Game");
    expect(props.close).toHaveBeenCalled();
  });

  it("should restore details when write-target selection is dismissed", async () => {
    usePreferencesStore.setState({ nfcAvailable: true });
    const user = userEvent.setup();
    const { props } = renderModal({
      entry: {
        ...ENTRY,
        zapScript: "@SNES/Super Game",
        relativePath: "SNES/Super Game.sfc",
      },
    });

    await user.click(
      await screen.findByRole("button", { name: "library.write" }),
    );
    const writeDialog = await screen.findByRole("dialog", {
      name: "create.search.writeLabel",
    });
    expect(props.close).not.toHaveBeenCalled();

    await user.click(
      within(writeDialog).getAllByRole("button", { name: "nav.close" })[0]!,
    );

    expect(
      screen.queryByRole("dialog", { name: "create.search.writeLabel" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("dialog", { name: "Super Game" }),
    ).toBeInTheDocument();
    expect(props.close).not.toHaveBeenCalled();
  });

  it("should close write-target selection when details close", async () => {
    usePreferencesStore.setState({ nfcAvailable: true });
    const user = userEvent.setup();
    const view = renderModal({
      entry: {
        ...ENTRY,
        zapScript: "@SNES/Super Game",
        relativePath: "SNES/Super Game.sfc",
      },
    });

    await user.click(
      await screen.findByRole("button", { name: "library.write" }),
    );
    expect(
      await screen.findByRole("dialog", {
        name: "create.search.writeLabel",
      }),
    ).toBeInTheDocument();

    view.rerender(<LibraryMediaDetailsModal {...view.props} isOpen={false} />);

    expect(
      screen.queryByRole("dialog", { name: "create.search.writeLabel" }),
    ).not.toBeInTheDocument();

    view.rerender(<LibraryMediaDetailsModal {...view.props} isOpen />);

    expect(
      screen.queryByRole("dialog", { name: "create.search.writeLabel" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("dialog", { name: "Super Game" }),
    ).toBeInTheDocument();
  });

  it("should abort pending write preparation when details close", async () => {
    usePreferencesStore.setState({ nfcAvailable: true });
    const directoryEntry: MediaBrowseEntry = {
      ...ENTRY,
      type: "directory",
      path: "/roms/SNES/Super Game",
      relativePath: undefined,
      zapScript: "@SNES/Super Game (disc:1)",
    };
    let pendingSignal: AbortSignal | undefined;
    let resolvePending!: (response: MediaMetaResponse) => void;
    vi.mocked(CoreAPI.mediaMeta)
      .mockResolvedValueOnce({
        media: { ...META_RESPONSE.media, path: directoryEntry.path },
      })
      .mockImplementationOnce((_request, signal) => {
        pendingSignal = signal;
        return new Promise((resolve) => {
          resolvePending = resolve;
        });
      });
    const user = userEvent.setup();
    const view = renderModal({ entry: directoryEntry });

    await waitFor(() => expect(CoreAPI.mediaMeta).toHaveBeenCalledTimes(1));
    await user.click(
      await screen.findByRole("button", { name: "library.write" }),
    );
    await waitFor(() => expect(pendingSignal).toBeDefined());

    view.rerender(<LibraryMediaDetailsModal {...view.props} isOpen={false} />);

    expect(pendingSignal?.aborted).toBe(true);
    await act(async () => {
      resolvePending({
        media: {
          ...META_RESPONSE.media,
          path: "/roms/SNES/Super Game/Game.m3u",
        },
      });
      await Promise.resolve();
    });
    view.rerender(<LibraryMediaDetailsModal {...view.props} isOpen />);
    expect(
      screen.queryByRole("dialog", { name: "create.search.writeLabel" }),
    ).not.toBeInTheDocument();
  });

  it("should write the selected relative path from Library details", async () => {
    usePreferencesStore.setState({ nfcAvailable: true });
    const user = userEvent.setup();
    renderModal({
      entry: {
        ...ENTRY,
        zapScript: "@SNES/Super Game",
        relativePath: "SNES/Super Game.sfc",
      },
    });

    await user.click(
      await screen.findByRole("button", { name: "library.write" }),
    );
    const writeDialog = await screen.findByRole("dialog", {
      name: "create.search.writeLabel",
    });
    await user.click(
      within(writeDialog).getByRole("radio", {
        name: /create\.search\.pathLabel/i,
      }),
    );
    await user.click(
      within(writeDialog).getByRole("button", {
        name: "create.search.writeLabel",
      }),
    );

    expect(useStatusStore.getState().writeQueue).toBe("SNES/Super Game.sfc");
  });

  it("should resolve a path while customizing Library directory ZapScript", async () => {
    usePreferencesStore.setState({ nfcAvailable: true });
    vi.mocked(CoreAPI.mediaMeta).mockResolvedValue({
      media: {
        ...META_RESPONSE.media,
        path: "/roms/PSX/Multi Disc Game/Game.m3u",
        parentDir: "/roms/PSX/Multi Disc Game",
        title: {
          ...META_RESPONSE.media.title,
          system: { id: "PSX", name: "PlayStation" },
        },
      },
    });
    const user = userEvent.setup();
    renderModal({
      entry: {
        ...ENTRY,
        type: "directory",
        path: "/roms/PSX/Multi Disc Game",
        systemId: "PSX",
        zapScript: "@PSX/Multi Disc Game (disc:1)",
        relativePath: undefined,
        tags: [{ type: "disc", tag: "1" }],
      },
      systemId: "PSX",
    });

    await user.click(
      await screen.findByRole("button", { name: "library.write" }),
    );
    const writeDialog = await screen.findByRole("dialog", {
      name: "create.search.writeLabel",
    });
    expect(
      within(writeDialog).getByRole("radio", {
        name: /create\.search\.pathLabel: \/roms\/PSX\/Multi Disc Game\/Game\.m3u/i,
      }),
    ).not.toBeChecked();
    expect(
      within(writeDialog).getByRole("radio", {
        name: /create\.search\.zapscriptLabel/i,
      }),
    ).toBeChecked();

    await user.click(
      within(writeDialog).getByRole("button", { name: "disc 1" }),
    );
    await user.click(
      within(writeDialog).getByRole("button", {
        name: "create.search.writeLabel",
      }),
    );

    expect(useStatusStore.getState().writeQueue).toBe("@PSX/Multi Disc Game");
  });

  it("should write directly when Library has only one target", async () => {
    usePreferencesStore.setState({ nfcAvailable: true });
    const user = userEvent.setup();
    renderModal({
      entry: {
        ...ENTRY,
        relativePath: "SNES/Super Game.sfc",
      },
    });

    await user.click(
      await screen.findByRole("button", { name: "library.write" }),
    );

    await waitFor(() => {
      expect(useStatusStore.getState().writeQueue).toBe("SNES/Super Game.sfc");
    });
    expect(
      screen.queryByRole("dialog", { name: "create.search.writeLabel" }),
    ).not.toBeInTheDocument();
  });

  it("should customize Library ZapScript tags before writing", async () => {
    usePreferencesStore.setState({ nfcAvailable: true });
    const user = userEvent.setup();
    renderModal({
      entry: {
        ...ENTRY,
        zapScript: "@SNES/Super Game (region:us)",
        relativePath: "SNES/Super Game.sfc",
      },
    });

    await user.click(
      await screen.findByRole("button", { name: "library.write" }),
    );
    const writeDialog = await screen.findByRole("dialog", {
      name: "create.search.writeLabel",
    });
    await user.click(
      within(writeDialog).getByRole("button", { name: "region us" }),
    );
    await user.click(
      within(writeDialog).getByRole("button", {
        name: "create.search.writeLabel",
      }),
    );

    expect(useStatusStore.getState().writeQueue).toBe("@SNES/Super Game");
  });

  it("should keep writing disabled when no writer is available", async () => {
    renderModal();

    await screen.findByRole("dialog", { name: "Super Game" });
    await waitFor(() =>
      expect(CoreAPI.hasWriteCapableReader).toHaveBeenCalled(),
    );
    expect(
      screen.getByRole("button", { name: "library.write" }),
    ).toBeDisabled();
  });

  it("should retain browse details and launch action when metadata fails", async () => {
    vi.spyOn(CoreAPI, "mediaMeta").mockRejectedValue(new Error("offline"));
    renderModal();

    expect(
      await screen.findByText("library.metadataError"),
    ).toBeInTheDocument();
    expect(screen.getByText(ENTRY.path)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "library.launch" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "library.tryAgain" }),
    ).toBeInTheDocument();
  });

  it("should skip image requests when Core reports no cover", async () => {
    renderModal({ entry: { ...ENTRY, hasCover: false } });

    await screen.findByRole("dialog", { name: "Super Game" });
    expect(mockRequestLibraryImage).not.toHaveBeenCalled();
  });

  it("should disable launch while disconnected", async () => {
    useStatusStore.getState().setConnectionState(ConnectionState.DISCONNECTED);
    renderModal();

    expect(
      await screen.findByRole("button", { name: "library.launch" }),
    ).toBeDisabled();
  });
});
