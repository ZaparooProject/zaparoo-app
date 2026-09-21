import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";
import { Preferences } from "@capacitor/preferences";
import { logger } from "./logger";

/**
 * Simulated outcome for NFC operations while app preview is enabled. "hold"
 * stays on the scan screen so the waiting state can be inspected.
 */
export type AppPreviewNfcResult =
  | "hold"
  | "success"
  | "verifyFailed"
  | "retap"
  | "error";

interface AppPreviewStore {
  enabled: boolean;
  nfcResult: AppPreviewNfcResult;
  setEnabled: (enabled: boolean) => void;
  setNfcResult: (nfcResult: AppPreviewNfcResult) => void;
}

/**
 * Minimal Capacitor Preferences adapter. Dev-only state, so a failed read or
 * write just means the toggle starts off rather than anything user-visible.
 */
const previewStorage: StateStorage = {
  getItem: async (name) => {
    try {
      const result = await Preferences.get({ key: name });
      return result.value;
    } catch (error) {
      logger.debug("App preview state read failed:", error);
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await Preferences.set({ key: name, value });
    } catch (error) {
      logger.debug("App preview state write failed:", error);
    }
  },
  removeItem: async (name) => {
    try {
      await Preferences.remove({ key: name });
    } catch (error) {
      logger.debug("App preview state clear failed:", error);
    }
  },
};

export const useAppPreviewStore = create<AppPreviewStore>()(
  persist(
    (set) => ({
      enabled: false,
      nfcResult: "hold",
      setEnabled: (enabled) => set({ enabled }),
      setNfcResult: (nfcResult) => set({ nfcResult }),
    }),
    {
      name: "app-preview",
      storage: createJSONStorage(() => previewStorage),
      // Survives the reloads that dev work causes constantly; without this the
      // toggle switches itself off on every hot reload.
      partialize: (state) => ({
        enabled: state.enabled,
        nfcResult: state.nfcResult,
      }),
    },
  ),
);

/** App preview exists in dev builds and explicitly opted-in web builds only. */
export function isAppPreviewAvailable(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_APP_PREVIEW === "true";
}

/**
 * Whether app-only UI should render on a platform that cannot run it. Preview
 * never makes native plugins work, so plugin calls stay guarded by Capacitor.
 */
export function isAppPreviewEnabled(): boolean {
  return isAppPreviewAvailable() && useAppPreviewStore.getState().enabled;
}

export function getAppPreviewNfcResult(): AppPreviewNfcResult {
  return useAppPreviewStore.getState().nfcResult;
}

export function resetAppPreviewState(): void {
  useAppPreviewStore.setState({ enabled: false, nfcResult: "hold" });
}
