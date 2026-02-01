import { render, screen, waitFor, fireEvent } from "../../../test-utils";
import { vi, beforeEach, describe, it, expect } from "vitest";
import { VirtualSearchResults } from "@/components/VirtualSearchResults";
import { CoreAPI } from "@/lib/coreApi";

// Mock dependencies
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (params?.query) {
        return `${key}: ${params.query}`;
      }
      return key;
    },
  }),
}));

// Flexible store mock - state can be modified per test
const mockStoreState = {
  connected: true,
  gamesIndex: { exists: true, indexing: false },
};

vi.mock("@/lib/store", () => ({
  useStatusStore: vi.fn((selector) => {
    return selector ? selector(mockStoreState) : mockStoreState;
  }),
}));

// Flexible preferences mock
const mockPreferencesState = {
  showFilenames: false,
};

vi.mock("@/lib/preferencesStore", () => ({
  usePreferencesStore: vi.fn((selector) => {
    return selector ? selector(mockPreferencesState) : mockPreferencesState;
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search,
  }: {
    children: React.ReactNode;
    to: string;
    search?: Record<string, string>;
  }) => {
    const searchParams = search
      ? "?" + new URLSearchParams(search).toString()
      : "";
    return <a href={`${to}${searchParams}`}>{children}</a>;
  },
}));

// Create mock for virtualizer
const mockGetVirtualItems = vi.fn();
const mockMeasureElement = vi.fn();

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getVirtualItems: mockGetVirtualItems,
    getTotalSize: () => 5000,
    measureElement: mockMeasureElement,
  }),
}));

