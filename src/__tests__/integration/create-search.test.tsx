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
import { render, screen, waitFor, act } from "../../test-utils";
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
const mockClipboardWrite = vi.fn().mockResolvedValue(undefined);
vi.mock("@capacitor/clipboard", () => ({
  Clipboard: {
    write: mockClipboardWrite,
  },
}));

// Track selected result for VirtualSearchResults mock - using hoisted to ensure availability
const { mockVirtualSearchResults } = vi.hoisted(() => ({
  mockVirtualSearchResults: {
    selectedResult: null as unknown,
    setSelectedResult: null as ((result: unknown) => void) | null,
  },
}));

// Mock VirtualSearchResults to allow us to simulate selecting a game
vi.mock("@/components/VirtualSearchResults", () => ({
  VirtualSearchResults: ({
    selectedResult,
    setSelectedResult,
  }: {
    selectedResult: unknown;
    setSelectedResult: (result: unknown) => void;
  }) => {
    mockVirtualSearchResults.selectedResult = selectedResult;
    mockVirtualSearchResults.setSelectedResult = setSelectedResult;
    return <div data-testid="virtual-search-results">Search Results</div>;
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

    // Reset VirtualSearchResults mock state
    mockVirtualSearchResults.selectedResult = null;
    mockVirtualSearchResults.setSelectedResult = null;
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

  describe("Game Details Modal", () => {
    // Helper to select a game via the mocked VirtualSearchResults
    const selectGame = async (game: unknown) => {
      await waitFor(() => {
        expect(mockVirtualSearchResults.setSelectedResult).not.toBeNull();
      });
      await act(async () => {
        mockVirtualSearchResults.setSelectedResult?.(game);
      });
    };

    const mockGameWithZapscript = {
      name: "Super Mario Bros",
      path: "/games/nes/smb.nes",
      system: {
        id: "nes",
        name: "Nintendo Entertainment System",
        category: "console",
      },
      zapScript: "**launch:nes/smb",
      tags: [
        { type: "genre", tag: "platformer" },
        { type: "year", tag: "1985" },
      ],
    };

    const mockGameWithoutZapscript = {
      name: "Sonic the Hedgehog",
      path: "/games/genesis/sonic.md",
      system: {
        id: "genesis",
        name: "Sega Genesis",
        category: "console",
      },
      zapScript: null,
      tags: [],
    };

    it("should open game details modal when a game is selected", async () => {
      render(<Search />);

      await selectGame(mockGameWithZapscript);

      // The modal should now be visible with game details
      expect(screen.getAllByText("Super Mario Bros").length).toBeGreaterThan(0);
    });

    it("should display system info in modal", async () => {
      render(<Search />);

      await selectGame(mockGameWithZapscript);

      expect(
        screen.getByText(/Nintendo Entertainment System/),
      ).toBeInTheDocument();
    });

    it("should display tags when game has tags", async () => {
      render(<Search />);

      await selectGame(mockGameWithZapscript);

      expect(screen.getByText(/platformer/)).toBeInTheDocument();
      expect(screen.getByText(/1985/)).toBeInTheDocument();
    });

    it("should display path option radio button", async () => {
      render(<Search />);

      await selectGame(mockGameWithZapscript);

      const pathRadio = screen.getByRole("radio", { name: /pathLabel/i });
      expect(pathRadio).toBeInTheDocument();
    });

    it("should display ZapScript option when game has zapScript", async () => {
      render(<Search />);

      await selectGame(mockGameWithZapscript);

      const zapscriptRadio = screen.getByRole("radio", {
        name: /zapscriptLabel/i,
      });
      expect(zapscriptRadio).toBeInTheDocument();
    });

    it("should not display ZapScript option when game has no zapScript", async () => {
      render(<Search />);

      await selectGame(mockGameWithoutZapscript);

      expect(screen.getAllByText("Sonic the Hedgehog").length).toBeGreaterThan(
        0,
      );

      // Should not have zapScript radio
      expect(
        screen.queryByRole("radio", { name: /zapscriptLabel/i }),
      ).not.toBeInTheDocument();
    });

    it("should render write button", async () => {
      render(<Search />);

      await selectGame(mockGameWithZapscript);

      expect(
        screen.getByRole("button", { name: /create.search.writeLabel/i }),
      ).toBeInTheDocument();
    });

    it("should render copy button", async () => {
      render(<Search />);

      await selectGame(mockGameWithZapscript);

      expect(
        screen.getByRole("button", { name: /create.search.copyLabel/i }),
      ).toBeInTheDocument();
    });

    it("should render play button", async () => {
      render(<Search />);

      await selectGame(mockGameWithZapscript);

      expect(
        screen.getByRole("button", { name: /create.search.playLabel/i }),
      ).toBeInTheDocument();
    });

    it("should close modal when deselecting result", async () => {
      render(<Search />);

      // Open modal
      await selectGame(mockGameWithZapscript);
      expect(screen.getAllByText("Super Mario Bros").length).toBeGreaterThan(0);

      // Verify modal is open (dialog is accessible)
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      // Close modal
      await act(async () => {
        mockVirtualSearchResults.setSelectedResult?.(null);
      });

      // Verify modal is closed (dialog is no longer accessible since aria-hidden="true")
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("should default to zapScript mode when game has zapScript", async () => {
      render(<Search />);

      await selectGame(mockGameWithZapscript);

      const zapscriptRadio = screen.getByRole("radio", {
        name: /zapscriptLabel/i,
      });
      expect(zapscriptRadio).toBeChecked();
    });

    it("should default to path mode when game has no zapScript", async () => {
      render(<Search />);

      await selectGame(mockGameWithoutZapscript);

      const pathRadio = screen.getByRole("radio", { name: /pathLabel/i });
      expect(pathRadio).toBeChecked();
    });

    it("should switch write mode when clicking path option", async () => {
      const user = userEvent.setup();
      render(<Search />);

      await selectGame(mockGameWithZapscript);

      expect(screen.getAllByText("Super Mario Bros").length).toBeGreaterThan(0);

      // Click path radio to switch mode
      const pathRadio = screen.getByRole("radio", { name: /pathLabel/i });
      await user.click(pathRadio);

      expect(pathRadio).toBeChecked();
    });

    it("should call CoreAPI.run with path when play button is clicked in path mode", async () => {
      const { CoreAPI } = await import("@/lib/coreApi");
      const user = userEvent.setup();
      render(<Search />);

      await selectGame(mockGameWithoutZapscript);

      expect(screen.getAllByText("Sonic the Hedgehog").length).toBeGreaterThan(
        0,
      );

      const playButton = screen.getByRole("button", {
        name: /create.search.playLabel/i,
      });
      await user.click(playButton);

      expect(CoreAPI.run).toHaveBeenCalledWith({
        uid: "",
        text: "/games/genesis/sonic.md",
      });
    });

    it("should call CoreAPI.run with zapScript when play button is clicked in zapScript mode", async () => {
      const { CoreAPI } = await import("@/lib/coreApi");
      const user = userEvent.setup();
      render(<Search />);

      await selectGame(mockGameWithZapscript);

      expect(screen.getAllByText("Super Mario Bros").length).toBeGreaterThan(0);

      // Default is zapScript mode
      const playButton = screen.getByRole("button", {
        name: /create.search.playLabel/i,
      });
      await user.click(playButton);

      expect(CoreAPI.run).toHaveBeenCalledWith({
        uid: "",
        text: "**launch:nes/smb",
      });
    });

    it("should disable play button when disconnected", async () => {
      render(<Search />);

      // Select a game first (while connected)
      await selectGame(mockGameWithZapscript);

      expect(screen.getAllByText("Super Mario Bros").length).toBeGreaterThan(0);

      // Now disconnect and check the button
      await act(async () => {
        useStatusStore.setState({ connected: false });
      });

      const playButton = screen.getByRole("button", {
        name: /create.search.playLabel/i,
      });
      expect(playButton).toBeDisabled();
    });

    it("should show game path in modal", async () => {
      render(<Search />);

      await selectGame(mockGameWithZapscript);

      expect(screen.getByText("/games/nes/smb.nes")).toBeInTheDocument();
    });

    it("should show zapScript value in modal when available", async () => {
      render(<Search />);

      await selectGame(mockGameWithZapscript);

      expect(screen.getByText("**launch:nes/smb")).toBeInTheDocument();
    });
  });
});
