import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import { Preferences } from "@capacitor/preferences";
import { sessionManager } from "./nfc";

/**
 * Preferences Store
 *
 * Centralized store for all app preferences using Zustand with persist middleware.
 * This replaces scattered Preferences.get/set calls throughout the app. This
 * is mainly to prevent layout shifts when reading preferences/purchases on
 * page loads.
 */

// Custom storage adapter for Capacitor Preferences
const capacitorPreferencesStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const result = await Preferences.get({ key: name });
    return result.value;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await Preferences.set({ key: name, value });
  },
  removeItem: async (name: string): Promise<void> => {
    await Preferences.remove({ key: name });
  }
};

// Preferences state interface
export interface PreferencesState {
  // App settings
  restartScan: boolean;
  launchOnScan: boolean;
  launcherAccess: boolean;
  preferRemoteWriter: boolean;

  // Shake to launch settings
  shakeEnabled: boolean;
  shakeMode: "random" | "custom";
  shakeZapscript: string;

  // Custom zapscript page text (separate from shake zapscript)
  customText: string;

  // Hydration tracking (internal, not persisted)
  _hasHydrated: boolean;
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
  setLauncherAccess: (value: boolean) => void;
  setPreferRemoteWriter: (value: boolean) => void;
  setShakeEnabled: (value: boolean) => void;
  setShakeMode: (value: "random" | "custom") => void;
  setShakeZapscript: (value: string) => void;
  setCustomText: (value: string) => void;
}

export type PreferencesStore = PreferencesState & PreferencesActions;

// Default preferences values
const DEFAULT_PREFERENCES: Omit<
  PreferencesState,
  | "_hasHydrated"
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
  launchOnScan: true, // Default to true (matches current behavior)
  launcherAccess: false,
  preferRemoteWriter: false,
  shakeEnabled: false,
  shakeMode: "random",
  shakeZapscript: "",
  customText: ""
};

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      // Initialize with defaults
      ...DEFAULT_PREFERENCES,

      // Hydration tracking
      _hasHydrated: false,
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
      setAccelerometerAvailable: (value) => set({ accelerometerAvailable: value }),

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
      setLauncherAccess: (value) => set({ launcherAccess: value }),
      setPreferRemoteWriter: (value) => set({ preferRemoteWriter: value }),
      setShakeEnabled: (value) => set({ shakeEnabled: value }),
      setShakeMode: (value) => {
        // Clear zapscript when mode changes
        set({ shakeMode: value, shakeZapscript: "" });
      },
      setShakeZapscript: (value) => set({ shakeZapscript: value }),
      setCustomText: (value) => set({ customText: value })
    }),
    {
      name: "app-preferences",
      storage: createJSONStorage(() => capacitorPreferencesStorage),

      // Only persist preference data, not internal state
      partialize: (state) => ({
        restartScan: state.restartScan,
        launchOnScan: state.launchOnScan,
        launcherAccess: state.launcherAccess,
        preferRemoteWriter: state.preferRemoteWriter,
        shakeEnabled: state.shakeEnabled,
        shakeMode: state.shakeMode,
        shakeZapscript: state.shakeZapscript,
        customText: state.customText
      }),

      // Callback when hydration completes
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Initialize sessionManager with hydrated values
          sessionManager.setShouldRestart(state.restartScan);
          sessionManager.setLaunchOnScan(state.launchOnScan);

          state.setHasHydrated(true);
        }
      },

      // Custom merge to prevent race conditions where empty store overwrites saved data
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<PreferencesState>) || {};
        return {
          ...currentState,
          ...persisted,
          // Never persist the hydration flags or runtime-checked values
          _hasHydrated: currentState._hasHydrated,
          _proAccessHydrated: currentState._proAccessHydrated,
          nfcAvailable: currentState.nfcAvailable,
          _nfcAvailabilityHydrated: currentState._nfcAvailabilityHydrated,
          cameraAvailable: currentState.cameraAvailable,
          _cameraAvailabilityHydrated: currentState._cameraAvailabilityHydrated,
          accelerometerAvailable: currentState.accelerometerAvailable,
          _accelerometerAvailabilityHydrated: currentState._accelerometerAvailabilityHydrated
        };
      }
    }
  )
);

// Selectors for common use cases
export const selectAppSettings = (state: PreferencesStore) => ({
  restartScan: state.restartScan,
  launchOnScan: state.launchOnScan,
  launcherAccess: state.launcherAccess,
  preferRemoteWriter: state.preferRemoteWriter,
  setRestartScan: state.setRestartScan,
  setLaunchOnScan: state.setLaunchOnScan,
  setPreferRemoteWriter: state.setPreferRemoteWriter
});

export const selectShakeSettings = (state: PreferencesStore) => ({
  shakeEnabled: state.shakeEnabled,
  shakeMode: state.shakeMode,
  shakeZapscript: state.shakeZapscript,
  launcherAccess: state.launcherAccess,
  setShakeEnabled: state.setShakeEnabled,
  setShakeMode: state.setShakeMode,
  setShakeZapscript: state.setShakeZapscript
});

export const selectCustomText = (state: PreferencesStore) => ({
  customText: state.customText,
  setCustomText: state.setCustomText
});
