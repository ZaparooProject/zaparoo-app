import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { KeepAwake } from "@capacitor-community/keep-awake";
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

    KeepAwake.keepAwake().catch((error) => {
      logger.error("Failed to enable keep awake", error, {
        category: "lifecycle",
        action: "keepAwake",
        severity: "warning",
      });
    });

    return () => {
      KeepAwake.allowSleep().catch((error) => {
        logger.error("Failed to disable keep awake", error, {
          category: "lifecycle",
          action: "allowSleep",
          severity: "warning",
        });
      });
    };
  }, []);
}
