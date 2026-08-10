import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@/test-utils";
import { CoreAPI } from "@/lib/coreApi";
import type { SearchResultsResponse } from "@/lib/models";
import { useLibrarySessionStore } from "@/lib/librarySessionStore";
import { useStatusStore } from "@/lib/store";
import { LibraryFavorites } from "@/routes/library.favorites";

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
  beforeEach(() => {
    vi.restoreAllMocks();
    CoreAPI.reset();
    mockNavigate.mockClear();
    useLibrarySessionStore.getState().reset();
    useStatusStore.setState({
      connected: true,
      targetDeviceAddress: "device-a",
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

  it("should show an empty state when there are no favorites", async () => {
    vi.spyOn(CoreAPI, "mediaSearch").mockResolvedValue(favoritesResponse([]));

    render(<LibraryFavorites />);

    expect(await screen.findByText("library.noFavorites")).toBeInTheDocument();
    expect(screen.getByText("library.noFavoritesHint")).toBeInTheDocument();
  });
});
