import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { Preferences } from "@capacitor/preferences";
import { useStatusStore } from "../lib/store";
import { useDataCache } from "./useDataCache";

// Mock Capacitor Preferences
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn()
  }
}));

// Mock the store
vi.mock("../lib/store", () => ({
  useStatusStore: vi.fn()
}));

describe("useDataCache", () => {
  const mockSetters = {
    setGamesIndex: vi.fn(),
    setLastToken: vi.fn(),
    setPlaying: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useStatusStore).mockReturnValue(mockSetters);
  });

  it("should load cached data on mount", async () => {
    const mockPreferences = vi.mocked(Preferences);
    mockPreferences.get.mockResolvedValue({ value: '{"test": "data"}' });

    await act(async () => {
      renderHook(() => useDataCache());
    });

    expect(mockPreferences.get).toHaveBeenCalledWith({ key: "cached_gamesIndex" });
  });

  it("should call store setters when cached data is loaded", async () => {
    const mockPreferences = vi.mocked(Preferences);
    const mockGamesIndex = { exists: true, indexing: false };
    mockPreferences.get.mockImplementation(({ key }) => {
      if (key === "cached_gamesIndex") {
        return Promise.resolve({ value: JSON.stringify(mockGamesIndex) });
      }
      return Promise.resolve({ value: null });
    });

    await act(async () => {
      renderHook(() => useDataCache());
    });

    await waitFor(() => {
      expect(mockSetters.setGamesIndex).toHaveBeenCalledWith(mockGamesIndex);
    });
  });

  it("should handle multiple cache types", async () => {
    const mockPreferences = vi.mocked(Preferences);
    const mockGamesIndex = { exists: true, indexing: false, totalSteps: 10 };
    const mockToken = { type: "test", uid: "123", text: "token", data: "data", scanTime: "now" };
    const mockPlaying = { systemId: "1", systemName: "Test", mediaPath: "/test", mediaName: "Game" };

    mockPreferences.get.mockImplementation(({ key }) => {
      switch (key) {
        case "cached_gamesIndex":
          return Promise.resolve({ value: JSON.stringify(mockGamesIndex) });
        case "cached_lastToken":
          return Promise.resolve({ value: JSON.stringify(mockToken) });
        case "cached_playing":
          return Promise.resolve({ value: JSON.stringify(mockPlaying) });
        default:
          return Promise.resolve({ value: null });
      }
    });

    await act(async () => {
      renderHook(() => useDataCache());
    });

    await waitFor(() => {
      expect(mockSetters.setGamesIndex).toHaveBeenCalledWith(mockGamesIndex);
      expect(mockSetters.setLastToken).toHaveBeenCalledWith(mockToken);
      expect(mockSetters.setPlaying).toHaveBeenCalledWith(mockPlaying);
    });
  });

  it("should load all cache keys on mount", async () => {
    const mockPreferences = vi.mocked(Preferences);
    mockPreferences.get.mockResolvedValue({ value: null });

    await act(async () => {
      renderHook(() => useDataCache());
    });

    // Wait for all async calls to complete
    await waitFor(() => {
      expect(mockPreferences.get).toHaveBeenCalledTimes(3);
    });

    expect(mockPreferences.get).toHaveBeenCalledWith({ key: "cached_gamesIndex" });
    expect(mockPreferences.get).toHaveBeenCalledWith({ key: "cached_lastToken" });
    expect(mockPreferences.get).toHaveBeenCalledWith({ key: "cached_playing" });
  });
});