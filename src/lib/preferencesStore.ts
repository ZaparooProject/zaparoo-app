import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { TextZoom } from "@capacitor/text-zoom";
import {
  DEFAULT_APP_REVIEW_CADENCE,
  recordAppReviewAttempt,
  recordSuccessfulAppReviewLaunch,
  type AppReviewCadenceState,
} from "@/lib/appReview";
import type { SystemNameRegionPreference } from "@/lib/systemNames";
import { logger } from "./logger";
import { sessionManager } from "./nfc";
import {
  isCapacitorPluginUnavailableError,
  isNativePluginAvailable,
  isPluginAvailable,
} from "./capacitorBridge";

/**
 * Preferences Store
 *
 * Centralized store for all app preferences using Zustand with persist middleware.
 * This replaces scattered Preferences.get/set calls throughout the app. This
 * is mainly to prevent layout shifts when reading preferences/purchases on
 * page loads.
 */

// Blocks writes to storage until the initial hydration read completes.
// Without this, synchronous state updates that fire before the async
// Preferences.get() resolves (e.g. web-platform availability checks in
// useNfcAvailabilityCheck) trigger a persist write with default values,
// clobbering the stored state (e.g. tourCompleted: true → false).
let _storageWritesEnabled = false;
const PREFERENCES_STORAGE_KEY = "app-preferences";
const PREFERENCE_HYDRATION_MAX_ATTEMPTS = 3;
const PREFERENCE_HYDRATION_RETRY_DELAY_MS = 250;
const PREFERENCE_READ_TIMEOUT_MS = 1_500;
// A read still unanswered this long after it started is presumed lost when the
// app resumes, so the resume retry starts a fresh one.
const PREFERENCE_STALE_READ_MS = 10_000;
let _preferenceHydrationAttempts = 0;
let _preferenceHydrationStartedAt: number | null = null;
let _preferenceHydrationRetryTimer: ReturnType<typeof setTimeout> | null = null;
// True after startup gave up on storage and continued with in-memory defaults,
// until a later read succeeds.
let _preferencesDegraded = false;
// Persisted keys changed while degraded. They are newer than anything a late
// read returns, so they keep their in-memory values when it is merged.
const _preferenceKeysChangedWhileDegraded = new Set<string>();
let _preferenceKeysKeptOnRecovery = 0;
let _latePreferenceReadWatch: Promise<unknown> | null = null;

class PreferenceReadTimeoutError extends Error {
  constructor() {
    super("Preferences read timed out");
    this.name = "PreferenceReadTimeoutError";
  }
}

interface PendingPreferenceRead {
  promise: Promise<{ value: string | null }>;
  startedAt: number;
}

// One native read per key. A read that outlives its timeout stays pending so
// retries and degraded-session recovery reuse its result instead of starting
// new reads (and discarding the first) while the native bridge is stalled.
const pendingPreferenceReads = new Map<string, PendingPreferenceRead>();

function forgetPendingPreferenceRead(
  name: string,
  read: PendingPreferenceRead["promise"],
): void {
  if (pendingPreferenceReads.get(name)?.promise === read) {
    pendingPreferenceReads.delete(name);
  }
}

function readPreference(name: string): PendingPreferenceRead["promise"] {
  const pending = pendingPreferenceReads.get(name);
  if (pending) return pending.promise;

  const promise = Preferences.get({ key: name });
  pendingPreferenceReads.set(name, { promise, startedAt: Date.now() });
  // A failed read must not be reused; the next attempt starts a fresh one.
  promise.catch(() => forgetPendingPreferenceRead(name, promise));
  return promise;
}

async function getPreferenceWithTimeout(
  name: string,
): Promise<{ value: string | null }> {
  const read = readPreference(name);
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    const result = await Promise.race([
      read,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new PreferenceReadTimeoutError());
        }, PREFERENCE_READ_TIMEOUT_MS);
      }),
    ]);
    forgetPendingPreferenceRead(name, read);
    return result;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

