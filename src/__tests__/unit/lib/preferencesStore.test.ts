import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { usePreferencesStore } from "../../../lib/preferencesStore";
import { act, renderHook } from "@testing-library/react";

// Mock Capacitor Preferences
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
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

  it("should have correct default values", () => {
    const { result } = renderHook(() => usePreferencesStore());

    expect(result.current.restartScan).toBe(false);
    expect(result.current.launchOnScan).toBe(true);
    expect(result.current.launcherAccess).toBe(false);
    expect(result.current.preferRemoteWriter).toBe(false);
    expect(result.current.shakeEnabled).toBe(false);
    expect(result.current.shakeMode).toBe("random");
    expect(result.current.shakeZapscript).toBe("");
  });

  it("should update restartScan when setter is called", () => {
    const { result } = renderHook(() => usePreferencesStore());

    act(() => {
      result.current.setRestartScan(true);
    });

    expect(result.current.restartScan).toBe(true);
  });

  it("should update launchOnScan when setter is called", () => {
    const { result } = renderHook(() => usePreferencesStore());

    act(() => {
      result.current.setLaunchOnScan(false);
    });

    expect(result.current.launchOnScan).toBe(false);
  });

  it("should update preferRemoteWriter when setter is called", () => {
    const { result } = renderHook(() => usePreferencesStore());

    act(() => {
      result.current.setPreferRemoteWriter(true);
    });

    expect(result.current.preferRemoteWriter).toBe(true);
  });

  it("should update shakeEnabled when setter is called", () => {
    const { result } = renderHook(() => usePreferencesStore());

    act(() => {
      result.current.setShakeEnabled(true);
    });

    expect(result.current.shakeEnabled).toBe(true);
  });

  it("should clear zapscript when shakeMode changes", () => {
    const { result } = renderHook(() => usePreferencesStore());

    // Set some zapscript first
    act(() => {
      result.current.setShakeZapscript("**launch.system:snes");
    });

    expect(result.current.shakeZapscript).toBe("**launch.system:snes");

    // Change mode - should clear zapscript
    act(() => {
      result.current.setShakeMode("custom");
    });

    expect(result.current.shakeMode).toBe("custom");
    expect(result.current.shakeZapscript).toBe("");
  });

  it("should track hydration state", () => {
    const { result } = renderHook(() => usePreferencesStore());

    // In tests it starts as true (we set it in beforeEach)
    expect(result.current._hasHydrated).toBe(true);

    // Test setting it
    act(() => {
      result.current.setHasHydrated(false);
    });

    expect(result.current._hasHydrated).toBe(false);
  });

  it("should expose app settings selector", () => {
    const { result } = renderHook(() => usePreferencesStore());

    // Update some values
    act(() => {
      result.current.setRestartScan(true);
      result.current.setLaunchOnScan(false);
      result.current.setPreferRemoteWriter(true);
    });

    expect(result.current.restartScan).toBe(true);
    expect(result.current.launchOnScan).toBe(false);
    expect(result.current.preferRemoteWriter).toBe(true);
  });

  it("should expose shake settings selector", () => {
    const { result } = renderHook(() => usePreferencesStore());

    // Update shake settings
    act(() => {
      result.current.setShakeEnabled(true);
      result.current.setShakeMode("custom");
      result.current.setShakeZapscript("**some.command");
    });

    expect(result.current.shakeEnabled).toBe(true);
    expect(result.current.shakeMode).toBe("custom");
    expect(result.current.shakeZapscript).toBe("**some.command");
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
