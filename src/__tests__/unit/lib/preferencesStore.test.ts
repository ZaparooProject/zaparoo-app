import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { DEFAULT_APP_REVIEW_CADENCE } from "@/lib/appReview";
import {
  __resetPreferenceHydrationForTests,
  retryDegradedPreferenceHydration,
  usePreferencesStore,
} from "@/lib/preferencesStore";
import { act, renderHook, waitFor } from "@/test-utils";
import { isPluginAvailable } from "@/lib/capacitorBridge";
import { logger } from "@/lib/logger";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
}));

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

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock sessionManager
vi.mock("@/lib/nfc", () => ({
  sessionManager: {
    setShouldRestart: vi.fn(),
    setLaunchOnScan: vi.fn(),
  },
}));

describe("usePreferencesStore", () => {
  beforeEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.mocked(isPluginAvailable).mockReturnValue(true);
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.mocked(Preferences.get).mockResolvedValue({ value: null });
    __resetPreferenceHydrationForTests();

    // A successful hydration resets module-level retry/write bookkeeping left
    // by a prior failure-path test, keeping tests independent of execution order.
    await usePreferencesStore.persist.rehydrate();
    usePreferencesStore.setState({
      restartScan: false,
      launchOnScan: true,
      launcherAccess: false,
      lifetimeProAccess: null,
      storeVerifiedProAccess: false,
      onlinePremiumAccess: null,
      preferRemoteWriter: false,
      shakeEnabled: false,
      shakeMode: "random",
      shakeZapscript: "",
      systemNameRegion: "auto",
      appBadgeEnabled: true,
      accessibleLists: false,
      appReviewCadence: { ...DEFAULT_APP_REVIEW_CADENCE },
      _hasHydrated: true, // Pretend it's hydrated for tests
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("Capacitor Preferences bridge guards", () => {
    it("should hydrate web defaults without reading unavailable storage", async () => {
      vi.mocked(isPluginAvailable).mockReturnValue(false);

      await usePreferencesStore.persist.rehydrate();

      expect(Preferences.get).not.toHaveBeenCalled();
      expect(usePreferencesStore.getState()._hasHydrated).toBe(true);
      expect(
        usePreferencesStore.getState()._preferencesHydrationSucceeded,
      ).toBe(true);
    });

    it("should reject native OTA trust when Preferences is unavailable", async () => {
      vi.useFakeTimers();
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(isPluginAvailable).mockReturnValue(false);
      usePreferencesStore.setState({
        _hasHydrated: false,
        _preferencesHydrationSucceeded: true,
      });
      vi.mocked(Preferences.set).mockClear();

      await usePreferencesStore.persist.rehydrate();
      await vi.advanceTimersByTimeAsync(250);
      await vi.advanceTimersByTimeAsync(250);

      expect(Preferences.get).not.toHaveBeenCalled();
      expect(Preferences.set).not.toHaveBeenCalled();
      expect(usePreferencesStore.getState()._hasHydrated).toBe(true);
      expect(
        usePreferencesStore.getState()._preferencesHydrationSucceeded,
      ).toBe(false);
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

    it("should retry a failed read before enabling persistence writes", async () => {
      vi.useFakeTimers();
      usePreferencesStore.setState({
        _hasHydrated: false,
        showFilenames: false,
      });
      vi.mocked(Preferences.set).mockClear();
      vi.mocked(Preferences.get)
        .mockRejectedValueOnce(new Error("Preferences bridge failed"))
        .mockResolvedValueOnce({
          value: JSON.stringify({
            state: { showFilenames: true },
            version: 0,
          }),
        });

      await usePreferencesStore.persist.rehydrate();

      expect(usePreferencesStore.getState()._hasHydrated).toBe(false);
      expect(
        usePreferencesStore.getState()._preferencesHydrationSucceeded,
      ).toBe(false);
      expect(Preferences.set).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(250);
      await vi.waitFor(() => {
        expect(Preferences.get).toHaveBeenCalledTimes(2);
        expect(usePreferencesStore.getState()._hasHydrated).toBe(true);
      });

      expect(usePreferencesStore.getState().showFilenames).toBe(true);
      expect(
        usePreferencesStore.getState()._preferencesHydrationSucceeded,
      ).toBe(true);
    });

    it("should bound hanging reads and continue with nonpersistent defaults", async () => {
      vi.useFakeTimers();
      usePreferencesStore.setState({
        _hasHydrated: false,
        showFilenames: false,
      });
      vi.mocked(Preferences.set).mockClear();
      vi.mocked(Preferences.get).mockImplementation(
        () => new Promise(() => undefined),
      );

      const firstHydration = usePreferencesStore.persist.rehydrate();
      await vi.advanceTimersByTimeAsync(1_500);
      await firstHydration;
      expect(usePreferencesStore.getState()._hasHydrated).toBe(false);

      await vi.advanceTimersByTimeAsync(250 + 1_500 + 250 + 1_500);

      // Retries wait on the stalled read instead of starting new ones.
      expect(Preferences.get).toHaveBeenCalledTimes(1);
      expect(usePreferencesStore.getState()._hasHydrated).toBe(true);
      expect(
        usePreferencesStore.getState()._preferencesHydrationSucceeded,
      ).toBe(false);
      expect(Preferences.set).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        "Preference persistence disabled after hydration retries",
        expect.objectContaining({ name: "PreferenceReadTimeoutError" }),
        {
          category: "storage",
          action: "disablePreferencePersistence",
          severity: "error",
          attempts: 3,
          elapsedMs: 5_000,
          timedOut: true,
        },
      );
    });

    it("should merge a timed-out read that lands after the fallback", async () => {
      vi.useFakeTimers();
      usePreferencesStore.setState({
        _hasHydrated: false,
        showFilenames: false,
        tourCompleted: false,
      });
      vi.mocked(Preferences.set).mockClear();
      let resolveRead!: (result: { value: string | null }) => void;
      vi.mocked(Preferences.get).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRead = resolve;
          }),
      );

      void usePreferencesStore.persist.rehydrate();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(
        usePreferencesStore.getState()._preferencesHydrationSucceeded,
      ).toBe(false);

      await vi.advanceTimersByTimeAsync(2_000);
      resolveRead({
        value: JSON.stringify({
          state: { showFilenames: true, tourCompleted: true },
          version: 0,
        }),
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(
        usePreferencesStore.getState()._preferencesHydrationSucceeded,
      ).toBe(true);
      expect(Preferences.get).toHaveBeenCalledTimes(1);
      expect(usePreferencesStore.getState()).toMatchObject({
        _hasHydrated: true,
        showFilenames: true,
        tourCompleted: true,
      });
      expect(logger.error).toHaveBeenLastCalledWith(
        "Recovered app preferences after hydration fallback",
        {
          category: "storage",
          action: "recoverPreferencePersistence",
          severity: "info",
          elapsedMs: 7_000,
          keysKeptFromDegradedSession: 0,
        },
      );

      // Writes are enabled again once the saved state is in memory.
      usePreferencesStore.getState().setAccessibleLists(true);
      await vi.waitFor(() => {
        expect(Preferences.set).toHaveBeenCalled();
      });
      const persisted = vi.mocked(Preferences.set).mock.calls.at(-1)?.[0];
      expect(persisted?.value).toContain('"tourCompleted":true');
      expect(persisted?.value).toContain('"accessibleLists":true');
    });

    it("should keep settings changed while degraded when the late read lands", async () => {
      vi.useFakeTimers();
      usePreferencesStore.setState({
        _hasHydrated: false,
        hapticsEnabled: true,
        showFilenames: false,
        textZoomLevel: 1,
      });
      vi.mocked(Preferences.set).mockClear();
      let resolveRead!: (result: { value: string | null }) => void;
      vi.mocked(Preferences.get).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRead = resolve;
          }),
      );

      void usePreferencesStore.persist.rehydrate();
      await vi.advanceTimersByTimeAsync(5_000);

      const preferences = usePreferencesStore.getState();
      preferences.setTextZoomLevel(1.25);
      // Toggled back to its default: still an explicit choice this session.
      preferences.setHapticsEnabled(false);
      preferences.setHapticsEnabled(true);
      expect(Preferences.set).not.toHaveBeenCalled();

      resolveRead({
        value: JSON.stringify({
          state: {
            hapticsEnabled: false,
            showFilenames: true,
            textZoomLevel: 1.5,
          },
          version: 0,
        }),
      });

      await vi.waitFor(() => {
        expect(
          usePreferencesStore.getState()._preferencesHydrationSucceeded,
        ).toBe(true);
      });
      expect(usePreferencesStore.getState()).toMatchObject({
        hapticsEnabled: true,
        showFilenames: true,
        textZoomLevel: 1.25,
      });
      const persisted = vi.mocked(Preferences.set).mock.calls.at(-1)?.[0];
      expect(persisted?.value).toContain('"hapticsEnabled":true');
      expect(persisted?.value).toContain('"showFilenames":true');
      expect(persisted?.value).toContain('"textZoomLevel":1.25');
      expect(logger.error).toHaveBeenLastCalledWith(
        "Recovered app preferences after hydration fallback",
        expect.objectContaining({ keysKeptFromDegradedSession: 2 }),
      );
    });

    it("should use late cached launcher access only while an access check is pending", async () => {
      vi.useFakeTimers();
      const storedAccess = JSON.stringify({
        state: { launcherAccess: true },
        version: 0,
      });
      let resolveRead!: (result: { value: string | null }) => void;
      vi.mocked(Preferences.get).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRead = resolve;
          }),
      );

      usePreferencesStore.setState({ _hasHydrated: false });
      void usePreferencesStore.persist.rehydrate();
      await vi.advanceTimersByTimeAsync(5_000);
      // RevenueCat has no lifetime entitlement; online status still loading.
      usePreferencesStore.getState().setLifetimeProAccess(false);
      resolveRead({ value: storedAccess });
      await vi.waitFor(() => {
        expect(
          usePreferencesStore.getState()._preferencesHydrationSucceeded,
        ).toBe(true);
      });
      expect(usePreferencesStore.getState().launcherAccess).toBe(true);

      __resetPreferenceHydrationForTests();
      usePreferencesStore.setState({
        _hasHydrated: false,
        launcherAccess: false,
        lifetimeProAccess: null,
        onlinePremiumAccess: null,
      });
      void usePreferencesStore.persist.rehydrate();
      await vi.advanceTimersByTimeAsync(5_000);
      // Both checks answered without access before storage arrived.
      usePreferencesStore.getState().setLifetimeProAccess(false);
      usePreferencesStore.getState().clearOnlinePremiumAccess();
      resolveRead({ value: storedAccess });
      await vi.waitFor(() => {
        expect(
          usePreferencesStore.getState()._preferencesHydrationSucceeded,
        ).toBe(true);
      });
      expect(usePreferencesStore.getState().launcherAccess).toBe(false);
    });

    it("should retry degraded storage with a fresh read once the stalled read is stale", async () => {
      vi.useFakeTimers();
      usePreferencesStore.setState({
        _hasHydrated: false,
        showFilenames: false,
      });
      vi.mocked(Preferences.get).mockImplementationOnce(
        () => new Promise(() => undefined),
      );

      void usePreferencesStore.persist.rehydrate();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(Preferences.get).toHaveBeenCalledTimes(1);

      // A recent read is still expected to land.
      retryDegradedPreferenceHydration();
      expect(Preferences.get).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(5_000);
      vi.mocked(Preferences.get).mockResolvedValueOnce({
        value: JSON.stringify({ state: { showFilenames: true }, version: 0 }),
      });
      retryDegradedPreferenceHydration();

      await vi.waitFor(() => {
        expect(
          usePreferencesStore.getState()._preferencesHydrationSucceeded,
        ).toBe(true);
      });
      expect(Preferences.get).toHaveBeenCalledTimes(2);
      expect(usePreferencesStore.getState().showFilenames).toBe(true);

      // Nothing to retry once storage is healthy.
      retryDegradedPreferenceHydration();
      expect(Preferences.get).toHaveBeenCalledTimes(2);
    });

    it("should retry degraded storage after a failed read without reporting again", async () => {
      vi.useFakeTimers();
      usePreferencesStore.setState({ _hasHydrated: false });
      vi.mocked(Preferences.get).mockRejectedValue(
        new Error("Preferences bridge failed"),
      );

      void usePreferencesStore.persist.rehydrate();
      await vi.advanceTimersByTimeAsync(500);
      expect(usePreferencesStore.getState()._hasHydrated).toBe(true);
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledTimes(2);

      retryDegradedPreferenceHydration();
      await vi.waitFor(() => {
        expect(Preferences.get).toHaveBeenCalledTimes(4);
      });
      await vi.advanceTimersByTimeAsync(1_000);
      expect(
        usePreferencesStore.getState()._preferencesHydrationSucceeded,
      ).toBe(false);
      expect(logger.error).toHaveBeenCalledTimes(1);

      vi.mocked(Preferences.get).mockResolvedValue({ value: null });
      retryDegradedPreferenceHydration();
      await vi.waitFor(() => {
        expect(
          usePreferencesStore.getState()._preferencesHydrationSucceeded,
        ).toBe(true);
      });
    });

    it("should start with defaults without overwriting storage after retries fail", async () => {
      vi.useFakeTimers();
      usePreferencesStore.setState({
        _hasHydrated: false,
        showFilenames: false,
      });
      vi.mocked(Preferences.set).mockClear();
      vi.mocked(Preferences.get).mockRejectedValue(
        new Error("Preferences bridge failed"),
      );

      await usePreferencesStore.persist.rehydrate();
      await vi.advanceTimersByTimeAsync(250);
      await vi.waitFor(() => {
        expect(Preferences.get).toHaveBeenCalledTimes(2);
      });
      await vi.advanceTimersByTimeAsync(250);
      await vi.waitFor(() => {
        expect(Preferences.get).toHaveBeenCalledTimes(3);
        expect(usePreferencesStore.getState()._hasHydrated).toBe(true);
      });

      expect(Preferences.set).not.toHaveBeenCalled();
      expect(
        usePreferencesStore.getState()._preferencesHydrationSucceeded,
      ).toBe(false);
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        "Preference persistence disabled after hydration retries",
        expect.any(Error),
        {
          category: "storage",
          action: "disablePreferencePersistence",
          severity: "error",
          attempts: 3,
          elapsedMs: 500,
          timedOut: false,
        },
      );
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

  describe("app badge persistence", () => {
    it("should persist the app badge opt-out", async () => {
      usePreferencesStore.getState().setAppBadgeEnabled(false);

      expect(usePreferencesStore.getState().appBadgeEnabled).toBe(false);

      await waitFor(() => {
        expect(Preferences.set).toHaveBeenCalled();
      });
      const persisted = vi.mocked(Preferences.set).mock.calls.at(-1)?.[0];
      expect(persisted?.value).toContain('"appBadgeEnabled":false');
    });

    it("should default to enabled for preferences saved before badge control", async () => {
      vi.mocked(Preferences.get).mockResolvedValueOnce({
        value: JSON.stringify({
          state: { showFilenames: true },
          version: 0,
        }),
      });

      await usePreferencesStore.persist.rehydrate();

      expect(usePreferencesStore.getState().appBadgeEnabled).toBe(true);
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
    it("should preserve store-verified Pro when RevenueCat has no entitlement", () => {
      const { result } = renderHook(() => usePreferencesStore());

      act(() => {
        result.current.setStoreVerifiedProAccess(true);
        result.current.setLifetimeProAccess(false);
      });

      expect(result.current.storeVerifiedProAccess).toBe(true);
      expect(result.current.lifetimeProAccess).toBe(true);
      expect(result.current.launcherAccess).toBe(true);
    });

    it("should drop Pro access when a clean restore clears the store-verified fallback", () => {
      // Warp status already resolved to inactive (not the pending/unknown
      // "null" state), so launcherAccess isn't held open by the separate
      // pending-Warp-check preservation the launcherAccess reducer applies.
      usePreferencesStore.setState({ onlinePremiumAccess: false });
      const { result } = renderHook(() => usePreferencesStore());

      act(() => {
        // Simulate the earlier "already owned" fallback...
        result.current.setStoreVerifiedProAccess(true);
        result.current.setLifetimeProAccess(false);
      });
      expect(result.current.lifetimeProAccess).toBe(true);

      act(() => {
        // ...then a later restore that cleanly reports no Pro entitlement,
        // in the order callers use: clear the fallback before recording the
        // fresh result, so the interlock doesn't re-force it back to true.
        result.current.setStoreVerifiedProAccess(false);
        result.current.setLifetimeProAccess(false);
      });

      expect(result.current.storeVerifiedProAccess).toBe(false);
      expect(result.current.lifetimeProAccess).toBe(false);
      expect(result.current.launcherAccess).toBe(false);
    });

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
