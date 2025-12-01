import { useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { ScreenReader } from "@capacitor/screen-reader";
import { logger } from "../lib/logger";

/**
 * Hook providing screen reader announcement functionality.
 *
 * Uses Capacitor's ScreenReader plugin on native platforms to speak text
 * to users with screen readers enabled. Falls back gracefully on web.
 *
 * @example
 * const { announce } = useAnnounce();
 *
 * // Announce a success message
 * announce("Tag scanned successfully");
 *
 * // Announce an error
 * announce("Scan failed. Please try again.");
 */
export function useAnnounce() {
  /**
   * Announce a message to screen reader users
   * @param message - The text to speak
   */
  const announce = useCallback(async (message: string) => {
    if (!Capacitor.isNativePlatform()) {
      // On web, we rely on aria-live regions (see A11yAnnouncer component)
      // This function is primarily for imperative announcements on native
      return;
    }

    try {
      await ScreenReader.speak({ value: message });
    } catch (error) {
      logger.debug("Screen reader announcement failed:", error, {
        category: "accessibility",
        action: "announce",
        severity: "info",
      });
    }
  }, []);

  return { announce };
}