// Merge the timed-out read once it lands instead of waiting for the next
// launch. Only the degraded session needs this; a normal retry consumes it.
function recoverWhenPendingPreferenceReadLands(): void {
  const pending = pendingPreferenceReads.get(PREFERENCES_STORAGE_KEY);
  if (!pending || _latePreferenceReadWatch === pending.promise) return;

  const watched = pending.promise;
  _latePreferenceReadWatch = watched;
  watched.then(
    () => {
      if (_latePreferenceReadWatch !== watched) return;
      _latePreferenceReadWatch = null;
      if (_preferencesDegraded) void usePreferencesStore.persist.rehydrate();
    },
    (error: unknown) => {
      if (_latePreferenceReadWatch !== watched) return;
      _latePreferenceReadWatch = null;
      logger.warn("Late preference read failed", error);
    },
  );
}

/**
 * Retries storage after startup fell back to in-memory defaults, e.g. when the
 * app resumes. A recent read that is still in flight is left to finish.
 */
export function retryDegradedPreferenceHydration(): void {
  if (!_preferencesDegraded) return;

  const pending = pendingPreferenceReads.get(PREFERENCES_STORAGE_KEY);
  if (pending) {
    if (Date.now() - pending.startedAt < PREFERENCE_STALE_READ_MS) return;
    pendingPreferenceReads.delete(PREFERENCES_STORAGE_KEY);
    _latePreferenceReadWatch = null;
  }

  void usePreferencesStore.persist.rehydrate();
}

export function __resetPreferenceHydrationForTests(): void {
  pendingPreferenceReads.clear();
  if (_preferenceHydrationRetryTimer) {
    clearTimeout(_preferenceHydrationRetryTimer);
    _preferenceHydrationRetryTimer = null;
  }
  _preferenceHydrationAttempts = 0;
  _preferenceHydrationStartedAt = null;
  _preferencesDegraded = false;
  _preferenceKeysChangedWhileDegraded.clear();
  _preferenceKeysKeptOnRecovery = 0;
  _latePreferenceReadWatch = null;
}

// Custom storage adapter for Capacitor Preferences
const capacitorPreferencesStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (!isPluginAvailable("Preferences")) {
      if (Capacitor.isNativePlatform()) {
        throw new Error("Preferences plugin unavailable on native platform");
      }
      return null;
    }

    try {
      const result = await getPreferenceWithTimeout(name);
      return result.value;
    } catch (e) {
      if (
        isCapacitorPluginUnavailableError(e) &&
        !Capacitor.isNativePlatform()
      ) {
        return null;
      }
      throw e;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (!_storageWritesEnabled || !isPluginAvailable("Preferences")) return;

    try {
      await Preferences.set({ key: name, value });
    } catch (e) {
      if (!isCapacitorPluginUnavailableError(e)) throw e;
    }
  },
  removeItem: async (name: string): Promise<void> => {
    if (!isPluginAvailable("Preferences")) return;

    try {
      await Preferences.remove({ key: name });
    } catch (e) {
      if (!isCapacitorPluginUnavailableError(e)) throw e;
    }
  },
};

// Preferences state interface
export interface PreferencesState {
  // App settings
  restartScan: boolean;
  launchOnScan: boolean;
  launcherAccess: boolean;
  lifetimeProAccess: boolean | null;
  storeVerifiedProAccess: boolean;
  onlinePremiumAccess: boolean | null;
  preferRemoteWriter: boolean;

  // Shake to launch settings
  shakeEnabled: boolean;
  shakeMode: "random" | "custom";
  shakeZapscript: string;

  // Custom zapscript page text (separate from shake zapscript)
  customText: string;

  // Tour completion tracking
  tourCompleted: boolean;

  // Native app-review prompt cadence
  appReviewCadence: AppReviewCadenceState;

  // What's new tracking
  whatsNewInitialized: boolean;
  lastWhatsNewRuntimeKey: string | null;
  seenWhatsNewAnnouncementIds: string[];

  // Log viewer settings
  logLevelFilters: {
    debug: boolean;
    info: boolean;
    warn: boolean;
    error: boolean;
  };

