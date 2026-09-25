import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@/test-utils";
import { CoreAPI } from "@/lib/coreApi";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { DeckArtwork } from "@/components/library/DeckArtwork";
import { DeckItemDetailsModal } from "@/components/library/DeckItemDetailsModal";
import { requestLibraryImage } from "@/lib/libraryImages";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";
import type { DeckItem } from "@/lib/models";

vi.mock("@/lib/libraryImages", () => ({ requestLibraryImage: vi.fn() }));

const card: DeckItem = {
  id: 1,
  position: 1,
  kind: "card",
  name: "Card",
  cardId: "card1",
};

describe("DeckArtwork", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("IntersectionObserver", undefined);
    vi.mocked(requestLibraryImage).mockReset();
    useStatusStore.setState({ connectionState: ConnectionState.CONNECTED });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("looks up title scripts without metadata and shares lookups between duplicate rows", async () => {
    await seedActiveDevice({ recordId: "artwork-device" });
    const lookup = vi.spyOn(CoreAPI, "mediaLookup").mockResolvedValue({
      match: {
        mediaId: 42,
        system: { id: "Genesis", name: "Genesis" },
        name: "ToeJam & Earl",
        path: "/games/game.md",
        tags: [],
        confidence: 0.95,
      },
    });
    vi.mocked(requestLibraryImage).mockResolvedValue({
      url: "data:image/png;base64,YQ==",
      typeTag: "boxart",
    });
    const item: DeckItem = {
      id: 2,
      position: 2,
      kind: "script",
      name: "Game",
      zapscript: "@Genesis/ToeJam & Earl (region:us)",
    };
    render(
      <>
        <DeckArtwork item={item} />
        <DeckArtwork item={{ ...item, id: 3 }} />
      </>,
    );
    await waitFor(() => expect(screen.getAllByAltText("")).toHaveLength(2));
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith(
      { system: "Genesis", name: "ToeJam & Earl", fuzzySystem: true },
      expect.any(AbortSignal),
    );
    expect(requestLibraryImage).toHaveBeenCalledWith(
      expect.objectContaining({ mediaId: 42, path: "/games/game.md" }),
      "Genesis",
      expect.objectContaining({ priority: "thumbnail" }),
    );
  });

  it.each([false, true])(
    "keeps a placeholder for missing or failed lookups (failure: %s)",
    async (fails) => {
      await seedActiveDevice({ recordId: "artwork-device" });
      const lookup = vi.spyOn(CoreAPI, "mediaLookup");
      if (fails) lookup.mockRejectedValue(new Error("offline"));
      else lookup.mockResolvedValue({ match: null });
      render(
        <DeckArtwork
          item={{
            id: 2,
            position: 2,
            kind: "script",
            name: "Game",
            zapscript: "**launch.title:SNES/Game",
          }}
        />,
      );
      await waitFor(() => expect(lookup).toHaveBeenCalledOnce());
      expect(screen.queryByAltText("")).not.toBeInTheDocument();
      expect(requestLibraryImage).not.toHaveBeenCalled();
    },
  );

  it("shows a larger cover in item details using the same lookup as its row", async () => {
    await seedActiveDevice({ recordId: "artwork-device" });
    const lookup = vi.spyOn(CoreAPI, "mediaLookup").mockResolvedValue({
      match: {
        mediaId: 42,
        system: { id: "SNES", name: "SNES" },
        name: "Game",
        path: "/games/Game.sfc",
        tags: [],
        confidence: 1,
      },
    });
    vi.mocked(requestLibraryImage).mockResolvedValue({
      url: "data:image/png;base64,YQ==",
      typeTag: "boxart",
    });
    const item: DeckItem = {
      id: 2,
      position: 2,
      kind: "script",
      name: "Game",
      zapscript: "@SNES/Game",
    };
    render(
      <>
        <DeckArtwork item={item} />
        <DeckItemDetailsModal
          item={item}
          deckId="deck1"
          isOpen
          close={vi.fn()}
          canRemove={false}
          onRemove={vi.fn()}
          writeAvailable={false}
          onWrite={vi.fn()}
        />
      </>,
    );
    expect(
      await screen.findByRole("img", { name: "library.imageAlt" }),
    ).toHaveAttribute("src", "data:image/png;base64,YQ==");
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(requestLibraryImage).toHaveBeenCalledWith(
      expect.objectContaining({ mediaId: 42 }),
      "SNES",
      expect.objectContaining({ priority: "detail", maxSize: 512 }),
    );
  });

  it("does not request detail artwork while the modal is closed", async () => {
    await seedActiveDevice({ recordId: "artwork-device" });
    const lookup = vi
      .spyOn(CoreAPI, "mediaLookup")
      .mockResolvedValue({ match: null });
    render(
      <DeckItemDetailsModal
        item={{
          id: 2,
          position: 2,
          kind: "script",
          name: "Game",
          zapscript: "@SNES/Game",
        }}
        deckId="deck1"
        isOpen={false}
        close={vi.fn()}
        canRemove={false}
        onRemove={vi.fn()}
        writeAvailable={false}
        onWrite={vi.fn()}
      />,
    );
    expect(lookup).not.toHaveBeenCalled();
    expect(requestLibraryImage).not.toHaveBeenCalled();
  });

  it("resolves absolute file paths against indexed systems before requesting artwork", async () => {
    await seedActiveDevice({ recordId: "artwork-device" });
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [{ id: "SNES", name: "SNES" }],
    });
    vi.mocked(requestLibraryImage).mockResolvedValue({
      url: "data:image/png;base64,YQ==",
      typeTag: "boxart",
    });
    render(
      <DeckArtwork
        item={{
          id: 2,
          position: 2,
          kind: "script",
          name: "Game",
          zapscript: "/games/SNES/Game.sfc",
        }}
      />,
    );
    expect(await screen.findByAltText("")).toBeInTheDocument();
    expect(requestLibraryImage).toHaveBeenCalledWith(
      expect.objectContaining({
        systemId: "SNES",
        path: "/games/SNES/Game.sfc",
      }),
      "SNES",
      expect.anything(),
    );
  });

  it("waits until a row is visible before looking up its title", async () => {
    await seedActiveDevice({ recordId: "artwork-device" });
    let reveal!: () => void;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(
          callback: (entries: { isIntersecting: boolean }[]) => void,
        ) {
          reveal = () => callback([{ isIntersecting: true }]);
        }
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    const lookup = vi
      .spyOn(CoreAPI, "mediaLookup")
      .mockResolvedValue({ match: null });
    render(
      <DeckArtwork
        item={{
          id: 2,
          position: 2,
          kind: "script",
          name: "Game",
          zapscript: "@SNES/Game",
        }}
      />,
    );
    expect(lookup).not.toHaveBeenCalled();
    act(() => reveal());
    await waitFor(() => expect(lookup).toHaveBeenCalledOnce());
  });

  it("falls back when card art fails and retries when its URL changes", () => {
    const { rerender } = render(
      <DeckArtwork
        item={{
          ...card,
          metadata: { rendered_url: "https://example.com/deck.png" },
        }}
      />,
    );
    const image = screen.getByAltText("");
    expect(image).toHaveAttribute("src", "https://example.com/deck.png");
    fireEvent.error(image);
    expect(screen.queryByAltText("")).not.toBeInTheDocument();
    rerender(
      <DeckArtwork
        item={{
          ...card,
          metadata: { rendered_url: "https://example.com/new.png" },
        }}
      />,
    );
    expect(screen.getByAltText("")).toHaveAttribute(
      "src",
      "https://example.com/new.png",
    );
  });

  it("uses rendered card art, not the individual source image", () => {
    render(
      <DeckArtwork
        item={{
          ...card,
          metadata: {
            rendered_url: "https://example.com/rendered.png",
            image_url: "https://example.com/source.png",
          },
        }}
      />,
    );
    expect(screen.getByAltText("")).toHaveAttribute(
      "src",
      "https://example.com/rendered.png",
    );
  });

  it.each([
    undefined,
    { image_url: "https://example.com/source.png" },
    { rendered_url: "javascript:alert(1)" },
  ])(
    "keeps a placeholder when rendered card art is absent or unsafe",
    (metadata) => {
      render(<DeckArtwork item={{ ...card, metadata }} />);
      expect(screen.queryByAltText("")).not.toBeInTheDocument();
    },
  );

  it("keeps unresolved scripts as placeholders", () => {
    render(
      <DeckArtwork
        item={{
          id: 2,
          position: 2,
          kind: "script",
          name: "Action",
          zapscript: "**stop",
        }}
      />,
    );
    expect(screen.queryByAltText("")).not.toBeInTheDocument();
  });

  it("loads script artwork through the library image pipeline using Core's resolved media", async () => {
    await seedActiveDevice({ recordId: "artwork-device" });
    vi.mocked(requestLibraryImage).mockResolvedValue({
      url: "data:image/png;base64,YQ==",
      typeTag: "boxart",
    });
    render(
      <DeckArtwork
        item={{
          id: 2,
          position: 2,
          kind: "script",
          name: "Game",
          media: {
            system: "SNES",
            path: "/games/Game.sfc",
            name: "Game",
            available: true,
          },
        }}
      />,
    );
    expect(await screen.findByAltText("")).toHaveAttribute(
      "src",
      "data:image/png;base64,YQ==",
    );
    expect(requestLibraryImage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "media",
        systemId: "SNES",
        path: "/games/Game.sfc",
      }),
      "SNES",
      expect.objectContaining({
        deviceKey: "artwork-device",
        priority: "thumbnail",
        maxSize: 128,
      }),
    );
  });
});
