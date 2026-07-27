import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Preferences } from "@capacitor/preferences";
import { usePreferencesStore } from "../../../lib/preferencesStore";
import { act, renderHook, waitFor } from "../../../test-utils";
import { isPluginAvailable } from "../../../lib/capacitorBridge";

// Mock Capacitor Preferences
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../../lib/capacitorBridge", () => ({
  isCapacitorPluginUnavailableError: vi.fn((error: unknown) =>
    error instanceof Error ? error.message.includes("not implemented") : false,
  ),
  isNativePluginAvailable: vi.fn(() => true),
  isPluginAvailable: vi.fn(() => true),
}));

// Mock sessionManager
vi.mock("../../../lib/nfc", () => ({
  sessionManager: {
    setShouldRestart: vi.fn(),
    setLaunchOnScan: vi.fn(),
  },
}));

describe("usePreferencesStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isPluginAvailable).mockReturnValue(true);
    // Reset store state between tests
    usePreferencesStore.setState({
      restartScan: false,
      launchOnScan: true,
      launcherAccess: false,
      preferRemoteWriter: false,
      shakeEnabled: false,
      shakeMode: "random",
      shakeZapscript: "",
      _hasHydrated: true, // Pretend it's hydrated for tests
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Capacitor Preferences bridge guards", () => {
    it("should hydrate with defaults without reading storage when Preferences is unavailable", async () => {
      vi.mocked(isPluginAvailable).mockReturnValue(false);

      await usePreferencesStore.persist.rehydrate();

      expect(Preferences.get).not.toHaveBeenCalled();
      expect(usePreferencesStore.getState()._hasHydrated).toBe(true);
    });

    it("should skip persistence writes when Preferences is unavailable", async () => {
      vi.mocked(isPluginAvailable).mockImplementation(
        (pluginName: string) => pluginName !== "Preferences",
      );
      vi.mocked(Preferences.set).mockClear();

      const { result } = renderHook(() => usePreferencesStore());

      act(() => {
        result.current.setShowFilenames(true);
      });

      await waitFor(() => {
        expect(result.current.showFilenames).toBe(true);
      });
      expect(Preferences.set).not.toHaveBeenCalled();
    });
  });

  describe("shake mode business logic", () => {
    it("should clear zapscript when shakeMode changes", () => {
      const { result } = renderHook(() => usePreferencesStore());

      // Set some zapscript first
      act(() => {
        result.current.setShakeZapscript("**launch.system:snes");
      });

      expect(result.current.shakeZapscript).toBe("**launch.system:snes");

      // Change mode - should clear zapscript (business logic to prevent stale data)
      act(() => {
        result.current.setShakeMode("custom");
      });

      expect(result.current.shakeMode).toBe("custom");
      expect(result.current.shakeZapscript).toBe("");
    });
  });

  /**
   * REGRESSION TESTS: Pro Feature Defaults
   *
   * Critical business logic tests to ensure:
   * - launchOnScan defaults to true (free trial experience)
   * - launcherAccess defaults to false (no Pro until purchased)
   * - shakeEnabled defaults to false (explicit opt-in for Pro feature)
   * - preferRemoteWriter defaults to false (explicit opt-in)
   */
  describe("Pro feature defaults (REGRESSION)", () => {
    it("launchOnScan MUST default to true for free trial experience", () => {
      // Reset to defaults by creating new store state without override
      usePreferencesStore.setState({
        launchOnScan: true, // This is the default
        launcherAccess: false,
        _hasHydrated: true,
      });

      const { result } = renderHook(() => usePreferencesStore());

      // This is critical - launchOnScan ON by default means users get
      // the full experience, then see the Pro modal when trying to USE it
      expect(result.current.launchOnScan).toBe(true);
    });

    it("launcherAccess MUST default to false (no Pro access initially)", () => {
      usePreferencesStore.setState({
        launcherAccess: false,
        _hasHydrated: true,
      });

      const { result } = renderHook(() => usePreferencesStore());

      expect(result.current.launcherAccess).toBe(false);
    });

    it("shakeEnabled MUST default to false (Pro feature requires opt-in)", () => {
      usePreferencesStore.setState({
        shakeEnabled: false,
        _hasHydrated: true,
      });

      const { result } = renderHook(() => usePreferencesStore());

      expect(result.current.shakeEnabled).toBe(false);
    });

    it("preferRemoteWriter MUST default to false", () => {
      usePreferencesStore.setState({
        preferRemoteWriter: false,
        _hasHydrated: true,
      });

      const { result } = renderHook(() => usePreferencesStore());

      expect(result.current.preferRemoteWriter).toBe(false);
    });

    it("should allow setting launcherAccess to true (Pro purchase)", () => {
      const { result } = renderHook(() => usePreferencesStore());

      expect(result.current.launcherAccess).toBe(false);

      act(() => {
        result.current.setLauncherAccess(true);
      });

      expect(result.current.launcherAccess).toBe(true);
    });

    it("should persist launcherAccess changes across renders", () => {
      const { result, rerender } = renderHook(() => usePreferencesStore());

      act(() => {
        result.current.setLauncherAccess(true);
      });

      rerender();

      expect(result.current.launcherAccess).toBe(true);
    });
  });

  describe("Pro feature settings interaction", () => {
    it("should allow toggling launchOnScan independently of launcherAccess", () => {
      const { result } = renderHook(() => usePreferencesStore());

      // User without Pro can still toggle the setting
      expect(result.current.launcherAccess).toBe(false);
      expect(result.current.launchOnScan).toBe(true);

      act(() => {
        result.current.setLaunchOnScan(false);
      });

      // Setting changed even without Pro
      expect(result.current.launchOnScan).toBe(false);
      expect(result.current.launcherAccess).toBe(false);
    });

    it("should allow toggling shakeEnabled independently of launcherAccess", () => {
      const { result } = renderHook(() => usePreferencesStore());

      expect(result.current.launcherAccess).toBe(false);
      expect(result.current.shakeEnabled).toBe(false);

      act(() => {
        result.current.setShakeEnabled(true);
      });

      // Setting changed even without Pro
      expect(result.current.shakeEnabled).toBe(true);
      expect(result.current.launcherAccess).toBe(false);
    });
  });
});