  // Display settings
  showFilenames: boolean;
  systemNameRegion: SystemNameRegionPreference;
  appBadgeEnabled: boolean;

  // Accessibility settings
  hapticsEnabled: boolean;
  textZoomLevel: number;
  accessibleLists: boolean;

  // Hydration tracking (internal, not persisted)
  _hasHydrated: boolean;
  _preferencesHydrationSucceeded: boolean;
  // The storage fallback was caused by reads timing out, not by a failure.
  _preferencesHydrationTimedOut: boolean;
  setHasHydrated: (state: boolean) => void;

  // Pro access hydration tracking (internal, not persisted)
  _proAccessHydrated: boolean;
  setProAccessHydrated: (state: boolean) => void;

  // NFC availability (cached, not persisted - checked on each app start)
  nfcAvailable: boolean;
  setNfcAvailable: (value: boolean) => void;

  // NFC availability hydration tracking (internal, not persisted)
  _nfcAvailabilityHydrated: boolean;
  setNfcAvailabilityHydrated: (state: boolean) => void;

  // Camera availability (cached, not persisted - checked on each app start)
  cameraAvailable: boolean;
  setCameraAvailable: (value: boolean) => void;

  // Camera availability hydration tracking (internal, not persisted)
  _cameraAvailabilityHydrated: boolean;
  setCameraAvailabilityHydrated: (state: boolean) => void;

  // Accelerometer availability (cached, not persisted - checked on each app start)
  accelerometerAvailable: boolean;
  setAccelerometerAvailable: (value: boolean) => void;

  // Accelerometer availability hydration tracking (internal, not persisted)
  _accelerometerAvailabilityHydrated: boolean;
  setAccelerometerAvailabilityHydrated: (state: boolean) => void;
}

// Preferences actions interface
export interface PreferencesActions {
  setRestartScan: (value: boolean) => void;
  setLaunchOnScan: (value: boolean) => void;
  setLifetimeProAccess: (value: boolean) => void;
  setStoreVerifiedProAccess: (value: boolean) => void;
  beginOnlinePremiumAccessCheck: () => void;
  setOnlinePremiumAccess: (value: boolean) => void;
  clearOnlinePremiumAccess: () => void;
  setPreferRemoteWriter: (value: boolean) => void;
  setShakeEnabled: (value: boolean) => void;
  setShakeMode: (value: "random" | "custom") => void;
  setShakeZapscript: (value: string) => void;
  setCustomText: (value: string) => void;
  setTourCompleted: (value: boolean) => void;
  recordAppReviewSuccessfulLaunch: (timestamp: number) => void;
  recordAppReviewAttempt: (timestamp: number) => void;
  initializeWhatsNew: (
    runtimeKey: string,
    announcementId: string | null,
  ) => void;
  setLastWhatsNewRuntimeKey: (runtimeKey: string) => void;
  markWhatsNewSeen: (announcementId: string, runtimeKey: string) => void;
  setLogLevelFilters: (filters: PreferencesState["logLevelFilters"]) => void;
  setShowFilenames: (value: boolean) => void;
  setSystemNameRegion: (value: SystemNameRegionPreference) => void;
  setAppBadgeEnabled: (value: boolean) => void;
  setHapticsEnabled: (value: boolean) => void;
  setTextZoomLevel: (value: number) => void;
  setAccessibleLists: (value: boolean) => void;
}

export type PreferencesStore = PreferencesState & PreferencesActions;

// Default preferences values
const DEFAULT_PREFERENCES: Omit<
  PreferencesState,
  | "_hasHydrated"
  | "_preferencesHydrationSucceeded"
  | "_preferencesHydrationTimedOut"
  | "setHasHydrated"
  | "_proAccessHydrated"
  | "setProAccessHydrated"
  | "nfcAvailable"
  | "setNfcAvailable"
  | "_nfcAvailabilityHydrated"
  | "setNfcAvailabilityHydrated"
  | "cameraAvailable"
  | "setCameraAvailable"
  | "_cameraAvailabilityHydrated"
  | "setCameraAvailabilityHydrated"
  | "accelerometerAvailable"
  | "setAccelerometerAvailable"
  | "_accelerometerAvailabilityHydrated"
  | "setAccelerometerAvailabilityHydrated"
