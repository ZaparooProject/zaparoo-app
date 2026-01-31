/**
 * Integration Test: Create Search Page
 *
 * Tests the REAL Search component from src/routes/create.search.tsx including:
 * - Search form input handling
 * - System selector interactions
 * - Tag selector interactions
 * - Search execution
 * - Game details modal
 * - Recent searches functionality
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "../../test-utils";
import userEvent from "@testing-library/user-event";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { SystemsResponse } from "@/lib/models";

// Mock loader data
const mockLoaderData = {
  systemQuery: "all",
  tagQuery: [] as string[],
  systems: {
    systems: [
      { id: "nes", name: "Nintendo Entertainment System", category: "console" },
      { id: "snes", name: "Super Nintendo", category: "console" },
      { id: "genesis", name: "Sega Genesis", category: "console" },
    ],
  } as SystemsResponse,
};

// Mock the router with Route.useLoaderData
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useRouter: vi.fn(() => ({
      history: {
        back: vi.fn(),
      },
    })),
    createFileRoute: vi.fn(() => {
      // createFileRoute returns a function that returns the Route object
      return () => {
        const route = {
          component: null,
          useLoaderData: () => mockLoaderData,
        };
        return route;
      };
    }),
  };
});

// Mock state that can be modified per-test
const mockState = {
  tagsQueryError: false,
  mediaResponse: null as { database: unknown } | null,
};

// Mock CoreAPI
vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    mediaSearch: vi.fn(),
    media: vi.fn(() => Promise.resolve(mockState.mediaResponse)),
    systems: vi.fn(),
    mediaTags: vi.fn(),
    run: vi.fn(),
  },
}));

// Mock useQuery
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useQuery: vi.fn(() => ({
      isError: mockState.tagsQueryError,
      data: null,
    })),
  };
});

// Mock useSmartSwipe
vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: vi.fn(() => ({})),
}));

// Mock useHaptics
vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: vi.fn(() => ({
    impact: vi.fn(),
    notification: vi.fn(),
    vibrate: vi.fn(),
  })),
}));

// Mock usePageHeadingFocus
vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

// Mock useNfcWriter
vi.mock("@/lib/writeNfcHook", () => ({
  useNfcWriter: vi.fn(() => ({
    write: vi.fn(),
    end: vi.fn(),
    status: null,
  })),
  WriteAction: {
    Write: "write",
  },
}));

// Mock useRecentSearches with state
const recentSearchesMocks = {
  addRecentSearch: vi.fn(),
  clearRecentSearches: vi.fn(),
};

vi.mock("@/hooks/useRecentSearches", () => ({
  useRecentSearches: vi.fn(() => ({
    recentSearches: [],
    addRecentSearch: recentSearchesMocks.addRecentSearch,
    clearRecentSearches: recentSearchesMocks.clearRecentSearches,
    getSearchDisplayText: (search: { query: string }) =>
      search.query || "All games",
  })),
}));

// Mock Capacitor Preferences
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock Capacitor Clipboard
vi.mock("@capacitor/clipboard", () => ({
  Clipboard: {
    write: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock clipboard API (using configurable to allow userEvent to override)
if (!navigator.clipboard) {
  Object.defineProperty(navigator, "clipboard", {
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
    writable: true,
    configurable: true,
  });
}

// Import the REAL component after mocks are set up
import { Search } from "@/routes/create.search";

describe("Create Search Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset stores to initial state
    useStatusStore.setState({
      ...useStatusStore.getInitialState(),
      connected: true,
      connectionState: ConnectionState.CONNECTED,
      gamesIndex: {
        exists: true,
        indexing: false,
        totalSteps: 0,
        currentStep: 0,
        currentStepDisplay: "",
        totalFiles: 100,
      },
    });
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
      showFilenames: false,
    });

    // Reset mock state
    mockState.tagsQueryError = false;
    mockState.mediaResponse = {
      database: {
        exists: true,
        indexing: false,
        totalSteps: 0,
        currentStep: 0,
        currentStepDisplay: "",
        totalFiles: 100,
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Page Structure", () => {
    it("should render the search page with header and title", () => {
      render(<Search />);

      expect(
        screen.getByRole("heading", { name: /create.search.title/i }),
      ).toBeInTheDocument();
    });

    it("should render back button in header", () => {
      render(<Search />);

      expect(
        screen.getByRole("button", { name: /nav.back/i }),
      ).toBeInTheDocument();
    });

    it("should render search input with label and placeholder", () => {
      render(<Search />);

      expect(
        screen.getByPlaceholderText(/create.search.gameInputPlaceholder/i),
      ).toBeInTheDocument();
    });

    it("should render search button", () => {
      render(<Search />);

      expect(
        screen.getByRole("button", { name: /create.search.searchButton/i }),
      ).toBeInTheDocument();
    });

    it("should render system selector trigger", () => {
      render(<Search />);

      expect(
        screen.getByText(/create.search.systemInput/i),
      ).toBeInTheDocument();
    });

    it("should render tag selector trigger", () => {
      render(<Search />);

      expect(screen.getByText(/create.search.tagsInput/i)).toBeInTheDocument();
    });
  });

  describe("Search Form Interaction", () => {
    it("should update search input value when typing", async () => {
      const user = userEvent.setup();
      render(<Search />);

      const searchInput = screen.getByPlaceholderText(
        /create.search.gameInputPlaceholder/i,
      );
      await user.type(searchInput, "mario");

      expect(searchInput).toHaveValue("mario");
    });

    it("should enable search button when connected and index exists", () => {
      render(<Search />);

      const searchButton = screen.getByRole("button", {
        name: /create.search.searchButton/i,
      });
      expect(searchButton).not.toBeDisabled();
    });

    it("should disable search button when not connected", () => {
      useStatusStore.setState({ connected: false });

      render(<Search />);

      const searchButton = screen.getByRole("button", {
        name: /create.search.searchButton/i,
      });
      expect(searchButton).toBeDisabled();
    });

    // Note: Testing "games index does not exist" state requires full router
    // context due to Link component rendering, so it's tested elsewhere.

    it("should disable search button when indexing is in progress", () => {
      useStatusStore.setState({
        gamesIndex: {
          exists: true,
          indexing: true,
          totalSteps: 10,
          currentStep: 5,
          currentStepDisplay: "Processing...",
          totalFiles: 100,
        },
      });

      render(<Search />);

      const searchButton = screen.getByRole("button", {
        name: /create.search.searchButton/i,
      });
      expect(searchButton).toBeDisabled();
    });

    it("should disable search input when not connected", () => {
      useStatusStore.setState({ connected: false });

      render(<Search />);

      const searchInput = screen.getByPlaceholderText(
        /create.search.gameInputPlaceholder/i,
      );
      expect(searchInput).toBeDisabled();
    });
  });

  describe("Search Execution", () => {
    it("should add to recent searches when search is performed", async () => {
      const user = userEvent.setup();
      render(<Search />);

      const searchInput = screen.getByPlaceholderText(
        /create.search.gameInputPlaceholder/i,
      );
      await user.type(searchInput, "zelda");

      const searchButton = screen.getByRole("button", {
        name: /create.search.searchButton/i,
      });
      await user.click(searchButton);

      await waitFor(() => {
        expect(recentSearchesMocks.addRecentSearch).toHaveBeenCalledWith({
          query: "zelda",
          system: "all",
          tags: [],
        });
      });
    });

    it("should trigger search on Enter key press", async () => {
      const user = userEvent.setup();
      render(<Search />);

      const searchInput = screen.getByPlaceholderText(
        /create.search.gameInputPlaceholder/i,
      );
      await user.type(searchInput, "sonic{Enter}");

      await waitFor(() => {
        expect(recentSearchesMocks.addRecentSearch).toHaveBeenCalled();
      });
    });
  });

  describe("Search Area", () => {
    it("should have search region with accessible label", () => {
      render(<Search />);

      const searchRegion = screen.getByRole("search", {
        name: /create.search.title/i,
      });
      expect(searchRegion).toBeInTheDocument();
    });
  });

  describe("Recent Searches Button", () => {
    it("should render recent searches button in header", () => {
      render(<Search />);

      expect(
        screen.getByRole("button", { name: /create.search.recentSearches/i }),
      ).toBeInTheDocument();
    });

    it("should disable recent searches button when no searches", () => {
      render(<Search />);

      const recentButton = screen.getByRole("button", {
        name: /create.search.recentSearches/i,
      });
      expect(recentButton).toBeDisabled();
    });
  });

  describe("Clearable Input", () => {
    it("should show clear button when search input has value", async () => {
      const user = userEvent.setup();
      render(<Search />);

      const searchInput = screen.getByPlaceholderText(
        /create.search.gameInputPlaceholder/i,
      );
      await user.type(searchInput, "test");

      // Clear button should appear
      const clearButton = screen.getByRole("button", { name: /clear/i });
      expect(clearButton).toBeInTheDocument();
    });

    it("should clear input when clear button is clicked", async () => {
      const user = userEvent.setup();
      render(<Search />);

      const searchInput = screen.getByPlaceholderText(
        /create.search.gameInputPlaceholder/i,
      );
      await user.type(searchInput, "test");

      const clearButton = screen.getByRole("button", { name: /clear/i });
      await user.click(clearButton);

      expect(searchInput).toHaveValue("");
    });
  });
});
