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

// Mock useNfcWriter with trackable mock - hoisted below
vi.mock("@/lib/writeNfcHook", () => ({
  useNfcWriter: vi.fn(() => mockNfcWriter),
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

// Mock Capacitor Preferences with trackable mocks
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: mockPreferencesSet,
  },
}));

// Mock Capacitor Clipboard
vi.mock("@capacitor/clipboard", () => ({
  Clipboard: {
    write: mockClipboardWrite,
  },
}));

// Track selected result for VirtualSearchResults mock - using hoisted to ensure availability
const {
  mockVirtualSearchResults,
  mockSelectorCallbacks,
  mockPreferencesSet,
  mockClipboardWrite,
  mockNfcWriter,
} = vi.hoisted(() => ({
  mockVirtualSearchResults: {
    selectedResult: null as unknown,
    setSelectedResult: null as ((result: unknown) => void) | null,
  },
  mockSelectorCallbacks: {
    systemOnSelect: null as ((systems: string[]) => void) | null,
    tagOnSelect: null as ((tags: string[]) => void) | null,
    recentSearchOnSelect: null as ((search: unknown) => void) | null,
    onClearFilters: null as (() => void) | null,
  },
  mockPreferencesSet: vi.fn().mockResolvedValue(undefined),
  mockClipboardWrite: vi.fn().mockResolvedValue(undefined),
  mockNfcWriter: {
    write: vi.fn(),
    end: vi.fn(),
    status: null as string | null,
  },
}));

// Mock VirtualSearchResults to allow us to simulate selecting a game and capture onClearFilters
vi.mock("@/components/VirtualSearchResults", () => ({
  VirtualSearchResults: ({
    selectedResult,
    setSelectedResult,
    onClearFilters,
  }: {
    selectedResult: unknown;
    setSelectedResult: (result: unknown) => void;
    onClearFilters: () => void;
  }) => {
    mockVirtualSearchResults.selectedResult = selectedResult;
    mockVirtualSearchResults.setSelectedResult = setSelectedResult;
    mockSelectorCallbacks.onClearFilters = onClearFilters;
    return <div data-testid="virtual-search-results">Search Results</div>;
  },
}));

