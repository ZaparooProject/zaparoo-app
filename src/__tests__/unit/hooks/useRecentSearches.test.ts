/**
 * Unit tests for useRecentSearches hook
 *
 * Tests persistence with Capacitor Preferences and
 * search deduplication logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "../../../test-utils";
import {
  useRecentSearches,
  RecentSearch,
} from "../../../hooks/useRecentSearches";

// Create hoisted mocks
const { mockPreferences, mockLogger } = vi.hoisted(() => ({
  mockPreferences: {
    get: vi.fn(),
    set: vi.fn(),
  },
  mockLogger: {
    log: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Capacitor Preferences
vi.mock("@capacitor/preferences", () => ({
  Preferences: mockPreferences,
}));

// Mock logger
vi.mock("../../../lib/logger", () => ({
  logger: mockLogger,
}));

describe("useRecentSearches", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default to empty stored searches
    mockPreferences.get.mockResolvedValue({ value: null });
    mockPreferences.set.mockResolvedValue(undefined);
  });

  describe("initialization", () => {
    it("should load empty searches when no stored data", async () => {
      mockPreferences.get.mockResolvedValue({ value: null });

      const { result } = renderHook(() => useRecentSearches());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.recentSearches).toEqual([]);
    });

    it("should load stored searches on mount", async () => {
      const storedSearches: RecentSearch[] = [
        { query: "mario", system: "nes", tags: [], timestamp: 1000 },
        { query: "zelda", system: "snes", tags: ["action"], timestamp: 2000 },
      ];
      mockPreferences.get.mockResolvedValue({
        value: JSON.stringify(storedSearches),
      });

      const { result } = renderHook(() => useRecentSearches());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.recentSearches).toEqual(storedSearches);
    });

    it("should handle corrupted stored data gracefully", async () => {
      mockPreferences.get.mockResolvedValue({ value: "not valid json" });

      const { result } = renderHook(() => useRecentSearches());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should log error and have empty searches
      expect(mockLogger.error).toHaveBeenCalled();
      expect(result.current.recentSearches).toEqual([]);
    });
  });

  describe("addRecentSearch", () => {
    it("should add a new search with timestamp", async () => {
      const { result } = renderHook(() => useRecentSearches());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.addRecentSearch({
          query: "sonic",
          system: "genesis",
          tags: [],
        });
      });

      expect(result.current.recentSearches).toHaveLength(1);
      expect(result.current.recentSearches[0]?.query).toBe("sonic");
      expect(result.current.recentSearches[0]?.timestamp).toBeGreaterThan(0);
    });

    it("should deduplicate identical searches", async () => {
      const storedSearches: RecentSearch[] = [
        { query: "mario", system: "nes", tags: [], timestamp: 1000 },
      ];
      mockPreferences.get.mockResolvedValue({
        value: JSON.stringify(storedSearches),
      });

      const { result } = renderHook(() => useRecentSearches());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Add the same search again
      await act(async () => {
        await result.current.addRecentSearch({
          query: "mario",
          system: "nes",
          tags: [],
        });
      });

      // Should still only have 1 search
      expect(result.current.recentSearches).toHaveLength(1);

      // But with updated timestamp (newer)
      expect(result.current.recentSearches[0]?.timestamp).toBeGreaterThan(1000);
    });

    it("should limit to max 10 recent searches", async () => {
      const { result } = renderHook(() => useRecentSearches());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Add 12 searches
      for (let i = 0; i < 12; i++) {
        await act(async () => {
          await result.current.addRecentSearch({
            query: `game${i}`,
            system: "all",
            tags: [],
          });
        });
      }

      expect(result.current.recentSearches).toHaveLength(10);

      // Most recent should be first
      expect(result.current.recentSearches[0]?.query).toBe("game11");
    });

    it("should skip empty/meaningless searches", async () => {
      const { result } = renderHook(() => useRecentSearches());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Try to add empty search
      await act(async () => {
        await result.current.addRecentSearch({
          query: "",
          system: "all",
          tags: [],
        });
      });

      // Should not be added
      expect(result.current.recentSearches).toHaveLength(0);
    });

    it("should accept search with only system filter", async () => {
      const { result } = renderHook(() => useRecentSearches());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.addRecentSearch({
          query: "",
          system: "nes", // Not "all", so meaningful
          tags: [],
        });
      });

      expect(result.current.recentSearches).toHaveLength(1);
    });

    it("should accept search with only tags", async () => {
      const { result } = renderHook(() => useRecentSearches());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.addRecentSearch({
          query: "",
          system: "all",
          tags: ["action"],
        });
      });

      expect(result.current.recentSearches).toHaveLength(1);
    });

    it("should persist to Preferences", async () => {
      const { result } = renderHook(() => useRecentSearches());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.addRecentSearch({
          query: "test",
          system: "all",
          tags: [],
        });
      });

      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: "recentSearches",
        value: expect.any(String),
      });
    });
  });

  describe("clearRecentSearches", () => {
    it("should clear all searches", async () => {
      const storedSearches: RecentSearch[] = [
        { query: "mario", system: "nes", tags: [], timestamp: 1000 },
        { query: "zelda", system: "snes", tags: [], timestamp: 2000 },
      ];
      mockPreferences.get.mockResolvedValue({
        value: JSON.stringify(storedSearches),
      });

      const { result } = renderHook(() => useRecentSearches());

      await waitFor(() => {
        expect(result.current.recentSearches).toHaveLength(2);
      });

      await act(async () => {
        await result.current.clearRecentSearches();
      });

      expect(result.current.recentSearches).toHaveLength(0);
      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: "recentSearches",
        value: "[]",
      });
    });
  });

  describe("getSearchDisplayText", () => {
    it("should format query-only search", async () => {
      const { result } = renderHook(() => useRecentSearches());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const text = result.current.getSearchDisplayText({
        query: "mario",
        system: "all",
        tags: [],
        timestamp: 0,
      });

      expect(text).toBe('"mario"');
    });

    it("should format system-only search", async () => {
      const { result } = renderHook(() => useRecentSearches());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const text = result.current.getSearchDisplayText({
        query: "",
        system: "nes",
        tags: [],
        timestamp: 0,
      });

      expect(text).toBe("System: nes");
    });

    it("should format tags-only search", async () => {
      const { result } = renderHook(() => useRecentSearches());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const text = result.current.getSearchDisplayText({
        query: "",
        system: "all",
        tags: ["action", "rpg"],
        timestamp: 0,
      });

      expect(text).toBe("Tags: action, rpg");
    });

    it("should format combined search", async () => {
      const { result } = renderHook(() => useRecentSearches());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const text = result.current.getSearchDisplayText({
        query: "mario",
        system: "nes",
        tags: ["platformer"],
        timestamp: 0,
      });

      expect(text).toBe('"mario" • System: nes • Tags: platformer');
    });

    it('should return "All Media" for empty search', async () => {
      const { result } = renderHook(() => useRecentSearches());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const text = result.current.getSearchDisplayText({
        query: "",
        system: "all",
        tags: [],
        timestamp: 0,
      });

      expect(text).toBe("All Media");
    });
  });

  describe("deduplication logic", () => {
    it("should treat same tags in different order as equal", async () => {
      const storedSearches: RecentSearch[] = [
        {
          query: "test",
          system: "all",
          tags: ["action", "rpg"],
          timestamp: 1000,
        },
      ];
      mockPreferences.get.mockResolvedValue({
        value: JSON.stringify(storedSearches),
      });

      const { result } = renderHook(() => useRecentSearches());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Add search with same tags but different order
      await act(async () => {
        await result.current.addRecentSearch({
          query: "test",
          system: "all",
          tags: ["rpg", "action"], // Different order
        });
      });

      // Should deduplicate (same effective search)
      expect(result.current.recentSearches).toHaveLength(1);
    });
  });
});
