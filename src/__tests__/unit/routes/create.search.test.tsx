import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "../../../test-utils";
import { Search } from "@/routes/create.search";
import { useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";

// Mock route
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({
    useLoaderData: () => ({
      systemQuery: "all",
      tagQuery: [],
      systems: {
        systems: [
          { id: "snes", name: "Super Nintendo" },
          { id: "genesis", name: "Sega Genesis" },
        ],
      },
    }),
  }),
  useRouter: () => ({
    history: {
      back: vi.fn(),
    },
  }),
}));

// Mock i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock preferences
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    set: vi.fn(),
    get: vi.fn().mockResolvedValue({ value: null }),
  },
}));

// Mock useSmartSwipe
vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: () => ({}),
}));

// Mock useHaptics
vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({
    impact: vi.fn(),
  }),
}));

// Mock usePageHeadingFocus
vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

// Mock useRecentSearches
const mockAddRecentSearch = vi.fn();
const mockClearRecentSearches = vi.fn();
vi.mock("@/hooks/useRecentSearches", () => ({
  useRecentSearches: () => ({
    recentSearches: [],
    addRecentSearch: mockAddRecentSearch,
    clearRecentSearches: mockClearRecentSearches,
    getSearchDisplayText: (search: { query: string }) => search.query,
  }),
}));

// Mock useNfcWriter
const mockNfcWrite = vi.fn();
const mockNfcEnd = vi.fn();
vi.mock("@/lib/writeNfcHook", () => ({
  useNfcWriter: () => ({
    write: mockNfcWrite,
    end: mockNfcEnd,
    status: null,
  }),
  WriteAction: {
    Write: "write",
  },
}));

// Mock VirtualSearchResults since it has complex dependencies
vi.mock("@/components/VirtualSearchResults", () => ({
  VirtualSearchResults: ({
    hasSearched,
    isSearching,
    onSearchComplete,
  }: {
    hasSearched: boolean;
    isSearching: boolean;
    onSearchComplete?: () => void;
  }) => {
    if (isSearching) {
      // Simulate search completion
      setTimeout(() => onSearchComplete?.(), 10);
    }
    return (
      <div data-testid="virtual-search-results">
        {hasSearched ? "Results shown" : "No search yet"}
      </div>
    );
  },
}));

