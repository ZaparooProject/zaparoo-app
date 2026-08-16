import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@/test-utils";
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

  it("should prioritize actions and render curated game metadata", async () => {
    const user = userEvent.setup();
    renderModal();

    expect(
      await screen.findByRole("dialog", { name: "Super Game" }),
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

    const launch = screen.getByRole("button", { name: "library.launch" });
    const cover = screen.getByRole("img", { name: "library.imageAlt" });
    expect(
      launch.compareDocumentPosition(cover) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(cover).toHaveAttribute("src", "data:image/webp;base64,AAAA");

    const path = screen.getByText("/roms/SNES/Super Game.sfc");
    expect(path).not.toBeVisible();
    await user.click(
      screen.getByText("library.technicalDetails", { selector: "span" }),
    );
    expect(path).toBeVisible();
    expect(screen.getByText("RetroArch")).toBeVisible();
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
    expect(favoriteButton).not.toHaveTextContent("library.removeFavorite");
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

  it("should queue the resolved game target for NFC writing", async () => {
    usePreferencesStore.setState({ nfcAvailable: true });
    const user = userEvent.setup();
    const { props } = renderModal();

    await user.click(
      await screen.findByRole("button", { name: "library.write" }),
    );

    await waitFor(() => {
      expect(useStatusStore.getState().writeQueue).toBe(ENTRY.path);
      expect(props.close).toHaveBeenCalled();
    });
  });

  it("should omit NFC writing when no writer is available", async () => {
    renderModal();

    await screen.findByRole("dialog", { name: "Super Game" });
    await waitFor(() =>
      expect(CoreAPI.hasWriteCapableReader).toHaveBeenCalled(),
    );
    expect(
      screen.queryByRole("button", { name: "library.write" }),
    ).not.toBeInTheDocument();
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
