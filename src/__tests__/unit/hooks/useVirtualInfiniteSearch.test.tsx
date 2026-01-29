/**
 * Unit tests for useVirtualInfiniteSearch hook
 *
 * Tests the infinite scroll search functionality with TanStack Query.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "../../../test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useVirtualInfiniteSearch } from "../../../hooks/useVirtualInfiniteSearch";
import { SearchResultsResponse } from "../../../lib/models";

// Create hoisted mocks
const { mockCoreAPI } = vi.hoisted(() => ({
  mockCoreAPI: {
    mediaSearch: vi.fn(),
  },
}));

// Mock CoreAPI
vi.mock("../../../lib/coreApi", () => ({
  CoreAPI: mockCoreAPI,
}));

// Mock logger
vi.mock("../../../lib/logger", () => ({
  logger: {
    log: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useVirtualInfiniteSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("basic functionality", () => {
    it("should return empty items when disabled", async () => {
      const { result } = renderHook(
        () =>
          useVirtualInfiniteSearch({
            query: "mario",
            systems: ["nes"],
            enabled: false,
          }),
        { wrapper: createWrapper() },
      );

      expect(result.current.allItems).toEqual([]);
      expect(result.current.totalCount).toBe(0);
      expect(result.current.isLoading).toBe(false);
    });

    it("should fetch and return search results", async () => {
      const mockResponse: SearchResultsResponse = {
        results: [
          {
            name: "Super Mario Bros",
            path: "/games/mario.nes",
            system: { id: "nes", name: "Nintendo Entertainment System" },
            tags: [],
          },
        ],
        total: 1,
      };

      mockCoreAPI.mediaSearch.mockResolvedValue(mockResponse);

      const { result } = renderHook(
        () =>
          useVirtualInfiniteSearch({
            query: "mario",
            systems: ["nes"],
            enabled: true,
          }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.allItems).toHaveLength(1);
      expect(result.current.allItems[0]?.name).toBe("Super Mario Bros");
      expect(result.current.totalCount).toBe(1);
    });
  });

  describe("regression: handles undefined results", () => {
    it("should handle page with undefined results gracefully", async () => {
      // Simulate malformed API response where results is undefined
      const malformedResponse = {
        total: 0,
        // results is missing/undefined
      } as unknown as SearchResultsResponse;

      mockCoreAPI.mediaSearch.mockResolvedValue(malformedResponse);

      const { result } = renderHook(
        () =>
          useVirtualInfiniteSearch({
            query: "test",
            systems: ["nes"],
            enabled: true,
          }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should not crash and return empty array
      expect(result.current.allItems).toEqual([]);
      expect(result.current.totalCount).toBe(0);
    });

    it("should handle page with null results gracefully", async () => {
      // Simulate malformed API response where results is null
      const malformedResponse = {
        results: null,
        total: 0,
      } as unknown as SearchResultsResponse;

      mockCoreAPI.mediaSearch.mockResolvedValue(malformedResponse);

      const { result } = renderHook(
        () =>
          useVirtualInfiniteSearch({
            query: "test",
            systems: ["nes"],
            enabled: true,
          }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should not crash and return empty array
      expect(result.current.allItems).toEqual([]);
      expect(result.current.totalCount).toBe(0);
    });

    it("should handle mixed valid and invalid pages", async () => {
      // First call returns valid data, second returns malformed
      const validResponse: SearchResultsResponse = {
        results: [
          {
            name: "Game 1",
            path: "/games/game1.nes",
            system: { id: "nes", name: "NES" },
            tags: [],
          },
        ],
        total: 2,
        pagination: {
          nextCursor: "cursor1",
          hasNextPage: true,
          pageSize: 1,
        },
      };

      const malformedResponse = {
        total: 0,
        pagination: {
          nextCursor: null,
          hasNextPage: false,
          pageSize: 1,
        },
        // results is missing
      } as unknown as SearchResultsResponse;

      mockCoreAPI.mediaSearch
        .mockResolvedValueOnce(validResponse)
        .mockResolvedValueOnce(malformedResponse);

      const { result } = renderHook(
        () =>
          useVirtualInfiniteSearch({
            query: "test",
            systems: ["nes"],
            enabled: true,
          }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should have items from the valid page
      expect(result.current.allItems).toHaveLength(1);
      expect(result.current.allItems[0]?.name).toBe("Game 1");
    });
  });

  describe("pagination", () => {
    it("should return hasNextPage false when no more pages", async () => {
      const mockResponse: SearchResultsResponse = {
        results: [
          {
            name: "Game 1",
            path: "/games/game1.nes",
            system: { id: "nes", name: "NES" },
            tags: [],
          },
        ],
        total: 1,
        pagination: {
          nextCursor: null,
          hasNextPage: false,
          pageSize: 100,
        },
      };

      mockCoreAPI.mediaSearch.mockResolvedValue(mockResponse);

      const { result } = renderHook(
        () =>
          useVirtualInfiniteSearch({
            query: "test",
            systems: ["nes"],
            enabled: true,
          }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasNextPage).toBe(false);
    });

    it("should return hasNextPage false for legacy responses without pagination", async () => {
      const legacyResponse: SearchResultsResponse = {
        results: [
          {
            name: "Game 1",
            path: "/games/game1.nes",
            system: { id: "nes", name: "NES" },
            tags: [],
          },
        ],
        total: 1,
        // No pagination field - legacy API response
      };

      mockCoreAPI.mediaSearch.mockResolvedValue(legacyResponse);

      const { result } = renderHook(
        () =>
          useVirtualInfiniteSearch({
            query: "test",
            systems: ["nes"],
            enabled: true,
          }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Legacy responses without pagination should indicate no more pages
      expect(result.current.hasNextPage).toBe(false);
    });
  });
});
