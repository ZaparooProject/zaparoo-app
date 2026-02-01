import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "../../../test-utils";
import { Preferences } from "@capacitor/preferences";
import { useDataCache } from "@/hooks/useDataCache";
import { useStatusStore } from "@/lib/store";
import { IndexResponse, TokenResponse, PlayingResponse } from "@/lib/models";

// Mock the logger
vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    log: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("useDataCache", () => {
  // Helper to get initial store state
  const getInitialStoreState = () => ({
    gamesIndex: {
      exists: true,
      indexing: false,
      optimizing: false,
      totalSteps: 0,
      currentStep: 0,
      currentStepDisplay: "",
      totalFiles: 0,
    },
    lastToken: { type: "", uid: "", text: "", data: "", scanTime: "" },
    playing: {
      systemId: "",
      systemName: "",
      mediaName: "",
      mediaPath: "",
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the store to initial state
    useStatusStore.setState({
      ...getInitialStoreState(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should load and parse cached_gamesIndex into store", async () => {
    const cachedGamesIndex: IndexResponse = {
      exists: true,
      indexing: false,
      optimizing: false,
      totalSteps: 5,
      currentStep: 3,
      currentStepDisplay: "Processing",
      totalFiles: 100,
    };

    // Set up the cached data
    await Preferences.set({
      key: "cached_gamesIndex",
      value: JSON.stringify(cachedGamesIndex),
    });

    renderHook(() => useDataCache());

    // Wait for the hook to load the cached data
    await waitFor(() => {
      const state = useStatusStore.getState();
      expect(state.gamesIndex).toEqual(cachedGamesIndex);
    });
  });

  it("should load and parse cached_lastToken into store", async () => {
    const cachedLastToken: TokenResponse = {
      type: "nfc",
      uid: "12345678",
      text: "game.launch:mario",
      data: "some-data",
      scanTime: "2024-01-15T10:30:00Z",
    };

    // Set up the cached data
    await Preferences.set({
      key: "cached_lastToken",
      value: JSON.stringify(cachedLastToken),
    });

    renderHook(() => useDataCache());

    // Wait for the hook to load the cached data
    await waitFor(() => {
      const state = useStatusStore.getState();
      expect(state.lastToken).toEqual(cachedLastToken);
    });
  });

  it("should load and parse cached_playing into store", async () => {
    const cachedPlaying: PlayingResponse = {
      systemId: "nes",
      systemName: "Nintendo Entertainment System",
      mediaName: "Super Mario Bros",
      mediaPath: "/games/nes/mario.nes",
    };

    // Set up the cached data
    await Preferences.set({
      key: "cached_playing",
      value: JSON.stringify(cachedPlaying),
    });

    renderHook(() => useDataCache());

    // Wait for the hook to load the cached data
    await waitFor(() => {
      const state = useStatusStore.getState();
      expect(state.playing).toEqual(cachedPlaying);
    });
  });

  it("should load all cached data at once", async () => {
    const cachedGamesIndex: IndexResponse = {
      exists: true,
      indexing: true,
      optimizing: false,
      totalSteps: 10,
      currentStep: 5,
      currentStepDisplay: "Indexing",
      totalFiles: 500,
    };
    const cachedLastToken: TokenResponse = {
      type: "barcode",
      uid: "abc123",
      text: "launch:zelda",
      data: "",
      scanTime: "2024-01-15T12:00:00Z",
    };
    const cachedPlaying: PlayingResponse = {
      systemId: "snes",
      systemName: "Super Nintendo",
      mediaName: "Zelda",
      mediaPath: "/games/snes/zelda.sfc",
    };

    // Set up all cached data
    await Preferences.set({
      key: "cached_gamesIndex",
      value: JSON.stringify(cachedGamesIndex),
    });
    await Preferences.set({
      key: "cached_lastToken",
      value: JSON.stringify(cachedLastToken),
    });
    await Preferences.set({
      key: "cached_playing",
      value: JSON.stringify(cachedPlaying),
    });

    renderHook(() => useDataCache());

    // Wait for all cached data to be loaded
    await waitFor(() => {
      const state = useStatusStore.getState();
      expect(state.gamesIndex).toEqual(cachedGamesIndex);
      expect(state.lastToken).toEqual(cachedLastToken);
      expect(state.playing).toEqual(cachedPlaying);
    });
  });

  it("should handle missing cache keys gracefully", async () => {
    // No cached data is set - all keys will return null

    renderHook(() => useDataCache());

    // The store should remain at initial state since no cached data exists
    // Wait a bit to ensure the hook has run
    await waitFor(() => {
      const state = useStatusStore.getState();
      // Store should still have initial values
      expect(state.gamesIndex.totalFiles).toBe(0);
      expect(state.lastToken.uid).toBe("");
      expect(state.playing.systemId).toBe("");
    });
  });

  it("should handle invalid JSON with error logging", async () => {
    const { logger } = await import("@/lib/logger");

    // Set invalid JSON
    await Preferences.set({
      key: "cached_gamesIndex",
      value: "not valid json",
    });

    renderHook(() => useDataCache());

    // Wait for error to be logged
    await waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to load cached data:",
        expect.any(SyntaxError),
        expect.objectContaining({
          category: "storage",
          action: "get",
          key: "cached_data",
          severity: "warning",
        }),
      );
    });
  });

  it("should handle Preferences.get failure with error logging", async () => {
    const { logger } = await import("@/lib/logger");
    const getError = new Error("Storage read failed");

    // Make Preferences.get reject
    vi.mocked(Preferences.get).mockRejectedValueOnce(getError);

    renderHook(() => useDataCache());

    // Wait for error to be logged
    await waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to load cached data:",
        getError,
        expect.objectContaining({
          category: "storage",
          action: "get",
          key: "cached_data",
          severity: "warning",
        }),
      );
    });
  });

  it("should only run once on mount", async () => {
    const cachedGamesIndex: IndexResponse = {
      exists: true,
      indexing: false,
      optimizing: false,
      totalSteps: 5,
      currentStep: 3,
      currentStepDisplay: "Done",
      totalFiles: 50,
    };

    await Preferences.set({
      key: "cached_gamesIndex",
      value: JSON.stringify(cachedGamesIndex),
    });

    const { rerender } = renderHook(() => useDataCache());

    // Wait for initial load
    await waitFor(() => {
      expect(useStatusStore.getState().gamesIndex).toEqual(cachedGamesIndex);
    });

    // Clear the mock to track new calls
    vi.mocked(Preferences.get).mockClear();

    // Rerender the hook
    rerender();

    // Preferences.get should not be called again (effect only runs once)
    // The dependencies are stable (setGamesIndex, setLastToken, setPlaying don't change)
    expect(Preferences.get).not.toHaveBeenCalled();
  });
});
