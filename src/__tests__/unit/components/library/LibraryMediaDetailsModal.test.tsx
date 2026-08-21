import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@/test-utils";
import { CoreAPI } from "@/lib/coreApi";
import type { MediaBrowseEntry, MediaMetaResponse } from "@/lib/models";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useStatusStore } from "@/lib/store";
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
      coreVersion: "2.15.0",
      coreVersionPending: false,
    });
    usePreferencesStore.setState({
      showFilenames: false,
      nfcAvailable: false,
    });
    useStatusStore.getState().setWriteQueue("");
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

    const closingDialog = screen.getByRole("dialog", { hidden: true });
    expect(closingDialog).toBe(dialog);
    expect(closingDialog).toHaveStyle({
      transform: "translate3d(0, 100%, 0)",
      transition: "transform 0.2s ease-in-out",
    });
    expect(closingDialog).toHaveTextContent("Super Game");
    expect(closingDialog).toHaveTextContent("A platform adventure.");
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
    useStatusStore.setState({ connected: false });
    renderModal();

    expect(
      await screen.findByRole("button", { name: "library.launch" }),
    ).toBeDisabled();
  });
});
