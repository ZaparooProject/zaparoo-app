import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { LiveUpdate } from "@capawesome/capacitor-live-update";
import { logger } from "@/lib/logger";

/**
 * Hook to handle Capawesome Live Update lifecycle.
 *
 * - Calls `ready()` to signal the app loaded successfully (prevents rollback)
 * - Syncs with the update server in the background
 *
 * Must be called after the app has successfully rendered to prevent
 * automatic rollback of bad updates.
 */
export function useLiveUpdate() {
  const initialized = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || initialized.current) {
      return;
    }

    initialized.current = true;

    const initLiveUpdate = async () => {
      try {
        // Signal that the app loaded successfully - prevents automatic rollback
        await LiveUpdate.ready();
        logger.debug("LiveUpdate: App marked as ready");

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
  }, []);
}