// Mock SystemSelector components
vi.mock("@/components/SystemSelector", () => ({
  SystemSelector: ({
    isOpen,
    onClose,
    onSelect,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (systems: string[]) => void;
  }) =>
    isOpen ? (
      <div data-testid="system-selector">
        <button onClick={onClose}>Close</button>
        <button onClick={() => onSelect(["snes"])}>Select SNES</button>
      </div>
    ) : null,
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

// Mock TagSelector components
vi.mock("@/components/TagSelector", () => ({
  TagSelector: ({
    isOpen,
    onClose,
    onSelect,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (tags: string[]) => void;
  }) =>
    isOpen ? (
      <div data-testid="tag-selector">
        <button onClick={onClose}>Close</button>
        <button onClick={() => onSelect(["action"])}>Select Action</button>
      </div>
    ) : null,
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

// Mock RecentSearchesModal
vi.mock("@/components/RecentSearchesModal", () => ({
  RecentSearchesModal: ({
    isOpen,
    onClose,
    onSearchSelect,
    recentSearches,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onSearchSelect: (search: {
      query: string;
      system: string;
      tags: string[];
    }) => void;
    recentSearches: Array<{ query: string; system: string; tags: string[] }>;
  }) =>
    isOpen ? (
      <div data-testid="recent-searches-modal">
        <button onClick={onClose}>Close</button>
        {recentSearches.map((search, i) => (
          <button key={i} onClick={() => onSearchSelect(search)}>
            {search.query}
          </button>
        ))}
      </div>
    ) : null,
}));

// Mock WriteModal
vi.mock("@/components/WriteModal", () => ({
  WriteModal: ({ isOpen, close }: { isOpen: boolean; close: () => void }) =>
    isOpen ? (
      <div data-testid="write-modal">
        <button onClick={close}>Cancel</button>
      </div>
    ) : null,
}));

// Mock SlideModal
vi.mock("@/components/SlideModal", () => ({
  SlideModal: ({
    isOpen,
    close,
    children,
    title,
  }: {
    isOpen: boolean;
    close: () => void;
    children: React.ReactNode;
    title: string;
  }) =>
    isOpen ? (
      <div data-testid="slide-modal">
        <h2>{title}</h2>
        <button onClick={close}>Close</button>
        {children}
      </div>
    ) : null,
}));

// Mock react-query - preserve actual exports, only mock useQuery
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: () => ({
      isError: false,
      data: [],
    }),
  };
});

// Mock PageFrame
vi.mock("@/components/PageFrame", () => ({
  PageFrame: ({
    children,
    headerLeft,
    headerCenter,
    headerRight,
  }: {
    children: React.ReactNode;
    headerLeft: React.ReactNode;
    headerCenter: React.ReactNode;
    headerRight: React.ReactNode;
  }) => (
    <div data-testid="page-frame">
      <div data-testid="header-left">{headerLeft}</div>
      <div data-testid="header-center">{headerCenter}</div>
      <div data-testid="header-right">{headerRight}</div>
      <div data-testid="page-content">{children}</div>
    </div>
  ),
}));

// Mock BackToTop
vi.mock("@/components/BackToTop", () => ({
  BackToTop: () => null,
}));

describe("Search Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useStatusStore.setState({
      ...useStatusStore.getInitialState(),
      connected: true,
      gamesIndex: { exists: true, indexing: false },
    });
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
      showFilenames: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("rendering", () => {
    it("should render the search page with title", () => {
      render(<Search />);

      expect(screen.getByText("create.search.title")).toBeInTheDocument();
    });

    it("should render search input", () => {
      render(<Search />);

      expect(
        screen.getByLabelText("create.search.gameInput"),
      ).toBeInTheDocument();
    });

    it("should render search button", () => {
      render(<Search />);

      expect(
        screen.getByRole("button", { name: "create.search.searchButton" }),
      ).toBeInTheDocument();
    });

    it("should render system selector trigger", () => {
      render(<Search />);

      expect(screen.getByTestId("system-selector-trigger")).toBeInTheDocument();
    });

    it("should render tag selector trigger", () => {
      render(<Search />);

      expect(screen.getByTestId("tag-selector-trigger")).toBeInTheDocument();
    });

    it("should render back button", () => {
      render(<Search />);

      expect(
        screen.getByRole("button", { name: "nav.back" }),
      ).toBeInTheDocument();
    });

    it("should render recent searches button", () => {
      render(<Search />);

      expect(
        screen.getByRole("button", { name: "create.search.recentSearches" }),
      ).toBeInTheDocument();
    });
  });

  describe("search functionality", () => {
    it("should update search input value", () => {
      render(<Search />);

      const input = screen.getByLabelText("create.search.gameInput");
      fireEvent.change(input, { target: { value: "mario" } });

      expect(input).toHaveValue("mario");
    });

    it("should enable search button when connected and index exists", () => {
      render(<Search />);

      const searchButton = screen.getByRole("button", {
        name: "create.search.searchButton",
      });
      expect(searchButton).not.toBeDisabled();
    });

    it("should disable search button when not connected", () => {
      useStatusStore.setState({ connected: false });
      render(<Search />);

      const searchButton = screen.getByRole("button", {
        name: "create.search.searchButton",
      });
      expect(searchButton).toBeDisabled();
    });

    it("should disable search button when index does not exist", () => {
      useStatusStore.setState({
        gamesIndex: { exists: false, indexing: false },
      });
      render(<Search />);

      const searchButton = screen.getByRole("button", {
        name: "create.search.searchButton",
      });
      expect(searchButton).toBeDisabled();
    });

    it("should disable search button when indexing", () => {
      useStatusStore.setState({
        gamesIndex: { exists: true, indexing: true },
      });
      render(<Search />);

      const searchButton = screen.getByRole("button", {
        name: "create.search.searchButton",
      });
      expect(searchButton).toBeDisabled();
    });

    it("should perform search when search button is clicked", () => {
      render(<Search />);

      const input = screen.getByLabelText("create.search.gameInput");
      fireEvent.change(input, { target: { value: "mario" } });

      const searchButton = screen.getByRole("button", {
        name: "create.search.searchButton",
      });
      fireEvent.click(searchButton);

      expect(mockAddRecentSearch).toHaveBeenCalledWith({
        query: "mario",
        system: "all",
        tags: [],
      });
    });

    it("should perform search on Enter key press", () => {
      render(<Search />);

      const input = screen.getByLabelText("create.search.gameInput");
      fireEvent.change(input, { target: { value: "zelda" } });
      fireEvent.keyUp(input, { key: "Enter", keyCode: 13 });

      expect(mockAddRecentSearch).toHaveBeenCalledWith({
        query: "zelda",
        system: "all",
        tags: [],
      });
    });
  });

  describe("system selector", () => {
    it("should open system selector when trigger is clicked", () => {
      render(<Search />);

      const trigger = screen.getByTestId("system-selector-trigger");
      fireEvent.click(trigger);

      expect(screen.getByTestId("system-selector")).toBeInTheDocument();
    });

    it("should close system selector", () => {
      render(<Search />);

      const trigger = screen.getByTestId("system-selector-trigger");
      fireEvent.click(trigger);

      expect(screen.getByTestId("system-selector")).toBeInTheDocument();

      const closeButton = screen.getByRole("button", { name: "Close" });
      fireEvent.click(closeButton);

      expect(screen.queryByTestId("system-selector")).not.toBeInTheDocument();
    });

    it("should update selected system", () => {
      render(<Search />);

      const trigger = screen.getByTestId("system-selector-trigger");
      fireEvent.click(trigger);

      const selectSnesButton = screen.getByRole("button", {
        name: "Select SNES",
      });
      fireEvent.click(selectSnesButton);

      // Trigger should now show the selected system
      expect(screen.getByTestId("system-selector-trigger")).toHaveTextContent(
        "snes",
      );
    });
  });

  describe("tag selector", () => {
    it("should open tag selector when trigger is clicked", () => {
      render(<Search />);

      const trigger = screen.getByTestId("tag-selector-trigger");
      fireEvent.click(trigger);

      expect(screen.getByTestId("tag-selector")).toBeInTheDocument();
    });

    it("should close tag selector", () => {
      render(<Search />);

      const trigger = screen.getByTestId("tag-selector-trigger");
      fireEvent.click(trigger);

      const closeButton = screen.getByRole("button", { name: "Close" });
      fireEvent.click(closeButton);

      expect(screen.queryByTestId("tag-selector")).not.toBeInTheDocument();
    });

    it("should update selected tags", () => {
      render(<Search />);

      const trigger = screen.getByTestId("tag-selector-trigger");
      fireEvent.click(trigger);

      const selectActionButton = screen.getByRole("button", {
        name: "Select Action",
      });
      fireEvent.click(selectActionButton);

      expect(screen.getByTestId("tag-selector-trigger")).toHaveTextContent(
        "action",
      );
    });
  });

  describe("search input disabled state", () => {
    it("should disable search input when not connected", () => {
      useStatusStore.setState({ connected: false });
      render(<Search />);

      const input = screen.getByLabelText("create.search.gameInput");
      expect(input).toBeDisabled();
    });

    it("should disable search input when index does not exist", () => {
      useStatusStore.setState({
        gamesIndex: { exists: false, indexing: false },
      });
      render(<Search />);

      const input = screen.getByLabelText("create.search.gameInput");
      expect(input).toBeDisabled();
    });

    it("should disable search input when indexing", () => {
      useStatusStore.setState({
        gamesIndex: { exists: true, indexing: true },
      });
      render(<Search />);

      const input = screen.getByLabelText("create.search.gameInput");
      expect(input).toBeDisabled();
    });
  });

  // Note: Media index fetch and VirtualSearchResults behavior tests are in
  // VirtualSearchResults.test.tsx. This file focuses on Search route UI logic.

  describe("accessibility", () => {
    it("should have a search landmark", () => {
      render(<Search />);

      expect(screen.getByRole("search")).toBeInTheDocument();
    });

    it("should have labeled inputs", () => {
      render(<Search />);

      expect(
        screen.getByLabelText("create.search.gameInput"),
      ).toBeInTheDocument();
      expect(screen.getByText("create.search.systemInput")).toBeInTheDocument();
      expect(screen.getByText("create.search.tagsInput")).toBeInTheDocument();
    });
  });
});
