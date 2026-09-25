import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "../../../test-utils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MediaSearchModal } from "@/components/MediaSearchModal";
import type { SearchResultGame } from "@/lib/models";

const mockStoreState = {
  connected: true,
  coreVersion: "2.18.0",
  coreVersionPending: false,
  gamesIndex: { exists: true, indexing: false },
  safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
};

// Mock external hooks and plugins
vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({
    impact: vi.fn(),
    notification: vi.fn(),
    vibrate: vi.fn(),
  }),
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
  },
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn(),
  },
}));

vi.mock("use-debounce", () => ({
  useDebounce: (value: string) => [value, vi.fn()],
  useDebouncedCallback: <T extends (...args: unknown[]) => unknown>(
    callback: T,
  ) => {
    const fn = (...args: unknown[]) => callback(...args);
    fn.cancel = vi.fn();
    fn.flush = vi.fn();
    fn.isPending = vi.fn(() => false);
    return fn;
  },
}));

vi.mock("@/lib/store", () => ({
  useStatusStore: vi.fn((selector) =>
    selector ? selector(mockStoreState) : mockStoreState,
  ),
}));

vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    systems: vi.fn().mockResolvedValue({
      systems: [
        { id: "snes", name: "Super Nintendo" },
        { id: "genesis", name: "Sega Genesis" },
      ],
    }),
    mediaTags: vi.fn().mockResolvedValue({
      tags: [{ tag: "Platformer", type: "genre" }],
    }),
    mediaSearch: vi.fn().mockResolvedValue({
      results: [
        {
          path: "/games/mario.sfc",
          name: "Super Mario World",
          systemName: "Super Nintendo",
        },
      ],
      total: 1,
      pagination: {
        nextCursor: null,
        hasNextPage: false,
        pageSize: 1,
      },
    }),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock VirtualSearchResults since it's a complex component with its own tests
// This allows us to test MediaSearchModal's behavior in isolation
vi.mock("@/components/VirtualSearchResults", () => ({
  VirtualSearchResults: ({
    query,
    tags,
    hasSearched,
    setSelectedResult,
  }: {
    query: string;
    tags: string[];
    hasSearched: boolean;
    setSelectedResult: (result: SearchResultGame | null) => void;
  }) => {
    if (!hasSearched) {
      return (
        <div data-testid="search-results-empty">
          <p>create.search.startSearching</p>
          <p>create.search.startSearchingHint</p>
        </div>
      );
    }

    return (
      <div data-testid="search-results">
        <p>Search results for: {query}</p>
        <p>Filtered by: {tags.join(", ")}</p>
        <button
          data-testid="result-0"
          onClick={() =>
            setSelectedResult({
              mediaId: 42,
              system: { id: "snes", name: "Super Nintendo" },
              name: "Super Mario World",
              path: "/games/mario.sfc",
              zapScript: "**launch:/games/mario.sfc",
              tags: [],
            })
          }
        >
          Super Mario World
        </button>
      </div>
    );
  },
}));