// Mock SystemSelector to capture onSelect callback
vi.mock("@/components/SystemSelector", () => ({
  SystemSelector: ({
    isOpen,
    onSelect,
    onClose,
  }: {
    isOpen: boolean;
    onSelect: (systems: string[]) => void;
    onClose: () => void;
  }) => {
    mockSelectorCallbacks.systemOnSelect = onSelect;
    return isOpen ? (
      <div data-testid="system-selector-modal">
        <button onClick={() => onSelect(["nes"])}>Select NES</button>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null;
  },
  SystemSelectorTrigger: ({
    onClick,
    selectedSystems,
  }: {
    onClick: () => void;
    selectedSystems: string[];
  }) => (
    <button data-testid="system-selector-trigger" onClick={onClick}>
      {selectedSystems.length > 0 ? selectedSystems.join(", ") : "All Systems"}
    </button>
  ),
}));

// Mock TagSelector to capture onSelect callback
vi.mock("@/components/TagSelector", () => ({
  TagSelector: ({
    isOpen,
    onSelect,
    onClose,
  }: {
    isOpen: boolean;
    onSelect: (tags: string[]) => void;
    onClose: () => void;
  }) => {
    mockSelectorCallbacks.tagOnSelect = onSelect;
    return isOpen ? (
      <div data-testid="tag-selector-modal">
        <button onClick={() => onSelect(["platformer", "action"])}>
          Select Tags
        </button>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null;
  },
  TagSelectorTrigger: ({
    onClick,
    selectedTags,
  }: {
    onClick: () => void;
    selectedTags: string[];
  }) => (
    <button data-testid="tag-selector-trigger" onClick={onClick}>
      {selectedTags.length > 0 ? selectedTags.join(", ") : "All Tags"}
    </button>
  ),
}));

// Mock RecentSearchesModal to capture onSearchSelect callback
vi.mock("@/components/RecentSearchesModal", () => ({
  RecentSearchesModal: ({
    isOpen,
    onSearchSelect,
    onClose,
  }: {
    isOpen: boolean;
    onSearchSelect: (search: unknown) => void;
    onClose: () => void;
  }) => {
    mockSelectorCallbacks.recentSearchOnSelect = onSearchSelect;
    return isOpen ? (
      <div data-testid="recent-searches-modal">
        <button
          onClick={() =>
            onSearchSelect({
              query: "mario",
              system: "nes",
              tags: ["platformer"],
            })
          }
        >
          Select Recent Search
        </button>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null;
  },
}));

// Hoisted mock for clipboard API
const { mockClipboardWriteText } = vi.hoisted(() => ({
  mockClipboardWriteText: vi.fn().mockResolvedValue(undefined),
}));

// Import the REAL component after mocks are set up
import { Search } from "@/routes/create.search";

describe("Create Search Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock navigator.clipboard.writeText - create clipboard if needed
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: mockClipboardWriteText },
        writable: true,
        configurable: true,
      });
    } else {
      vi.spyOn(navigator.clipboard, "writeText").mockImplementation(
        mockClipboardWriteText,
      );
    }

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

    // Reset selector callbacks
    mockSelectorCallbacks.systemOnSelect = null;
    mockSelectorCallbacks.tagOnSelect = null;
    mockSelectorCallbacks.recentSearchOnSelect = null;
    mockSelectorCallbacks.onClearFilters = null;

    // Reset NFC writer mock
    mockNfcWriter.write.mockClear();
    mockNfcWriter.end.mockClear();
    mockNfcWriter.status = null;

    // Reset preferences mock
    mockPreferencesSet.mockClear();

    // Reset clipboard mocks
    mockClipboardWrite.mockClear();
    mockClipboardWriteText.mockClear();
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

    it("should call nfcWriter.write with zapScript when write button clicked in zapScript mode", async () => {
      const user = userEvent.setup();
      render(<Search />);

      await selectGame(mockGameWithZapscript);

      const writeButton = screen.getByRole("button", {
        name: /create.search.writeLabel/i,
      });
      await user.click(writeButton);

      expect(mockNfcWriter.write).toHaveBeenCalledWith(
        "write",
        "**launch:nes/smb",
      );
    });

    it("should call nfcWriter.write with path when write button clicked in path mode", async () => {
      const user = userEvent.setup();
      render(<Search />);

      await selectGame(mockGameWithZapscript);

      // Switch to path mode
      const pathRadio = screen.getByRole("radio", { name: /pathLabel/i });
      await user.click(pathRadio);

      const writeButton = screen.getByRole("button", {
        name: /create.search.writeLabel/i,
      });
      await user.click(writeButton);

      expect(mockNfcWriter.write).toHaveBeenCalledWith(
        "write",
        "/games/nes/smb.nes",
      );
    });

    it("should copy zapScript to clipboard when copy button clicked in zapScript mode", async () => {
      const user = userEvent.setup();
      render(<Search />);

      await selectGame(mockGameWithZapscript);

      const copyButton = screen.getByRole("button", {
        name: /create.search.copyLabel/i,
      });
      await user.click(copyButton);

      // Should use web clipboard API first
      await waitFor(() => {
        expect(mockClipboardWriteText).toHaveBeenCalledWith("**launch:nes/smb");
      });
    });

    it("should copy path to clipboard when copy button clicked in path mode", async () => {
      const user = userEvent.setup();
      render(<Search />);

      await selectGame(mockGameWithZapscript);

      // Switch to path mode
      const pathRadio = screen.getByRole("radio", { name: /pathLabel/i });
      await user.click(pathRadio);

      const copyButton = screen.getByRole("button", {
        name: /create.search.copyLabel/i,
      });
      await user.click(copyButton);

      await waitFor(() => {
        expect(mockClipboardWriteText).toHaveBeenCalledWith(
          "/games/nes/smb.nes",
        );
      });
    });

    // Note: Testing the Capacitor Clipboard fallback is challenging because it involves
    // dynamic imports in catch blocks. The core clipboard functionality (successful copy)
    // is tested above. The fallback to Capacitor is used on native platforms where
    // navigator.clipboard may not be available.
  });

  describe("System Selector", () => {
    it("should open system selector when trigger is clicked", async () => {
      const user = userEvent.setup();
      render(<Search />);

      const trigger = screen.getByTestId("system-selector-trigger");
      await user.click(trigger);

      expect(screen.getByTestId("system-selector-modal")).toBeInTheDocument();
    });

    it("should save system preference when system is selected", async () => {
      const user = userEvent.setup();
      render(<Search />);

      // Open selector
      const trigger = screen.getByTestId("system-selector-trigger");
      await user.click(trigger);

      // Select a system
      await user.click(screen.getByText("Select NES"));

      await waitFor(() => {
        expect(mockPreferencesSet).toHaveBeenCalledWith({
          key: "searchSystem",
          value: "nes",
        });
      });
    });

    it("should update trigger display when system is selected", async () => {
      const user = userEvent.setup();
      render(<Search />);

      // Open selector and select
      const trigger = screen.getByTestId("system-selector-trigger");
      await user.click(trigger);
      await user.click(screen.getByText("Select NES"));

      // Trigger should now show selected system
      await waitFor(() => {
        expect(screen.getByTestId("system-selector-trigger")).toHaveTextContent(
          "nes",
        );
      });
    });
  });

  describe("Tag Selector", () => {
    it("should open tag selector when trigger is clicked", async () => {
      const user = userEvent.setup();
      render(<Search />);

      const trigger = screen.getByTestId("tag-selector-trigger");
      await user.click(trigger);

      expect(screen.getByTestId("tag-selector-modal")).toBeInTheDocument();
    });

    it("should save tag preference when tags are selected", async () => {
      const user = userEvent.setup();
      render(<Search />);

      // Open selector
      const trigger = screen.getByTestId("tag-selector-trigger");
      await user.click(trigger);

      // Select tags
      await user.click(screen.getByText("Select Tags"));

      await waitFor(() => {
        expect(mockPreferencesSet).toHaveBeenCalledWith({
          key: "searchTags",
          value: JSON.stringify(["platformer", "action"]),
        });
      });
    });

    it("should update trigger display when tags are selected", async () => {
      const user = userEvent.setup();
      render(<Search />);

      // Open selector and select
      const trigger = screen.getByTestId("tag-selector-trigger");
      await user.click(trigger);
      await user.click(screen.getByText("Select Tags"));

      // Trigger should now show selected tags
      await waitFor(() => {
        expect(screen.getByTestId("tag-selector-trigger")).toHaveTextContent(
          "platformer, action",
        );
      });
    });
  });

  describe("Clear Filters", () => {
    it("should reset system and tags when clear filters is called", async () => {
      const user = userEvent.setup();
      render(<Search />);

      // First select a system and tags
      const systemTrigger = screen.getByTestId("system-selector-trigger");
      await user.click(systemTrigger);
      await user.click(screen.getByText("Select NES"));

      const tagTrigger = screen.getByTestId("tag-selector-trigger");
      await user.click(tagTrigger);
      await user.click(screen.getByText("Select Tags"));

      // Clear mocks to track only the clear action
      mockPreferencesSet.mockClear();

      // Trigger clear filters via the VirtualSearchResults callback
      await waitFor(() => {
        expect(mockSelectorCallbacks.onClearFilters).not.toBeNull();
      });
      await act(async () => {
        mockSelectorCallbacks.onClearFilters?.();
      });

      // Should reset system preference
      await waitFor(() => {
        expect(mockPreferencesSet).toHaveBeenCalledWith({
          key: "searchSystem",
          value: "all",
        });
      });

      // Should reset tags preference
      await waitFor(() => {
        expect(mockPreferencesSet).toHaveBeenCalledWith({
          key: "searchTags",
          value: JSON.stringify([]),
        });
      });
    });

    it("should reset trigger displays after clearing filters", async () => {
      const user = userEvent.setup();
      render(<Search />);

      // Select system first
      const systemTrigger = screen.getByTestId("system-selector-trigger");
      await user.click(systemTrigger);
      await user.click(screen.getByText("Select NES"));

      await waitFor(() => {
        expect(screen.getByTestId("system-selector-trigger")).toHaveTextContent(
          "nes",
        );
      });

      // Clear filters
      await act(async () => {
        mockSelectorCallbacks.onClearFilters?.();
      });

      // Should show "All Systems" again
      await waitFor(() => {
        expect(screen.getByTestId("system-selector-trigger")).toHaveTextContent(
          "All Systems",
        );
      });
    });
  });

  describe("Recent Search Selection", () => {
    it("should populate form and execute search when recent search is selected", async () => {
      const user = userEvent.setup();

      // Update mock to have recent searches
      const { useRecentSearches } = await import("@/hooks/useRecentSearches");
      vi.mocked(useRecentSearches).mockReturnValue({
        recentSearches: [
          { query: "mario", system: "nes", tags: ["platformer"], timestamp: 1 },
        ],
        isLoading: false,
        addRecentSearch: recentSearchesMocks.addRecentSearch,
        clearRecentSearches: recentSearchesMocks.clearRecentSearches,
        getSearchDisplayText: (search: { query: string }) =>
          search.query || "All games",
      });

      render(<Search />);

      // Open recent searches (button should be enabled now)
      const recentButton = screen.getByRole("button", {
        name: /create.search.recentSearches/i,
      });
      await user.click(recentButton);

      // Select the recent search
      await user.click(screen.getByText("Select Recent Search"));

      // Should save system preference
      await waitFor(() => {
        expect(mockPreferencesSet).toHaveBeenCalledWith({
          key: "searchSystem",
          value: "nes",
        });
      });

      // Should save tags preference
      await waitFor(() => {
        expect(mockPreferencesSet).toHaveBeenCalledWith({
          key: "searchTags",
          value: JSON.stringify(["platformer"]),
        });
      });
    });

    it("should update system trigger after recent search selection", async () => {
      const user = userEvent.setup();

      // Update mock to have recent searches
      const { useRecentSearches } = await import("@/hooks/useRecentSearches");
      vi.mocked(useRecentSearches).mockReturnValue({
        recentSearches: [
          { query: "mario", system: "nes", tags: ["platformer"], timestamp: 1 },
        ],
        isLoading: false,
        addRecentSearch: recentSearchesMocks.addRecentSearch,
        clearRecentSearches: recentSearchesMocks.clearRecentSearches,
        getSearchDisplayText: (search: { query: string }) =>
          search.query || "All games",
      });

      render(<Search />);

      // Open and select recent search
      const recentButton = screen.getByRole("button", {
        name: /create.search.recentSearches/i,
      });
      await user.click(recentButton);
      await user.click(screen.getByText("Select Recent Search"));

      // System trigger should show the selected system
      await waitFor(() => {
        expect(screen.getByTestId("system-selector-trigger")).toHaveTextContent(
          "nes",
        );
      });
    });
  });
});
