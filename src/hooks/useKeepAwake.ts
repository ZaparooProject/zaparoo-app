import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { logger } from "@/lib/logger";

/**
 * Keep the screen awake while `enabled` is true and the component is mounted.
 * The screen is allowed to sleep again as soon as `enabled` turns false.
 * Only works on native platforms (iOS/Android), silently skipped on web.
 * Errors are logged but don't affect the UI.
 */
export function useKeepAwake(enabled: boolean) {
  useEffect(() => {
    // KeepAwake is not supported on web builds
    if (!enabled || !Capacitor.isNativePlatform()) return;

    let released = false;

    import("@capacitor-community/keep-awake").then(({ KeepAwake }) => {
      // Released before the plugin loaded, so don't hold the screen on
      if (released) return;

      KeepAwake.keepAwake().catch((error) => {
        logger.error("Failed to enable keep awake", error, {
          category: "lifecycle",
          action: "keepAwake",
          severity: "warning",
        });
      });
    });

    return () => {
      released = true;
      // Call allowSleep directly - the import will be cached
      import("@capacitor-community/keep-awake").then(({ KeepAwake }) => {
        KeepAwake.allowSleep().catch((error) => {
          logger.error("Failed to disable keep awake", error, {
            category: "lifecycle",
            action: "allowSleep",
            severity: "warning",
          });
        });
      });
    };
  }, [enabled]);
}
