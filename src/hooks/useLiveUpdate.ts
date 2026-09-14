import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { LiveUpdate } from "@capawesome/capacitor-live-update";
import { logger } from "@/lib/logger";
import { isNativePluginAvailable } from "@/lib/capacitorBridge";

/**
 * Hook to handle Capawesome Live Update lifecycle.
 *
 * - Calls `ready()` to signal the app loaded successfully (prevents rollback)
 * - Syncs with the update server in the background, unless the build sets
 *   `VITE_DISABLE_LIVE_UPDATE_SYNC=true`
 *
 * Must be called after the app has successfully rendered to prevent
 * automatic rollback of bad updates.
 */
export function useLiveUpdate(appReady: boolean) {
  const initialized = useRef(false);

  useEffect(() => {
    if (
      !appReady ||
      !Capacitor.isNativePlatform() ||
      !isNativePluginAvailable("LiveUpdate") ||
      initialized.current
    ) {
      return;
    }

    initialized.current = true;

    const initLiveUpdate = async () => {
      try {
        // Signal that the app loaded successfully - prevents automatic rollback
        await LiveUpdate.ready();
        logger.debug("LiveUpdate: App marked as ready");

        // Local device test builds share the store build number, and with it
        // the versioned production channel. Syncing would download that
        // bundle and replace the local web code on the next cold start.
        if (import.meta.env.VITE_DISABLE_LIVE_UPDATE_SYNC === "true") {
          logger.debug("LiveUpdate: Sync disabled for this build");
          return;
        }

        // Sync with update server (downloads happen in background per config)
        const result = await LiveUpdate.sync();
        if (result.nextBundleId) {
          logger.log(
            `LiveUpdate: New bundle available (${result.nextBundleId}), will apply on next restart`,
          );
        }
      } catch (error) {
        // Non-fatal - live updates are optional
        logger.warn("LiveUpdate: Failed to initialize", error);
      }
    };

    initLiveUpdate();
  }, [appReady]);
}
