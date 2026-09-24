import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@/test-utils";
import { CoreAPI } from "@/lib/coreApi";
import type { SearchResultsResponse } from "@/lib/models";
import { useLibrarySessionStore } from "@/lib/librarySessionStore";
import { useStatusStore } from "@/lib/store";
import { LibraryFavorites } from "@/routes/library.favorites";
import { LibraryTaggedCollection } from "@/components/library/LibraryTaggedCollection";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: unknown) => options,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        key: index,
        index,
        size: 104,
        start: index * 104,
      })),
    getTotalSize: () => count * 104,
    measureElement: vi.fn(),
    measure: vi.fn(),
    scrollToIndex: vi.fn(),
  }),
}));

vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: () => undefined,
}));

vi.mock("@/hooks/useBackButtonHandler", () => ({
  useBackButtonHandler: vi.fn(),
}));

vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: () => ({}),
}));

vi.mock("@/lib/libraryImages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/libraryImages")>();
  return {
    ...actual,
    requestLibraryImage: vi.fn().mockResolvedValue(null),
  };
});

function favoriteResult(
  name: string,
  mediaId: number,
): SearchResultsResponse["results"][number] {
  return {
    mediaId,
    name,
    path: `/roms/SNES/${name}.sfc`,
    system: { id: "SNES", name: "Super Nintendo" },
    zapScript: `@SNES/${name}`,
    tags: [{ type: "user", tag: "favorite" }],
    disambiguatingTags: [{ type: "region", tag: "world" }],
  };
}

function favoritesResponse(
  names: string[],
  nextCursor: string | null = null,
): SearchResultsResponse {
  return {
    results: names.map((name, index) => favoriteResult(name, index + 1)),
    total: names.length,
    pagination: {
      hasNextPage: nextCursor !== null,
      nextCursor,
      pageSize: 100,
    },
  };
}

describe("Library Favorites route", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    CoreAPI.reset();
    mockNavigate.mockClear();
    useLibrarySessionStore.getState().reset();
    await seedActiveDevice({ recordId: "device-a" });
    useStatusStore.setState({
      connected: true,
      coreVersion: "2.15.0",
      coreVersionPending: false,
      gamesIndex: { exists: true, indexing: false },
    });
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [{ id: "SNES", name: "Super Nintendo" }],
    });
    vi.spyOn(CoreAPI, "mediaMeta").mockResolvedValue({
      media: {
        path: "/roms/SNES/Favorite Game.sfc",
        parentDir: "/roms/SNES",
        isMissing: false,
        tags: [{ type: "user", tag: "favorite" }],
        properties: {},
        title: {
          slug: "favorite-game",
          name: "Favorite Game",
          slugLength: 13,
          slugWordCount: 2,
          system: { id: "SNES", name: "Super Nintendo" },
          tags: [],
          properties: {},
        },
      },
    });
  });

  it("should list favorite media with the fixed user tag filter", async () => {
    const searchSpy = vi
      .spyOn(CoreAPI, "mediaSearch")
      .mockResolvedValue(favoritesResponse(["Favorite Game"]));

    render(<LibraryFavorites />);

    expect(
      await screen.findByRole("button", { name: /Favorite Game/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("SNES")).toBeInTheDocument();
    expect(screen.getByLabelText("library.favorite")).toBeInTheDocument();
    expect(screen.queryByLabelText("user favorite")).not.toBeInTheDocument();
    expect(searchSpy).toHaveBeenCalledWith(
      {
        query: "",
        systems: [],
        tags: ["user:favorite"],
        maxResults: 100,
      },
      expect.any(AbortSignal),
    );
  });

  it("should fetch the next favorites cursor", async () => {
    const searchSpy = vi
      .spyOn(CoreAPI, "mediaSearch")
      .mockResolvedValueOnce(favoritesResponse(["First"], "next-page"))
      .mockResolvedValueOnce(favoritesResponse(["Second"]));

    render(<LibraryFavorites />);

    await waitFor(() => expect(searchSpy).toHaveBeenCalledTimes(2));
    expect(searchSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tags: ["user:favorite"],
        cursor: "next-page",
      }),
      expect.any(AbortSignal),
    );
    expect(
      await screen.findByRole("button", { name: /Second/ }),
    ).toBeInTheDocument();
  });

  it("should open search with an immutable favorites scope", async () => {
    const searchSpy = vi
      .spyOn(CoreAPI, "mediaSearch")
      .mockResolvedValue(favoritesResponse([]));
    const user = userEvent.setup();

    render(<LibraryFavorites />);
    await user.click(
      await screen.findByRole("button", { name: "library.searchFavorites" }),
    );

    expect(
      screen.getByRole("search", { name: "library.searchFavorites" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "library.searchAction" }),
    );
    await waitFor(() =>
      expect(searchSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ tags: ["user:favorite"] }),
        expect.any(AbortSignal),
      ),
    );
  });

  it.each([
    ["liked", "user:liked", "library.searchLiked"],
    ["disliked", "user:disliked", "library.searchDisliked"],
    ["play-later", "user:playlater", "library.searchPlayLater"],
  ] as const)(
    "should browse and search the %s collection with a fixed tag",
    async (collection, tag, searchLabel) => {
      useStatusStore.setState({ coreVersion: "2.18.0" });
      const searchSpy = vi
        .spyOn(CoreAPI, "mediaSearch")
        .mockResolvedValue(favoritesResponse(["Game"]));
      render(<LibraryTaggedCollection collection={collection} />);

      expect(
        await screen.findByRole("button", { name: /Game/ }),
      ).toBeInTheDocument();
      expect(searchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ tags: [tag], maxResults: 100 }),
        expect.any(AbortSignal),
      );
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: searchLabel }));
      expect(
        screen.getByRole("search", { name: searchLabel }),
      ).toBeInTheDocument();
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: "library.searchAction" }));
      await waitFor(() =>
        expect(searchSpy).toHaveBeenLastCalledWith(
          expect.objectContaining({ tags: [tag] }),
          expect.any(AbortSignal),
        ),
      );
    },
  );

  it("should paginate liked media with the same fixed tag", async () => {
    useStatusStore.setState({ coreVersion: "2.18.0" });
    const searchSpy = vi
      .spyOn(CoreAPI, "mediaSearch")
      .mockResolvedValueOnce(favoritesResponse(["First"], "next-page"))
      .mockResolvedValueOnce(favoritesResponse(["Second"]));
    render(<LibraryTaggedCollection collection="liked" />);
    await waitFor(() => expect(searchSpy).toHaveBeenCalledTimes(2));
    expect(searchSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: "next-page", tags: ["user:liked"] }),
      expect.any(AbortSignal),
    );
  });

  it("should not search a new collection on older Core", () => {
    const searchSpy = vi
      .spyOn(CoreAPI, "mediaSearch")
      .mockResolvedValue(favoritesResponse([]));
    render(<LibraryTaggedCollection collection="liked" />);
    expect(screen.getByText("library.updateCore")).toBeInTheDocument();
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it("should show an empty state when there are no favorites", async () => {
    vi.spyOn(CoreAPI, "mediaSearch").mockResolvedValue(favoritesResponse([]));

    render(<LibraryFavorites />);

    expect(await screen.findByText("library.noFavorites")).toBeInTheDocument();
    expect(screen.getByText("library.noFavoritesHint")).toBeInTheDocument();
  });
});
