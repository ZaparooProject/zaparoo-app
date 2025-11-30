import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MediaSearchModal } from "@/components/MediaSearchModal";
import "@/test-setup";

// Mock dependencies
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: "all" }),
    set: vi.fn(),
  },
}));

vi.mock("use-debounce", () => ({
  useDebounce: (value: string) => [value, vi.fn()],
}));

vi.mock("@/lib/store", () => ({
  useStatusStore: vi.fn((selector) => {
    const state = {
      connected: true,
      gamesIndex: { exists: true, indexing: false },
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

vi.mock("@/components/SlideModal", () => ({
  SlideModal: ({ isOpen, close, children, title }: any) => (
    <div data-testid="slide-modal" data-open={isOpen} data-title={title}>
      <button onClick={close} data-testid="close-button">
        Close
      </button>
      {children}
    </div>
  ),
}));

vi.mock("@/components/wui/TextInput", () => ({
  TextInput: ({ value, setValue, placeholder, ref }: any) => (
    <input
      ref={ref}
      data-testid="search-input"
      value={value}
      onChange={(e) => setValue?.(e.target.value)}
      placeholder={placeholder}
    />
  ),
}));

vi.mock("@/components/VirtualSearchResults", () => ({
  VirtualSearchResults: ({
    query: _query,
    systems: _systems,
    selectedResult: _selectedResult,
    setSelectedResult,
    hasSearched,
  }: any) => {
    if (!hasSearched) {
      return (
        <div className="mt-6 text-center text-white/60">
          <p className="mb-2 text-lg">create.search.startSearching</p>
          <p className="text-sm">create.search.startSearchingHint</p>
        </div>
      );
    }

    return (
      <div data-testid="search-results">
        <button
          key={0}
          data-testid="result-0"
          onClick={() =>
            setSelectedResult?.({
              path: "/games/mario.sfc",
              name: "Super Mario World",
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

vi.mock("@/components/BackToTop", () => ({
  BackToTop: () => <div data-testid="back-to-top" />,
}));

vi.mock("@/components/SystemSelector", () => ({
  SystemSelector: ({ isOpen }: any) =>
    isOpen ? <div data-testid="system-selector-modal" /> : null,
  SystemSelectorTrigger: ({ selectedSystems, placeholder, onClick }: any) => (
    <button data-testid="system-selector-trigger" onClick={onClick}>
      {selectedSystems.length > 0 ? selectedSystems[0] : placeholder}
    </button>
  ),
}));

describe("MediaSearchModal", () => {
  const mockClose = vi.fn();
  const mockOnSelect = vi.fn();
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  const renderComponent = (props = {}) => {
    const defaultProps = {
      isOpen: true,
      close: mockClose,
      onSelect: mockOnSelect,
      ...props,
    };

    return render(
      <QueryClientProvider client={queryClient}>
        <MediaSearchModal {...defaultProps} />
      </QueryClientProvider>,
    );
  };

  it("should render when open", () => {
    renderComponent();

    const modal = screen.getByTestId("slide-modal");
    expect(modal).toHaveAttribute("data-open", "true");
    expect(modal).toHaveAttribute("data-title", "create.search.title");
  });

  it("should render search input", () => {
    renderComponent();

    const searchInput = screen.getByTestId("search-input");
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toHaveAttribute(
      "placeholder",
      "create.search.gameInputPlaceholder",
    );
  });

  it("should render search results component", async () => {
    renderComponent();

    // Enter search query
    const searchInput = screen.getByTestId("search-input");
    fireEvent.change(searchInput, { target: { value: "mario" } });

    // Click search button to trigger search
    const searchButton = screen.getByRole("button", {
      name: /create.search.searchButton/i,
    });
    fireEvent.click(searchButton);

    // Wait for search results to appear
    await waitFor(() => {
      expect(screen.getByTestId("search-results")).toBeInTheDocument();
    });
  });

  it("should render back to top component", () => {
    renderComponent();

    expect(screen.getByTestId("back-to-top")).toBeInTheDocument();
  });

  it("should handle search input changes", async () => {
    renderComponent();

    const searchInput = screen.getByTestId("search-input");
    fireEvent.change(searchInput, { target: { value: "mario" } });

    await waitFor(() => {
      expect(searchInput).toHaveValue("mario");
    });
  });

  it("should call onSelect when result is selected", async () => {
    renderComponent();

    // Enter search query to trigger search
    const searchInput = screen.getByTestId("search-input");
    fireEvent.change(searchInput, { target: { value: "mario" } });

    // Click search button to trigger search
    const searchButton = screen.getByRole("button", {
      name: /create.search.searchButton/i,
    });
    fireEvent.click(searchButton);

    // Wait for search results to load and contain results
    await waitFor(() => {
      expect(screen.getByTestId("result-0")).toBeInTheDocument();
    });

    // Simulate selecting a result
    const resultButton = screen.getByTestId("result-0");
    fireEvent.click(resultButton);

    expect(mockOnSelect).toHaveBeenCalledWith("**launch:/games/mario.sfc");
  });

  it("should not render when closed", () => {
    renderComponent({ isOpen: false });

    const modal = screen.getByTestId("slide-modal");
    expect(modal).toHaveAttribute("data-open", "false");
  });
});