> = {
  restartScan: false,
  launchOnScan: true, // Default on - Pro check happens at launch time
  launcherAccess: false,
  lifetimeProAccess: null,
  storeVerifiedProAccess: false,
  onlinePremiumAccess: null,
  preferRemoteWriter: false,
  shakeEnabled: false,
  shakeMode: "random",
  shakeZapscript: "",
  customText: "",
  tourCompleted: false,
  appReviewCadence: DEFAULT_APP_REVIEW_CADENCE,
  whatsNewInitialized: false,
  lastWhatsNewRuntimeKey: null,
  seenWhatsNewAnnouncementIds: [],
  logLevelFilters: {
    debug: true,
    info: true,
    warn: true,
    error: true,
  },
  showFilenames: false,
  systemNameRegion: "auto",
  appBadgeEnabled: true,
  hapticsEnabled: true,
  textZoomLevel: 1.0,
  accessibleLists: false,
};

function persistedPreferences(state: PreferencesStore) {
  return {
    restartScan: state.restartScan,
    launchOnScan: state.launchOnScan,
    launcherAccess: state.launcherAccess,
    storeVerifiedProAccess: state.storeVerifiedProAccess,
    preferRemoteWriter: state.preferRemoteWriter,
    shakeEnabled: state.shakeEnabled,
    shakeMode: state.shakeMode,
    shakeZapscript: state.shakeZapscript,
    customText: state.customText,
    tourCompleted: state.tourCompleted,
    appReviewCadence: state.appReviewCadence,
    whatsNewInitialized: state.whatsNewInitialized,
    lastWhatsNewRuntimeKey: state.lastWhatsNewRuntimeKey,
    seenWhatsNewAnnouncementIds: state.seenWhatsNewAnnouncementIds,
    logLevelFilters: state.logLevelFilters,
    showFilenames: state.showFilenames,
    systemNameRegion: state.systemNameRegion,
    appBadgeEnabled: state.appBadgeEnabled,
    hapticsEnabled: state.hapticsEnabled,
    textZoomLevel: state.textZoomLevel,
    accessibleLists: state.accessibleLists,
  };
}

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      // Initialize with defaults
      ...DEFAULT_PREFERENCES,

      // Hydration tracking
      _hasHydrated: false,
      _preferencesHydrationSucceeded: false,
      _preferencesHydrationTimedOut: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),

      // Pro access hydration tracking
      _proAccessHydrated: false,
      setProAccessHydrated: (state) => set({ _proAccessHydrated: state }),

      // NFC availability (not persisted, checked on app start)
      nfcAvailable: false,
      setNfcAvailable: (value) => set({ nfcAvailable: value }),

      // NFC availability hydration tracking
      _nfcAvailabilityHydrated: false,
      setNfcAvailabilityHydrated: (state) =>
        set({ _nfcAvailabilityHydrated: state }),

      // Camera availability (not persisted, checked on app start)
      cameraAvailable: false,
      setCameraAvailable: (value) => set({ cameraAvailable: value }),

      // Camera availability hydration tracking
      _cameraAvailabilityHydrated: false,
      setCameraAvailabilityHydrated: (state) =>
        set({ _cameraAvailabilityHydrated: state }),

      // Accelerometer availability (not persisted, checked on app start)
      accelerometerAvailable: false,
      setAccelerometerAvailable: (value) =>
        set({ accelerometerAvailable: value }),

      // Accelerometer availability hydration tracking
      _accelerometerAvailabilityHydrated: false,
      setAccelerometerAvailabilityHydrated: (state) =>
        set({ _accelerometerAvailabilityHydrated: state }),

      // Actions - automatically persisted by middleware
      setRestartScan: (value) => {
        set({ restartScan: value });
        sessionManager.setShouldRestart(value);
      },
      setLaunchOnScan: (value) => {
        set({ launchOnScan: value });
        sessionManager.setLaunchOnScan(value);
      },
      setLifetimeProAccess: (value) =>
        set((state) => {
          const effectiveLifetimeProAccess =
            value || state.storeVerifiedProAccess;
          return {
            lifetimeProAccess: effectiveLifetimeProAccess,
            launcherAccess:
              effectiveLifetimeProAccess ||
              state.onlinePremiumAccess === true ||
              (state.onlinePremiumAccess === null && state.launcherAccess),
          };
        }),
      setStoreVerifiedProAccess: (value) =>
        set((state) => ({
          storeVerifiedProAccess: value,
          lifetimeProAccess: value || state.lifetimeProAccess === true,
          launcherAccess:
            value ||
            state.lifetimeProAccess === true ||
            state.onlinePremiumAccess === true ||
            (state.onlinePremiumAccess === null && state.launcherAccess),
        })),
      beginOnlinePremiumAccessCheck: () =>
        set((state) => ({
          onlinePremiumAccess: null,
          launcherAccess:
            state.lifetimeProAccess === true ||
            (state.lifetimeProAccess === null && state.launcherAccess),
        })),
      setOnlinePremiumAccess: (value) =>
        set((state) => ({
          onlinePremiumAccess: value,
          launcherAccess:
            value ||
            state.lifetimeProAccess === true ||
            (state.lifetimeProAccess === null && state.launcherAccess),
        })),
      clearOnlinePremiumAccess: () =>
        set((state) => ({
          onlinePremiumAccess: false,
          launcherAccess:
            state.lifetimeProAccess === true ||
            (state.lifetimeProAccess === null && state.launcherAccess),
        })),
      setPreferRemoteWriter: (value) => set({ preferRemoteWriter: value }),
      setShakeEnabled: (value) => set({ shakeEnabled: value }),
      setShakeMode: (value) => {
        // Clear zapscript when mode changes
        set({ shakeMode: value, shakeZapscript: "" });
      },
      setShakeZapscript: (value) => set({ shakeZapscript: value }),
      setCustomText: (value) => set({ customText: value }),
      setTourCompleted: (value) => set({ tourCompleted: value }),
      recordAppReviewSuccessfulLaunch: (timestamp) =>
        set((state) => ({
          appReviewCadence: recordSuccessfulAppReviewLaunch(
            state.appReviewCadence,
            timestamp,
          ),
        })),
      recordAppReviewAttempt: (timestamp) =>
        set({ appReviewCadence: recordAppReviewAttempt(timestamp) }),
      initializeWhatsNew: (runtimeKey, announcementId) =>
        set({
          whatsNewInitialized: true,
          lastWhatsNewRuntimeKey: runtimeKey,
          seenWhatsNewAnnouncementIds: announcementId ? [announcementId] : [],
        }),
      setLastWhatsNewRuntimeKey: (runtimeKey) =>
        set({ whatsNewInitialized: true, lastWhatsNewRuntimeKey: runtimeKey }),
      markWhatsNewSeen: (announcementId, runtimeKey) =>
        set((state) => ({
          whatsNewInitialized: true,
          lastWhatsNewRuntimeKey: runtimeKey,
          seenWhatsNewAnnouncementIds:
            state.seenWhatsNewAnnouncementIds.includes(announcementId)
              ? state.seenWhatsNewAnnouncementIds
              : [...state.seenWhatsNewAnnouncementIds, announcementId],
        })),
      setLogLevelFilters: (filters) => set({ logLevelFilters: filters }),
      setShowFilenames: (value) => set({ showFilenames: value }),
      setSystemNameRegion: (value) => set({ systemNameRegion: value }),
      setAppBadgeEnabled: (value) => set({ appBadgeEnabled: value }),
      setHapticsEnabled: (value) => set({ hapticsEnabled: value }),
      setTextZoomLevel: (value) => set({ textZoomLevel: value }),
      setAccessibleLists: (value) => set({ accessibleLists: value }),
    }),
    {
      name: PREFERENCES_STORAGE_KEY,
      storage: createJSONStorage(() => capacitorPreferencesStorage),

      // Only persist preference data, not internal state
      partialize: persistedPreferences,

      // Callback when hydration completes
      onRehydrateStorage: () => {
        _preferenceHydrationStartedAt ??= Date.now();

        return (state, error) => {
          const elapsedMs = Date.now() - (_preferenceHydrationStartedAt ?? 0);

          if (error || !state) {
            const timedOut = error instanceof PreferenceReadTimeoutError;
            _storageWritesEnabled = false;

            if (_preferencesDegraded) {
              // Already running on defaults and reported; wait for the late
              // read or the next resume.
              logger.warn("Degraded preference hydration retry failed", error);
              if (timedOut) recoverWhenPendingPreferenceReadLands();
              return;
            }

            usePreferencesStore.setState({
              _preferencesHydrationSucceeded: false,
            });
            _preferenceHydrationAttempts += 1;

            if (
              _preferenceHydrationAttempts < PREFERENCE_HYDRATION_MAX_ATTEMPTS
            ) {
              logger.warn(
                `Preference hydration attempt ${_preferenceHydrationAttempts} failed; retrying`,
                error,
              );
              if (_preferenceHydrationRetryTimer) {
                clearTimeout(_preferenceHydrationRetryTimer);
              }
              _preferenceHydrationRetryTimer = setTimeout(() => {
                _preferenceHydrationRetryTimer = null;
                void usePreferencesStore.persist.rehydrate();
              }, PREFERENCE_HYDRATION_RETRY_DELAY_MS);
              return;
            }

            // Device info in the report's base context is absent when the
            // native bridge had not answered Device.getInfo either.
            logger.error(
              "Preference persistence disabled after hydration retries",
              error,
              {
                category: "storage",
                action: "disablePreferencePersistence",
                severity: "error",
                attempts: _preferenceHydrationAttempts,
                elapsedMs,
                timedOut,
              },
            );
            // Keep persistence disabled so unread saved data cannot be
            // replaced by defaults, but let the app start with in-memory
            // defaults. A timed-out read is merged if it lands later, and a
            // resume retries storage.
            _preferencesDegraded = true;
            _preferenceKeysChangedWhileDegraded.clear();
            usePreferencesStore.setState({
              _hasHydrated: true,
              _preferencesHydrationSucceeded: false,
              _preferencesHydrationTimedOut: timedOut,
            });
            if (timedOut) recoverWhenPendingPreferenceReadLands();
            return;
          }

          const recoveredAfterFallback = _preferencesDegraded;
          const keysKeptFromDegradedSession = _preferenceKeysKeptOnRecovery;
          _preferencesDegraded = false;
          _preferenceKeysChangedWhileDegraded.clear();
          _preferenceKeysKeptOnRecovery = 0;
          _preferenceHydrationAttempts = 0;
          _preferenceHydrationStartedAt = null;
          if (_preferenceHydrationRetryTimer) {
            clearTimeout(_preferenceHydrationRetryTimer);
            _preferenceHydrationRetryTimer = null;
          }
          _storageWritesEnabled = true;

          // Initialize sessionManager with hydrated values
          sessionManager.setShouldRestart(state.restartScan);
          sessionManager.setLaunchOnScan(state.launchOnScan);

          // Apply text zoom on native platforms
          if (
            isNativePluginAvailable("TextZoom") &&
            state.textZoomLevel !== 1.0
          ) {
            TextZoom.set({ value: state.textZoomLevel }).catch(() => {
              // Silently ignore - text zoom may not be available
            });
          }

          // Also writes the merged state, saving changes made while degraded.
          usePreferencesStore.setState({
            _hasHydrated: true,
            _preferencesHydrationSucceeded: true,
            _preferencesHydrationTimedOut: false,
          });

          if (recoveredAfterFallback) {
            logger.error("Recovered app preferences after hydration fallback", {
              category: "storage",
              action: "recoverPreferencePersistence",
              severity: "info",
              elapsedMs,
              keysKeptFromDegradedSession,
            });
          }
        };
      },

      // Custom merge to prevent race conditions where empty store overwrites saved data
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<PreferencesState>) || {};
        const merged: PreferencesStore = {
          ...currentState,
          ...persisted,
          appReviewCadence: {
            ...currentState.appReviewCadence,
            ...persisted.appReviewCadence,
          },
        };

        // Stored values win over defaults, except for settings changed while
        // the session ran on defaults: those are newer than the late read.
        _preferenceKeysKeptOnRecovery =
          _preferenceKeysChangedWhileDegraded.size;
        for (const key of _preferenceKeysChangedWhileDegraded) {
          Object.assign(merged, {
            [key]: currentState[key as keyof PreferencesStore],
          });
        }

        // Runtime access checks may already have answered (e.g. when storage
        // lands after a fallback). The cached launcher access only fills in
        // while a check is still pending, matching the access setters.
        const storeVerifiedProAccess = merged.storeVerifiedProAccess === true;
        const cachedLauncherAccess =
          persisted.launcherAccess ?? currentState.launcherAccess;
        const accessCheckPending =
          currentState.lifetimeProAccess === null ||
          currentState.onlinePremiumAccess === null;

        return {
          ...merged,
          // Never persist the hydration flags or runtime-checked values.
          // A store ownership fallback is durable because Google or Apple has
          // already confirmed the non-consumable is owned on this device.
          _hasHydrated: currentState._hasHydrated,
          _proAccessHydrated: currentState._proAccessHydrated,
          lifetimeProAccess: storeVerifiedProAccess
            ? true
            : currentState.lifetimeProAccess,
          launcherAccess:
            storeVerifiedProAccess ||
            currentState.lifetimeProAccess === true ||
            currentState.onlinePremiumAccess === true ||
            (accessCheckPending && cachedLauncherAccess),
          onlinePremiumAccess: currentState.onlinePremiumAccess,
          nfcAvailable: currentState.nfcAvailable,
          _nfcAvailabilityHydrated: currentState._nfcAvailabilityHydrated,
          cameraAvailable: currentState.cameraAvailable,
          _cameraAvailabilityHydrated: currentState._cameraAvailabilityHydrated,
          accelerometerAvailable: currentState.accelerometerAvailable,
          _accelerometerAvailabilityHydrated:
            currentState._accelerometerAvailabilityHydrated,
        };
      },
    },
  ),
);

