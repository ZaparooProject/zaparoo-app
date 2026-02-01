import { render, screen, fireEvent, waitFor } from "../../../test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MediaSearchModal } from "@/components/MediaSearchModal";

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
    get: vi.fn().mockResolvedValue({ value: "all" }),
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
  useStatusStore: vi.fn((selector) => {
    const state = {
      connected: true,
      gamesIndex: { exists: true, indexing: false },
      safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
    };
    return selector ? selector(state) : state;
  }),
}));

vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    systems: vi.fn().mockResolvedValue({
      systems: [
        { id: "snes", name: "Super Nintendo" },
        { id: "genesis", name: "Sega Genesis" },
      ],
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
    hasSearched,
    setSelectedResult,
  }: {
    query: string;
    hasSearched: boolean;
    setSelectedResult: (
      result: { path: string; zapScript?: string } | null,
    ) => void;
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
        <button
          data-testid="result-0"
          onClick={() =>
            setSelectedResult({
              path: "/games/mario.sfc",
              zapScript: "**launch:/games/mario.sfc",
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

  it("should call onSelect and close when result is selected", async () => {
    render(
      <MediaSearchModal
        isOpen={true}
        close={mockClose}
        onSelect={mockOnSelect}
      />,
    );

    // Enter search query and trigger search
    const searchInput = screen.getByPlaceholderText(
      "create.search.gameInputPlaceholder",
    );
    fireEvent.change(searchInput, { target: { value: "mario" } });

    const searchButton = screen.getByRole("button", {
      name: /create\.search\.searchButton/i,
    });
    fireEvent.click(searchButton);

    // Wait for search results
    await waitFor(() => {
      expect(screen.getByTestId("result-0")).toBeInTheDocument();
    });

    // Click on a result
    fireEvent.click(screen.getByTestId("result-0"));

    expect(mockOnSelect).toHaveBeenCalledWith("**launch:/games/mario.sfc");
    expect(mockClose).toHaveBeenCalled();
  });

  it("should not render modal content when closed (aria-hidden)", () => {
    render(
      <MediaSearchModal
        isOpen={false}
        close={mockClose}
        onSelect={mockOnSelect}
      />,
    );

    // Modal should have aria-hidden when closed
    const modal = screen.getByRole("dialog", { hidden: true });
    expect(modal).toHaveAttribute("aria-hidden", "true");
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
