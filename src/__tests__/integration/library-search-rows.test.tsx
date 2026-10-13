/**
 * Library search results use the artwork rows of Library browse and collection
 * lists, so switching a Library page to search never swaps the row design.
 * Create search keeps its plain rows.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@/test-utils";
import { CoreAPI } from "@/lib/coreApi";
import { requestLibraryImage } from "@/lib/libraryImages";
import type { SearchResultsResponse } from "@/lib/models";
import { useLibrarySessionStore } from "@/lib/librarySessionStore";
import { useStatusStore } from "@/lib/store";
import { LibraryGameSearch } from "@/components/library/LibraryGameSearch";
import { LibraryTaggedCollection } from "@/components/library/LibraryTaggedCollection";
import { VirtualSearchResults } from "@/components/VirtualSearchResults";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";
import { responsiveWindow } from "@/test-utils/responsiveWindow";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
    useNavigate: () => vi.fn(),
  };
});

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        key: index,
        index,
        size: 96,
        start: index * 96,
      })),
    getTotalSize: () => count * 96,
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

const game: SearchResultsResponse["results"][number] = {
  mediaId: 7,
  name: "Chrono Trigger",
  path: "/roms/SNES/Chrono Trigger.sfc",
  system: { id: "SNES", name: "Super Nintendo" },
  zapScript: "@SNES/Chrono Trigger",
  tags: [{ type: "user", tag: "favorite" }],
  disambiguatingTags: [{ type: "region", tag: "world" }],
};

const response: SearchResultsResponse = {
  results: [game],
  total: 1,
  pagination: { hasNextPage: false, nextCursor: null, pageSize: 100 },
};

/** The thumbnail request a Library row makes for this game on this device. */
const thumbnailRequest = [
  expect.objectContaining({
    path: game.path,
    mediaId: game.mediaId,
    systemId: "SNES",
  }),
  // Fallback system, unused because the entry carries its own.
  expect.any(String),
  expect.objectContaining({
    deviceKey: "device-a",
    maxSize: 128,
    priority: "thumbnail",
  }),
] as const;

async function runLibrarySearch(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "library.searchAction" }),
  );
  return screen.findByRole("button", { name: /Chrono Trigger/ });
}

describe("Library search result rows", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.mocked(requestLibraryImage).mockClear();
    vi.mocked(requestLibraryImage).mockResolvedValue(null);
    CoreAPI.reset();
    useLibrarySessionStore.getState().reset();
    await seedActiveDevice({ recordId: "device-a" });
    useStatusStore.setState({
      connected: true,
      coreVersion: "2.18.0",
      coreVersionPending: false,
      gamesIndex: { exists: true, indexing: false },
    });
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [{ id: "SNES", name: "Super Nintendo" }],
    });
    vi.spyOn(CoreAPI, "mediaSearch").mockResolvedValue(response);
    vi.spyOn(CoreAPI, "mediaMeta").mockResolvedValue({
      media: {
        path: game.path,
        parentDir: "/roms/SNES",
        isMissing: false,
        tags: [],
        properties: {},
        title: {
          slug: "chrono-trigger",
          name: "Chrono Trigger",
          slugLength: 14,
          slugWordCount: 2,
          system: { id: "SNES", name: "Super Nintendo" },
          tags: [],
          properties: {},
        },
      },
    });
  });

  it("shows a Library search result with its artwork, system name and favourite mark", async () => {
    const user = userEvent.setup();
    render(<LibraryGameSearch />);

    const row = await runLibrarySearch(user);

    expect(within(row).getByText("SNES")).toBeInTheDocument();
    expect(
      within(row).getByRole("img", { name: "library.favorite" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(requestLibraryImage).toHaveBeenCalledWith(...thumbnailRequest),
    );
  });

  it("opens the Library details for a selected result", async () => {
    const user = userEvent.setup();
    render(<LibraryGameSearch />);

    await user.click(await runLibrarySearch(user));

    expect(
      await screen.findByRole("dialog", { name: "Chrono Trigger" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "library.launch" }),
    ).toBeInTheDocument();
  });

  it("marks the selected result current beside the docked details", async () => {
    responsiveWindow(1400);
    const user = userEvent.setup();
    render(<LibraryGameSearch />);
    const row = await runLibrarySearch(user);
    expect(row).not.toHaveAttribute("aria-current");

    await user.click(row);

    await waitFor(() => expect(row).toHaveAttribute("aria-current", "true"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "library.launch" }),
    ).toBeInTheDocument();
  });

  it("keeps the same row when a collection switches to search", async () => {
    const user = userEvent.setup();
    render(<LibraryTaggedCollection collection="favorites" />);
    const browseRow = await screen.findByRole("button", {
      name: /Chrono Trigger/,
    });
    const browseRowText = browseRow.textContent;
    expect(within(browseRow).getByText("SNES")).toBeInTheDocument();
    await waitFor(() =>
      expect(requestLibraryImage).toHaveBeenCalledWith(...thumbnailRequest),
    );

    await user.click(
      screen.getByRole("button", { name: "library.searchFavorites" }),
    );
    const searchRow = await runLibrarySearch(user);

    // Same title, system line, tag summary and favourite mark, in one button.
    expect(searchRow.textContent).toBe(browseRowText);
    expect(
      within(searchRow).getByRole("img", { name: "library.favorite" }),
    ).toBeInTheDocument();
    // The search row asks for the same device-scoped thumbnail, so it is
    // served from the browse row's request rather than fetched again.
    expect(requestLibraryImage).toHaveBeenCalledTimes(1);
  });

  it("leaves Create search rows as plain rows without artwork", async () => {
    const scroller = document.createElement("div");
    render(
      <VirtualSearchResults
        query="chrono"
        systems={[]}
        hasSearched
        selectedResult={null}
        setSelectedResult={vi.fn()}
        scrollContainerRef={{ current: scroller }}
      />,
    );

    const row = await screen.findByRole("button", { name: /Chrono Trigger/ });

    expect(within(row).getByText("SNES")).toBeInTheDocument();
    expect(requestLibraryImage).not.toHaveBeenCalled();
  });
});
