import { useEffect, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { TextZoom } from "@capacitor/text-zoom";
import { logger } from "@/lib/logger";

interface TextZoomState {
  /** Current zoom level (1.0 = 100%, 1.5 = 150%, etc.) */
  zoomLevel: number;
  /** Whether text zoom is available on this platform */
  isAvailable: boolean;
  /** Whether the state has been loaded */
  isLoading: boolean;
}

/**
 * Hook for managing system text zoom preferences.
 *
 * Provides access to the device's text zoom setting and methods to adjust it.
 * Useful for respecting user accessibility preferences for larger text.
 *
 * @example
 * const { zoomLevel, getPreferred, set } = useTextZoom();
 *
 * // Get system preferred zoom
 * const preferred = await getPreferred();
 *
 * // Set zoom to 150%
 * await set(1.5);
 */
export function useTextZoom() {
  // Initialize with correct state based on platform - only loading if native
  const [state, setState] = useState<TextZoomState>(() => ({
    zoomLevel: 1.0,
    isAvailable: Capacitor.isNativePlatform(),
    isLoading: Capacitor.isNativePlatform(),
  }));

  // Load current zoom level on mount (native platforms only)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    TextZoom.get()
      .then((result) => {
        setState({
          zoomLevel: result.value,
          isAvailable: true,
          isLoading: false,
        });
      })
      .catch((error) => {
        logger.debug("Failed to get text zoom:", error, {
          category: "accessibility",
          action: "getTextZoom",
          severity: "info",
        });
        setState((prev) => ({ ...prev, isLoading: false }));
      });
  }, []);

  /**
   * Get the system's preferred text zoom level
   */
  const getPreferred = useCallback(async (): Promise<number> => {
    if (!Capacitor.isNativePlatform()) {
      return 1.0;
    }

    try {
      const result = await TextZoom.getPreferred();
      return result.value;
    } catch (error) {
      logger.debug("Failed to get preferred text zoom:", error, {
        category: "accessibility",
        action: "getPreferredTextZoom",
        severity: "info",
      });
      return 1.0;
    }
  }, []);

  /**
   * Set the text zoom level
   * @param level - Zoom level (1.0 = 100%, 1.5 = 150%, etc.)
   */
  const set = useCallback(async (level: number): Promise<void> => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      await TextZoom.set({ value: level });
      setState((prev) => ({ ...prev, zoomLevel: level }));
    } catch (error) {
      logger.debug("Failed to set text zoom:", error, {
        category: "accessibility",
        action: "setTextZoom",
        severity: "warning",
      });
    }
  }, []);

  return {
    ...state,
    getPreferred,
    set,
  };
}
