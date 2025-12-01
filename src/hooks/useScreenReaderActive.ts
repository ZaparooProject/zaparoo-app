import { useEffect, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { ScreenReader, ScreenReaderState } from "@capacitor/screen-reader";
import { logger } from "../lib/logger";

interface ScreenReaderActiveState {
  /** Whether a screen reader (VoiceOver/TalkBack) is currently active */
  isActive: boolean;
  /** Whether the state has been checked */
  isLoading: boolean;
}

/**
 * Hook to detect if a screen reader is active on the device.
 *
 * Useful for conditionally adapting UI behavior when screen readers are in use,
 * such as providing additional context or simplifying interactions.
 *
 * @example
 * const { isActive } = useScreenReaderActive();
 *
 * if (isActive) {
 *   // Provide enhanced accessibility features
 *   // Skip animations
 *   // Add extra context to announcements
 * }
 */
export function useScreenReaderActive() {
  // Initialize with correct state based on platform - only loading if native
  const [state, setState] = useState<ScreenReaderActiveState>(() => ({
    isActive: false,
    isLoading: Capacitor.isNativePlatform(),
  }));

  // Check initial state and listen for changes (native platforms only)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    // Check initial state
    ScreenReader.isEnabled()
      .then((result) => {
        setState({
          isActive: result.value,
          isLoading: false,
        });
      })
      .catch((error) => {
        logger.debug("Failed to check screen reader status:", error, {
          category: "accessibility",
          action: "checkScreenReader",
          severity: "info",
        });
        setState({ isActive: false, isLoading: false });
      });

    // Listen for changes
    const listener = ScreenReader.addListener(
      "stateChange",
      (status: ScreenReaderState) => {
        setState((prev) => ({
          ...prev,
          isActive: status.value,
        }));
      },
    );

    return () => {
      listener.then((l) => l.remove());
    };
  }, []);

  /**
   * Manually check if screen reader is enabled
   */
  const checkIsEnabled = useCallback(async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }

    try {
      const result = await ScreenReader.isEnabled();
      setState((prev) => ({ ...prev, isActive: result.value }));
      return result.value;
    } catch (error) {
      logger.debug("Failed to check screen reader status:", error, {
        category: "accessibility",
        action: "checkScreenReaderManual",
        severity: "info",
      });
      return false;
    }
  }, []);

  return {
    ...state,
    checkIsEnabled,
  };
}
