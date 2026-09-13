import { useEffect } from "react";
import { App } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { isNativePluginAvailable } from "@/lib/capacitorBridge";
import { logger } from "@/lib/logger";
import {
  retryDegradedPreferenceHydration,
  usePreferencesStore,
} from "@/lib/preferencesStore";

/**
 * Retries preference storage each time the app resumes while the session is
 * running on in-memory defaults after a failed startup read.
 */
export function usePreferenceHydrationRecovery(): void {
  const degraded = usePreferencesStore(
    (state) => state._hasHydrated && !state._preferencesHydrationSucceeded,
  );

  useEffect(() => {
    if (!degraded || !isNativePluginAvailable("App")) return;

    let disposed = false;
    let resumeListener: PluginListenerHandle | null = null;

    const setupListener = async () => {
      const handle = await App.addListener("resume", () => {
        if (!disposed) retryDegradedPreferenceHydration();
      });
      if (disposed) {
        void handle.remove();
        return;
      }
      resumeListener = handle;
    };

    setupListener().catch((error: unknown) => {
      logger.warn("Failed to listen for resume to retry preferences:", error);
    });

    return () => {
      disposed = true;
      void resumeListener?.remove();
    };
  }, [degraded]);
}