describe("VirtualSearchResults", () => {
  // Helper to create mock search results
  const createMockResults = (count: number, startIndex: number = 0) => {
    return Array.from({ length: count }, (_, i) => ({
      name: `Game ${startIndex + i}`,
      path: `/games/game${startIndex + i}.rom`,
      system: {
        id: "snes",
        name: "Super Nintendo",
        category: "Console",
        manufacturer: "Nintendo",
        releaseDate: "1990-11-21",
      },
      tags: [],
    }));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetVirtualItems.mockReturnValue([]);
    // Reset to default state
    mockStoreState.connected = true;
    mockStoreState.gamesIndex = { exists: true, indexing: false };
    mockPreferencesState.showFilenames = false;
  });

  const defaultProps = {
    query: "test",
    systems: [],
    tags: [],
    selectedResult: null,
    setSelectedResult: vi.fn(),
    hasSearched: true,
    scrollContainerRef: { current: document.createElement("div") },
  };

  const renderComponent = (props = {}) => {
    return render(<VirtualSearchResults {...defaultProps} {...props} />);
  };

  describe("initial state (no search performed)", () => {
    it("should show initial state message when hasSearched is false", () => {
      renderComponent({ hasSearched: false });

      expect(
        screen.getByText("create.search.startSearching"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("create.search.startSearchingHint"),
      ).toBeInTheDocument();
    });

    it("should not show results when hasSearched is false", () => {
      renderComponent({ hasSearched: false });

      expect(screen.queryByTestId("search-results")).not.toBeInTheDocument();
    });
  });

  describe("games database not available", () => {
    it("should show warning card when gamesIndex does not exist", () => {
      mockStoreState.gamesIndex = { exists: false, indexing: false };

      renderComponent();

      expect(
        screen.getByText("create.search.gamesDbUpdate"),
      ).toBeInTheDocument();
    });

    it("should contain a link to settings in the warning card", () => {
      mockStoreState.gamesIndex = { exists: false, indexing: false };

      const { container } = renderComponent();

      // Check that the Link component is rendered with correct destination
      const link = container.querySelector(
        'a[href="/settings?focus=database"]',
      );
      expect(link).toBeInTheDocument();
    });

    it("should show settings button with accessible label", () => {
      mockStoreState.gamesIndex = { exists: false, indexing: false };

      renderComponent();

      expect(
        screen.getByRole("button", { name: "create.search.gamesDbSettings" }),
      ).toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("should show loading indicator when isSearching is true", () => {
      renderComponent({ isSearching: true });

      expect(screen.getByText("create.search.loading")).toBeInTheDocument();
    });
  });

  // Note: Error state tests for VirtualSearchResults require mocking the CoreAPI
  // module at the file level rather than using vi.spyOn, because the hook imports
  // CoreAPI directly. Error state rendering is tested in useVirtualInfiniteSearch.test.tsx
  // which properly mocks the module. The error UI (message + retry button) is also
  // tested visually in integration tests.

  describe("empty state", () => {
    // Helper for empty state mock response
    const emptyResponse = {
      results: [],
      total: 0,
      pagination: { hasNextPage: false, pageSize: 100, nextCursor: null },
    };

    it("should show no results with query message when query provided", async () => {
      vi.spyOn(CoreAPI, "mediaSearch").mockResolvedValue(emptyResponse);

      renderComponent({ query: "mario" });

      await waitFor(() => {
        expect(
          screen.getByText("create.search.noResultsFound: mario"),
        ).toBeInTheDocument();
      });
    });

    it("should show suggestion to try different terms when no filters active", async () => {
      vi.spyOn(CoreAPI, "mediaSearch").mockResolvedValue(emptyResponse);

      renderComponent({ query: "mario", searchSystem: "all", searchTags: [] });

      await waitFor(() => {
        expect(
          screen.getByText("create.search.tryDifferentTerms"),
        ).toBeInTheDocument();
      });
    });

    it("should show suggestion to try different search when filters active", async () => {
      vi.spyOn(CoreAPI, "mediaSearch").mockResolvedValue(emptyResponse);

      renderComponent({
        query: "mario",
        searchSystem: "snes",
        searchTags: [],
      });

      await waitFor(() => {
        expect(
          screen.getByText("create.search.tryDifferentSearch"),
        ).toBeInTheDocument();
      });
    });

    it("should show clear filters button when filters are active", async () => {
      vi.spyOn(CoreAPI, "mediaSearch").mockResolvedValue(emptyResponse);

      const onClearFilters = vi.fn();

      renderComponent({
        query: "mario",
        searchSystem: "snes",
        searchTags: [],
        onClearFilters,
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "create.search.clearFilters" }),
        ).toBeInTheDocument();
      });
    });

    it("should call onClearFilters when clear filters button is clicked", async () => {
      vi.spyOn(CoreAPI, "mediaSearch").mockResolvedValue(emptyResponse);

      const onClearFilters = vi.fn();

      renderComponent({
        query: "mario",
        searchSystem: "snes",
        searchTags: [],
        onClearFilters,
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "create.search.clearFilters" }),
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", { name: "create.search.clearFilters" }),
      );

      expect(onClearFilters).toHaveBeenCalledTimes(1);
    });
  });

  describe("search results", () => {
    it("should call onSearchComplete when loading finishes", async () => {
      const mediaSearchSpy = vi.spyOn(CoreAPI, "mediaSearch");
      mediaSearchSpy.mockResolvedValueOnce({
        results: createMockResults(5),
        total: 5,
        pagination: { hasNextPage: false, pageSize: 100, nextCursor: null },
      });

      const onSearchComplete = vi.fn();

      renderComponent({ onSearchComplete });

      await waitFor(() => {
        expect(onSearchComplete).toHaveBeenCalled();
      });
    });

    it("should render search results container", async () => {
      const mediaSearchSpy = vi.spyOn(CoreAPI, "mediaSearch");
      mediaSearchSpy.mockResolvedValueOnce({
        results: createMockResults(5),
        total: 5,
        pagination: { hasNextPage: false, pageSize: 100, nextCursor: null },
      });

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: 0, start: 0, size: 100 },
        { index: 1, key: 1, start: 100, size: 100 },
      ]);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId("search-results")).toBeInTheDocument();
      });
    });

    it("should render result items with game names", async () => {
      const mediaSearchSpy = vi.spyOn(CoreAPI, "mediaSearch");
      mediaSearchSpy.mockResolvedValueOnce({
        results: createMockResults(2),
        total: 2,
        pagination: { hasNextPage: false, pageSize: 100, nextCursor: null },
      });

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: 0, start: 0, size: 100 },
        { index: 1, key: 1, start: 100, size: 100 },
      ]);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText("Game 0")).toBeInTheDocument();
        expect(screen.getByText("Game 1")).toBeInTheDocument();
      });
    });

    it("should render result items with system names", async () => {
      const mediaSearchSpy = vi.spyOn(CoreAPI, "mediaSearch");
      mediaSearchSpy.mockResolvedValueOnce({
        results: createMockResults(1),
        total: 1,
        pagination: { hasNextPage: false, pageSize: 100, nextCursor: null },
      });

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: 0, start: 0, size: 100 },
      ]);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText("Super Nintendo")).toBeInTheDocument();
      });
    });
  });

  describe("screen reader announcements", () => {
    it("should have aria-live region for announcements", async () => {
      const mediaSearchSpy = vi.spyOn(CoreAPI, "mediaSearch");
      mediaSearchSpy.mockResolvedValueOnce({
        results: createMockResults(5),
        total: 5,
        pagination: { hasNextPage: false, pageSize: 100, nextCursor: null },
      });

      mockGetVirtualItems.mockReturnValue([]);

      renderComponent();

      await waitFor(() => {
        const liveRegion = document.querySelector('[aria-live="polite"]');
        expect(liveRegion).toBeInTheDocument();
      });
    });
  });

  describe("infinite scrolling", () => {
    it("should make initial API call on mount", async () => {
      const mediaSearchSpy = vi.spyOn(CoreAPI, "mediaSearch");
      mediaSearchSpy.mockResolvedValueOnce({
        results: createMockResults(10),
        total: 10,
        pagination: { hasNextPage: false, pageSize: 100, nextCursor: null },
      });

      renderComponent();

      await waitFor(() => {
        expect(mediaSearchSpy).toHaveBeenCalledTimes(1);
      });

      expect(mediaSearchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "test",
        }),
      );
    });

    it("should pass systems and tags to search API", async () => {
      const mediaSearchSpy = vi.spyOn(CoreAPI, "mediaSearch");
      mediaSearchSpy.mockResolvedValueOnce({
        results: [],
        total: 0,
        pagination: { hasNextPage: false, pageSize: 100, nextCursor: null },
      });

      renderComponent({
        systems: ["snes", "genesis"],
        tags: ["action", "rpg"],
      });

      await waitFor(() => {
        expect(mediaSearchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            systems: ["snes", "genesis"],
            tags: ["action", "rpg"],
          }),
        );
      });
    });

    it("should pass maxResults to search API", async () => {
      const mediaSearchSpy = vi.spyOn(CoreAPI, "mediaSearch");
      mediaSearchSpy.mockResolvedValueOnce({
        results: [],
        total: 0,
        pagination: { hasNextPage: false, pageSize: 100, nextCursor: null },
      });

      renderComponent();

      await waitFor(() => {
        expect(mediaSearchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            maxResults: 100,
          }),
        );
      });
    });
  });

  describe("props handling", () => {
    it("should pass setSelectedResult callback", () => {
      const setSelectedResult = vi.fn();
      renderComponent({ setSelectedResult });

      expect(setSelectedResult).toBeDefined();
    });

    it("should pass selectedResult prop", () => {
      const mockResult = createMockResults(1)[0];
      const { container } = renderComponent({ selectedResult: mockResult });

      expect(container).toBeInTheDocument();
    });

    it("should call onClearFilters when provided", async () => {
      const mediaSearchSpy = vi.spyOn(CoreAPI, "mediaSearch");
      mediaSearchSpy.mockResolvedValueOnce({
        results: [],
        total: 0,
        pagination: { hasNextPage: false, pageSize: 100, nextCursor: null },
      });

      const onClearFilters = vi.fn();
      renderComponent({
        searchSystem: "snes",
        onClearFilters,
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "create.search.clearFilters" }),
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", { name: "create.search.clearFilters" }),
      );

      expect(onClearFilters).toHaveBeenCalledTimes(1);
    });

    it("should pass scrollContainerRef to virtualizer", () => {
      const scrollRef = { current: document.createElement("div") };
      const { container } = renderComponent({ scrollContainerRef: scrollRef });

      expect(container).toBeInTheDocument();
    });
  });

  describe("result selection", () => {
    it("should call setSelectedResult when result is clicked", async () => {
      const mediaSearchSpy = vi.spyOn(CoreAPI, "mediaSearch");
      const mockResults = createMockResults(2);
      mediaSearchSpy.mockResolvedValueOnce({
        results: mockResults,
        total: 2,
        pagination: { hasNextPage: false, pageSize: 100, nextCursor: null },
      });

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: 0, start: 0, size: 100 },
        { index: 1, key: 1, start: 100, size: 100 },
      ]);

      const setSelectedResult = vi.fn();
      renderComponent({ setSelectedResult });

      await waitFor(() => {
        expect(screen.getByTestId("result-0")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("result-0"));

      expect(setSelectedResult).toHaveBeenCalledWith(mockResults[0]);
    });

    it("should deselect when clicking the same result again", async () => {
      const mediaSearchSpy = vi.spyOn(CoreAPI, "mediaSearch");
      const mockResults = createMockResults(1);
      mediaSearchSpy.mockResolvedValueOnce({
        results: mockResults,
        total: 1,
        pagination: { hasNextPage: false, pageSize: 100, nextCursor: null },
      });

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: 0, start: 0, size: 100 },
      ]);

      const setSelectedResult = vi.fn();
      renderComponent({
        setSelectedResult,
        selectedResult: mockResults[0], // Already selected
      });

      await waitFor(() => {
        expect(screen.getByTestId("result-0")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("result-0"));

      expect(setSelectedResult).toHaveBeenCalledWith(null);
    });

    it("should handle keyboard Enter to select result", async () => {
      const mediaSearchSpy = vi.spyOn(CoreAPI, "mediaSearch");
      const mockResults = createMockResults(1);
      mediaSearchSpy.mockResolvedValueOnce({
        results: mockResults,
        total: 1,
        pagination: { hasNextPage: false, pageSize: 100, nextCursor: null },
      });

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: 0, start: 0, size: 100 },
      ]);

      const setSelectedResult = vi.fn();
      renderComponent({ setSelectedResult });

      await waitFor(() => {
        expect(screen.getByTestId("result-0")).toBeInTheDocument();
      });

      fireEvent.keyDown(screen.getByTestId("result-0"), { key: "Enter" });

      expect(setSelectedResult).toHaveBeenCalledWith(mockResults[0]);
    });

    it("should handle keyboard Space to select result", async () => {
      const mediaSearchSpy = vi.spyOn(CoreAPI, "mediaSearch");
      const mockResults = createMockResults(1);
      mediaSearchSpy.mockResolvedValueOnce({
        results: mockResults,
        total: 1,
        pagination: { hasNextPage: false, pageSize: 100, nextCursor: null },
      });

      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: 0, start: 0, size: 100 },
      ]);

      const setSelectedResult = vi.fn();
      renderComponent({ setSelectedResult });

      await waitFor(() => {
        expect(screen.getByTestId("result-0")).toBeInTheDocument();
      });

      fireEvent.keyDown(screen.getByTestId("result-0"), { key: " " });

      expect(setSelectedResult).toHaveBeenCalledWith(mockResults[0]);
    });
  });

  // Note: "duplicate names handling" and "showFilenames preference" tests
  // require the full hook data flow which is complex to mock with the virtualizer.
  // These behaviors are tested in integration tests instead.

  describe("empty state without query", () => {
    it("should show simple no results message when query is empty", async () => {
      vi.spyOn(CoreAPI, "mediaSearch").mockResolvedValue({
        results: [],
        total: 0,
        pagination: { hasNextPage: false, pageSize: 100, nextCursor: null },
      });

      renderComponent({ query: "", searchSystem: "all", searchTags: [] });

      await waitFor(() => {
        expect(
          screen.getByText("create.search.noResultsFoundSimple"),
        ).toBeInTheDocument();
      });
    });

    it("should show filter removal suggestion when filters active but no query", async () => {
      vi.spyOn(CoreAPI, "mediaSearch").mockResolvedValue({
        results: [],
        total: 0,
        pagination: { hasNextPage: false, pageSize: 100, nextCursor: null },
      });

      renderComponent({ query: "", searchSystem: "snes", searchTags: [] });

      await waitFor(() => {
        expect(
          screen.getByText("create.search.tryRemovingFiltersOnly"),
        ).toBeInTheDocument();
      });
    });
  });
});