describe("MediaSearchModal", () => {
  const mockClose = vi.fn();
  const mockOnSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState.connected = true;
    mockStoreState.coreVersion = "2.18.0";
    mockStoreState.coreVersionPending = false;
    mockStoreState.gamesIndex = { exists: true, indexing: false };
  });

  it("should render when open", () => {
    render(
      <MediaSearchModal
        isOpen={true}
        close={mockClose}
        onSelect={mockOnSelect}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Modal title appears in the dialog
    const titles = screen.getAllByText("create.search.title");
    expect(titles.length).toBeGreaterThan(0);
  });

  it("should render search input with correct placeholder", () => {
    render(
      <MediaSearchModal
        isOpen={true}
        close={mockClose}
        onSelect={mockOnSelect}
      />,
    );

    const searchInput = screen.getByPlaceholderText(
      "create.search.gameInputPlaceholder",
    );
    expect(searchInput).toBeInTheDocument();
  });

  it("should render search button", () => {
    render(
      <MediaSearchModal
        isOpen={true}
        close={mockClose}
        onSelect={mockOnSelect}
      />,
    );

    expect(
      screen.getByRole("button", { name: /create\.search\.searchButton/i }),
    ).toBeInTheDocument();
  });

  it("should show initial state before searching", () => {
    render(
      <MediaSearchModal
        isOpen={true}
        close={mockClose}
        onSelect={mockOnSelect}
      />,
    );

    // Should show the initial hint
    expect(
      screen.getByText("create.search.startSearching"),
    ).toBeInTheDocument();
  });

  it("should handle search input changes", () => {
    render(
      <MediaSearchModal
        isOpen={true}
        close={mockClose}
        onSelect={mockOnSelect}
      />,
    );

    const searchInput = screen.getByPlaceholderText(
      "create.search.gameInputPlaceholder",
    );
    fireEvent.change(searchInput, { target: { value: "mario" } });

    expect(searchInput).toHaveValue("mario");
  });

  it("should trigger search when button is clicked", async () => {
    render(
      <MediaSearchModal
        isOpen={true}
        close={mockClose}
        onSelect={mockOnSelect}
      />,
    );

    // Enter search query
    const searchInput = screen.getByPlaceholderText(
      "create.search.gameInputPlaceholder",
    );
    fireEvent.change(searchInput, { target: { value: "mario" } });

    // Click search button
    const searchButton = screen.getByRole("button", {
      name: /create\.search\.searchButton/i,
    });
    fireEvent.click(searchButton);

    // Wait for search results to appear
    await waitFor(() => {
      expect(screen.getByTestId("search-results")).toBeInTheDocument();
    });

    // Verify search query is passed to results
    expect(screen.getByText("Search results for: mario")).toBeInTheDocument();
  });

  it("filters search results with selected tags in the shared modal", async () => {
    const user = userEvent.setup();
    render(
      <MediaSearchModal isOpen close={mockClose} onSelect={mockOnSelect} />,
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
    await user.click(
      screen.getByRole("button", { name: "create.search.searchButton" }),
    );
    expect(
      await screen.findByText("Filtered by: genre:Platformer"),
    ).toBeInTheDocument();
  });

  it("hides tag filters on Core versions without known support", async () => {
    mockStoreState.coreVersion = "2.6.9";
    render(
      <MediaSearchModal isOpen close={mockClose} onSelect={mockOnSelect} />,
    );
    expect(
      screen.queryByRole("button", { name: "create.search.tagsInput" }),
    ).not.toBeInTheDocument();
  });

  it("should allow search while indexing", async () => {
    const user = userEvent.setup();
    mockStoreState.gamesIndex = { exists: true, indexing: true };

    render(
      <MediaSearchModal
        isOpen={true}
        close={mockClose}
        onSelect={mockOnSelect}
      />,
    );

    const searchInput = screen.getByPlaceholderText(
      "create.search.gameInputPlaceholder",
    );
    await user.type(searchInput, "mario");

    const searchButton = screen.getByRole("button", {
      name: /create\.search\.searchButton/i,
    });
    expect(searchButton).toBeEnabled();
    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeEnabled();
    });
    await user.click(searchButton);

    expect(await screen.findByTestId("search-results")).toBeInTheDocument();
  });

  it("should stay disabled when indexing has no usable data", async () => {
    mockStoreState.gamesIndex = { exists: false, indexing: true };

    render(
      <MediaSearchModal
        isOpen={true}
        close={mockClose}
        onSelect={mockOnSelect}
      />,
    );

    expect(
      screen.getByPlaceholderText("create.search.gameInputPlaceholder"),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /create\.search\.searchButton/i }),
    ).toBeDisabled();
    expect(await screen.findByRole("combobox")).toBeDisabled();
  });

  it("passes the indexed result directly to a quick-add consumer without showing a write target", async () => {
    const user = userEvent.setup();
    const onSelectMedia = vi.fn();
    const onAddCustom = vi.fn();
    render(
      <MediaSearchModal
        isOpen
        close={mockClose}
        onSelectMedia={onSelectMedia}
        onAddCustom={onAddCustom}
      />,
    );

    await user.type(
      screen.getByRole("searchbox", { name: "create.search.gameInput" }),
      "mario",
    );
    await user.click(
      screen.getByRole("button", { name: "create.search.searchButton" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Super Mario World" }),
    );

    expect(onSelectMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaId: 42,
        name: "Super Mario World",
        path: "/games/mario.sfc",
        system: { id: "snes", name: "Super Nintendo" },
      }),
    );
    expect(
      screen.queryByRole("radio", { name: "create.search.zapscriptLabel" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "decks.addCustomScript" }),
    );
    expect(onAddCustom).toHaveBeenCalledOnce();
  });

  it("should default to ZapScript and insert it after confirmation", async () => {
    const user = userEvent.setup();
    render(
      <MediaSearchModal
        isOpen={true}
        close={mockClose}
        onSelect={mockOnSelect}
      />,
    );

    const searchInput = screen.getByRole("searchbox", {
      name: "create.search.gameInput",
    });
    await user.type(searchInput, "mario");
    await user.click(
      screen.getByRole("button", {
        name: /create\.search\.searchButton/i,
      }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Super Mario World" }),
    );

    const zapScriptRadio = await screen.findByRole("radio", {
      name: /create\.search\.zapscriptLabel/i,
    });
    expect(zapScriptRadio).toBeChecked();
    expect(mockOnSelect).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "create.custom.insert" }),
    );

    expect(mockOnSelect).toHaveBeenCalledWith("**launch:/games/mario.sfc");
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it("should allow selecting and inserting the media path", async () => {
    const user = userEvent.setup();
    render(
      <MediaSearchModal
        isOpen={true}
        close={mockClose}
        onSelect={mockOnSelect}
      />,
    );

    const searchInput = screen.getByRole("searchbox", {
      name: "create.search.gameInput",
    });
    await user.type(searchInput, "mario");
    await user.click(
      screen.getByRole("button", {
        name: /create\.search\.searchButton/i,
      }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Super Mario World" }),
    );
    await user.click(
      await screen.findByRole("radio", {
        name: /create\.search\.pathLabel/i,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "create.custom.insert" }),
    );

    expect(mockOnSelect).toHaveBeenCalledWith("/games/mario.sfc");
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it("should hide all modal content when closed", () => {
    render(
      <MediaSearchModal
        isOpen={false}
        close={mockClose}
        onSelect={mockOnSelect}
      />,
    );

    const modals = screen.getAllByRole("dialog", { hidden: true });
    expect(modals).toHaveLength(3);
    expect(
      modals.every((modal) => modal.getAttribute("aria-hidden") === "true"),
    ).toBe(true);
  });

  it("should trigger search on Enter key press", async () => {
    render(
      <MediaSearchModal
        isOpen={true}
        close={mockClose}
        onSelect={mockOnSelect}
      />,
    );

    const searchInput = screen.getByPlaceholderText(
      "create.search.gameInputPlaceholder",
    );
    fireEvent.change(searchInput, { target: { value: "mario" } });
    fireEvent.keyUp(searchInput, { key: "Enter", code: "Enter" });

    // Wait for search results to appear
    await waitFor(() => {
      expect(screen.getByTestId("search-results")).toBeInTheDocument();
    });
  });
});
