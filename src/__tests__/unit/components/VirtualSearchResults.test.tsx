import { render, screen, waitFor } from "@testing-library/react";
import { vi, beforeEach, describe, it, expect } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VirtualSearchResults } from "@/components/VirtualSearchResults";
import { CoreAPI } from "@/lib/coreApi";
import "@/test-setup";

// Mock dependencies
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
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

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
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

describe("VirtualSearchResults - Infinite Scrolling Regression Tests", () => {
  let queryClient: QueryClient;

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
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    mockGetVirtualItems.mockReturnValue([]);
  });

  const renderComponent = (props = {}) => {
    const defaultProps = {
      query: "test",
      systems: [],
      tags: [],
      selectedResult: null,
      setSelectedResult: vi.fn(),
      hasSearched: true,
      scrollContainerRef: { current: document.createElement("div") },
      ...props,
    };

    return render(
      <QueryClientProvider client={queryClient}>
        <VirtualSearchResults {...defaultProps} />
      </QueryClientProvider>,
    );
  };

  it("should trigger fetchNextPage when scrolling near the end of current results", async () => {
    // Mock first page response
    const firstPageResults = createMockResults(100);
    const mediaSearchSpy = vi.spyOn(CoreAPI, "mediaSearch");

    mediaSearchSpy.mockResolvedValueOnce({
      results: firstPageResults,
      total: 100,
      pagination: {
        nextCursor: "cursor-page-2",
        hasNextPage: true,
        pageSize: 100,
      },
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

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <VirtualSearchResults {...defaultProps} />
      </QueryClientProvider>,
    );

    // Wait for initial data to load
    await waitFor(() => {
      expect(mediaSearchSpy).toHaveBeenCalledTimes(1);
    });

    // Simulate scrolling to position 96 (within 5 items of the end at index 99)
    mockGetVirtualItems.mockReturnValue([
      { index: 96, key: 96, start: 9600, size: 100 },
      { index: 97, key: 97, start: 9700, size: 100 },
      { index: 98, key: 98, start: 9800, size: 100 },
      { index: 99, key: 99, start: 9900, size: 100 },
    ]);

    // Mock second page response
    const secondPageResults = createMockResults(100, 100);
    mediaSearchSpy.mockResolvedValueOnce({
      results: secondPageResults,
      total: 100,
      pagination: {
        nextCursor: "cursor-page-3",
        hasNextPage: true,
        pageSize: 100,
      },
    });

    // Re-render to trigger the effect with new virtualItems
    rerender(
      <QueryClientProvider client={queryClient}>
        <VirtualSearchResults {...defaultProps} />
      </QueryClientProvider>,
    );

    // Wait for second page to be fetched
    await waitFor(
      () => {
        expect(mediaSearchSpy).toHaveBeenCalledTimes(2);
      },
      { timeout: 3000 },
    );

    // Verify the second call included the cursor
    expect(mediaSearchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: "cursor-page-2",
      }),
    );
  });

  it("should NOT fetch next page when scrolled but not near the end", async () => {
    const firstPageResults = createMockResults(100);
    const mediaSearchSpy = vi.spyOn(CoreAPI, "mediaSearch");

    mediaSearchSpy.mockResolvedValueOnce({
      results: firstPageResults,
      total: 100,
      pagination: {
        nextCursor: "cursor-page-2",
        hasNextPage: true,
        pageSize: 100,
      },
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

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <VirtualSearchResults {...defaultProps} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(mediaSearchSpy).toHaveBeenCalledTimes(1);
    });

    // Simulate scrolling to position 50 (not near the end)
    mockGetVirtualItems.mockReturnValue([
      { index: 50, key: 50, start: 5000, size: 100 },
      { index: 51, key: 51, start: 5100, size: 100 },
      { index: 52, key: 52, start: 5200, size: 100 },
    ]);

    rerender(
      <QueryClientProvider client={queryClient}>
        <VirtualSearchResults {...defaultProps} />
      </QueryClientProvider>,
    );

    // Verify no additional calls are made after scrolling to middle
    // Use waitFor with a short timeout to ensure async operations settle
    await waitFor(
      () => {
        // Should still only be 1 call (the initial one)
        expect(mediaSearchSpy).toHaveBeenCalledTimes(1);
      },
      { timeout: 200 },
    );
  });

  it("should NOT fetch next page when hasNextPage is false", async () => {
    const firstPageResults = createMockResults(50);
    const mediaSearchSpy = vi.spyOn(CoreAPI, "mediaSearch");

    // Mock response with NO next page
    mediaSearchSpy.mockResolvedValueOnce({
      results: firstPageResults,
      total: 50,
      pagination: {
        nextCursor: null,
        hasNextPage: false,
        pageSize: 100,
      },
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

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <VirtualSearchResults {...defaultProps} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(mediaSearchSpy).toHaveBeenCalledTimes(1);
    });

    // Simulate scrolling to the end
    mockGetVirtualItems.mockReturnValue([
      { index: 48, key: 48, start: 4800, size: 100 },
      { index: 49, key: 49, start: 4900, size: 100 },
    ]);

    // Use rerender instead of creating a new render
    rerender(
      <QueryClientProvider client={queryClient}>
        <VirtualSearchResults {...defaultProps} />
      </QueryClientProvider>,
    );

    // Verify no additional calls are made when hasNextPage is false
    await waitFor(
      () => {
        // Should still only be 1 call
        expect(mediaSearchSpy).toHaveBeenCalledTimes(1);
      },
      { timeout: 200 },
    );
  });

  it("should show loading indicator at the end when hasNextPage is true", async () => {
    const firstPageResults = createMockResults(100);
    const mediaSearchSpy = vi.spyOn(CoreAPI, "mediaSearch");

    mediaSearchSpy.mockResolvedValueOnce({
      results: firstPageResults,
      total: 100,
      pagination: {
        nextCursor: "cursor-page-2",
        hasNextPage: true,
        pageSize: 100,
      },
    });

    // Mock virtual items to include the loading sentinel
    mockGetVirtualItems.mockReturnValue([
      { index: 98, key: 98, start: 9800, size: 100 },
      { index: 99, key: 99, start: 9900, size: 100 },
      { index: 100, key: 100, start: 10000, size: 60 }, // Loading sentinel
    ]);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId("search-results")).toBeInTheDocument();
    });

    // The loading indicator should be present (it's at index >= totalCount)
    const loadingIndicators = screen.getAllByText("create.search.loading");
    expect(loadingIndicators.length).toBeGreaterThan(0);
  });

  it("should NOT show loading indicator when hasNextPage is false", async () => {
    const firstPageResults = createMockResults(50);
    const mediaSearchSpy = vi.spyOn(CoreAPI, "mediaSearch");

    mediaSearchSpy.mockResolvedValueOnce({
      results: firstPageResults,
      total: 50,
      pagination: {
        nextCursor: null,
        hasNextPage: false,
        pageSize: 100,
      },
    });

    // Mock virtual items (no loading sentinel should be added)
    mockGetVirtualItems.mockReturnValue([
      { index: 48, key: 48, start: 4800, size: 100 },
      { index: 49, key: 49, start: 4900, size: 100 },
    ]);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId("search-results")).toBeInTheDocument();
    });

    // Should not have a loading indicator in the results
    const loadingTexts = screen.queryAllByText("create.search.loading");
    // Filter out the one in the aria-live region if present
    const visibleLoading = loadingTexts.filter(
      (el) => !el.classList.contains("sr-only"),
    );
    expect(visibleLoading.length).toBe(0);
  });
});
