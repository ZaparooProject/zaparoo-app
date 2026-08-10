import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Preferences } from "@capacitor/preferences";
import { DEFAULT_APP_REVIEW_CADENCE } from "@/lib/appReview";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { act, renderHook, waitFor } from "@/test-utils";
import { isPluginAvailable } from "@/lib/capacitorBridge";

// Mock Capacitor Preferences
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/capacitorBridge", () => ({
  isCapacitorPluginUnavailableError: vi.fn((error: unknown) =>
    error instanceof Error ? error.message.includes("not implemented") : false,
  ),
  isNativePluginAvailable: vi.fn(() => true),
  isPluginAvailable: vi.fn(() => true),
}));

// Mock sessionManager
vi.mock("@/lib/nfc", () => ({
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
      lifetimeProAccess: null,
      onlinePremiumAccess: null,
      preferRemoteWriter: false,
      shakeEnabled: false,
      shakeMode: "random",
      shakeZapscript: "",
      systemNameRegion: "auto",
      accessibleLists: false,
      appReviewCadence: { ...DEFAULT_APP_REVIEW_CADENCE },
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

  describe("app review cadence persistence", () => {
    it("should merge defaults into preferences saved before review tracking", async () => {
      vi.mocked(Preferences.get).mockResolvedValueOnce({
        value: JSON.stringify({
          state: { showFilenames: true },
          version: 0,
        }),
      });

      await usePreferencesStore.persist.rehydrate();

      expect(usePreferencesStore.getState().appReviewCadence).toEqual(
        DEFAULT_APP_REVIEW_CADENCE,
      );
    });

    it("should record launches and reset counters after an attempt", () => {
      const { result } = renderHook(() => usePreferencesStore());
      const firstDay = new Date(2026, 0, 1, 12).getTime();
      const secondDay = new Date(2026, 0, 2, 12).getTime();

      act(() => {
        result.current.recordAppReviewSuccessfulLaunch(firstDay);
        result.current.recordAppReviewSuccessfulLaunch(firstDay + 1_000);
        result.current.recordAppReviewSuccessfulLaunch(secondDay);
      });

      expect(result.current.appReviewCadence).toMatchObject({
        successfulLaunchCount: 3,
        distinctSuccessfulDayCount: 2,
        lastSuccessfulDay: "2026-01-02",
      });

      act(() => {
        result.current.recordAppReviewAttempt(secondDay + 1_000);
      });

      expect(result.current.appReviewCadence).toEqual({
        successfulLaunchCount: 0,
        distinctSuccessfulDayCount: 0,
        lastSuccessfulDay: null,
        lastAttemptAt: secondDay + 1_000,
      });
    });
  });

  describe("accessible list persistence", () => {
    it("should update the manual screen-reader list preference", () => {
      usePreferencesStore.getState().setAccessibleLists(true);

      expect(usePreferencesStore.getState().accessibleLists).toBe(true);
    });

    it("should hydrate a saved accessible-list preference", async () => {
      vi.mocked(Preferences.get).mockResolvedValueOnce({
        value: JSON.stringify({
          state: { accessibleLists: true },
          version: 0,
        }),
      });

      await usePreferencesStore.persist.rehydrate();

      expect(usePreferencesStore.getState().accessibleLists).toBe(true);
    });
  });

  describe("system name region persistence", () => {
    it("should update the preferred system-name region", () => {
      usePreferencesStore.getState().setSystemNameRegion("jp");

      expect(usePreferencesStore.getState().systemNameRegion).toBe("jp");
    });

    it("should hydrate a saved system-name region", async () => {
      vi.mocked(Preferences.get).mockResolvedValueOnce({
        value: JSON.stringify({
          state: { systemNameRegion: "eu" },
          version: 0,
        }),
      });

      await usePreferencesStore.persist.rehydrate();

      expect(usePreferencesStore.getState().systemNameRegion).toBe("eu");
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

    it("should grant launcher access for a lifetime Pro purchase", () => {
      const { result } = renderHook(() => usePreferencesStore());

      expect(result.current.launcherAccess).toBe(false);

      act(() => {
        result.current.setLifetimeProAccess(true);
      });

      expect(result.current.launcherAccess).toBe(true);
    });

    it("should retain effective launcher access across renders", () => {
      const { result, rerender } = renderHook(() => usePreferencesStore());

      act(() => {
        result.current.setLifetimeProAccess(true);
      });

      rerender();

      expect(result.current.launcherAccess).toBe(true);
    });
  });

  describe("source-aware purchase access", () => {
    it("should retain lifetime Pro when online access expires", () => {
      const { result } = renderHook(() => usePreferencesStore());

      act(() => {
        result.current.setLifetimeProAccess(true);
        result.current.setOnlinePremiumAccess(true);
        result.current.setOnlinePremiumAccess(false);
      });

      expect(result.current.lifetimeProAccess).toBe(true);
      expect(result.current.onlinePremiumAccess).toBe(false);
      expect(result.current.launcherAccess).toBe(true);
    });

    it("should preserve cached access while lifetime Pro status is pending", () => {
      usePreferencesStore.setState({ launcherAccess: true });
      const { result } = renderHook(() => usePreferencesStore());

      act(() => {
        result.current.setOnlinePremiumAccess(false);
      });

      expect(result.current.lifetimeProAccess).toBeNull();
      expect(result.current.onlinePremiumAccess).toBe(false);
      expect(result.current.launcherAccess).toBe(true);
    });

    it("should preserve cached access during account-state transitions", () => {
      usePreferencesStore.setState({ launcherAccess: true });
      const { result } = renderHook(() => usePreferencesStore());

      act(() => {
        result.current.beginOnlinePremiumAccessCheck();
      });
      expect(result.current.launcherAccess).toBe(true);

      act(() => {
        result.current.clearOnlinePremiumAccess();
      });
      expect(result.current.launcherAccess).toBe(true);
    });

    it("should clear previous account access while next status loads", () => {
      const { result } = renderHook(() => usePreferencesStore());

      act(() => {
        result.current.setLifetimeProAccess(false);
        result.current.setOnlinePremiumAccess(true);
        result.current.beginOnlinePremiumAccessCheck();
      });

      expect(result.current.onlinePremiumAccess).toBeNull();
      expect(result.current.launcherAccess).toBe(false);
    });

    it("should revoke temporary access on logout without revoking Pro", () => {
      const { result } = renderHook(() => usePreferencesStore());

      act(() => {
        result.current.setLifetimeProAccess(false);
        result.current.setOnlinePremiumAccess(true);
        result.current.clearOnlinePremiumAccess();
      });

      expect(result.current.onlinePremiumAccess).toBe(false);
      expect(result.current.launcherAccess).toBe(false);
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
