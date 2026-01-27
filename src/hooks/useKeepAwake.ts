import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { logger } from "@/lib/logger";

/**
 * Hook to keep the screen awake while the component is mounted.
 * Only works on native platforms (iOS/Android), silently skipped on web.
 * Errors are logged but don't affect the UI.
 */
export function useKeepAwake() {
  useEffect(() => {
    // KeepAwake is not supported on web builds
    if (!Capacitor.isNativePlatform()) return;

    let unmounted = false;

    import("@capacitor-community/keep-awake").then(({ KeepAwake }) => {
      // If already unmounted, don't activate keepAwake
      if (unmounted) return;

      KeepAwake.keepAwake().catch((error) => {
        logger.error("Failed to enable keep awake", error, {
          category: "lifecycle",
          action: "keepAwake",
          severity: "warning",
        });
      });
    });

    return () => {
      unmounted = true;
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
  }, []);
}