// Launcher access is derived from runtime checks and merged separately.
usePreferencesStore.subscribe((state, previousState) => {
  if (!_preferencesDegraded) return;

  const next = persistedPreferences(state);
  const previous = persistedPreferences(previousState);
  for (const key of Object.keys(next) as (keyof typeof next)[]) {
    if (key !== "launcherAccess" && next[key] !== previous[key]) {
      _preferenceKeysChangedWhileDegraded.add(key);
    }
  }
});

// Selectors for common use cases
export const selectAppSettings = (state: PreferencesStore) => ({
  restartScan: state.restartScan,
  launchOnScan: state.launchOnScan,
  launcherAccess: state.launcherAccess,
  preferRemoteWriter: state.preferRemoteWriter,
  setRestartScan: state.setRestartScan,
  setLaunchOnScan: state.setLaunchOnScan,
  setPreferRemoteWriter: state.setPreferRemoteWriter,
});

export const selectShakeSettings = (state: PreferencesStore) => ({
  shakeEnabled: state.shakeEnabled,
  shakeMode: state.shakeMode,
  shakeZapscript: state.shakeZapscript,
  launcherAccess: state.launcherAccess,
  setShakeEnabled: state.setShakeEnabled,
  setShakeMode: state.setShakeMode,
  setShakeZapscript: state.setShakeZapscript,
});

export const selectCustomText = (state: PreferencesStore) => ({
  customText: state.customText,
  setCustomText: state.setCustomText,
});
