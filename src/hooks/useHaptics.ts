import { useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { usePreferencesStore } from "../lib/preferencesStore";
import { logger } from "../lib/logger";

/**
 * Hook providing haptic feedback functionality.
 *
 * Respects user's haptics preference setting and gracefully handles
 * platforms without haptic support.
 *
 * @example
 * const { impact, notification, vibrate } = useHaptics();
 *
 * // Light tap for button press
 * <button onClick={() => { impact('light'); doAction(); }}>Tap</button>
 *
 * // Success notification
 * notification('success');
 *
 * // Error feedback
 * notification('error');
 */
export function useHaptics() {
  const hapticsEnabled = usePreferencesStore((state) => state.hapticsEnabled);

  /**
   * Trigger impact haptic feedback
   * @param style - 'light' | 'medium' | 'heavy' (default: 'light')
   */
  const impact = useCallback(
    async (style: "light" | "medium" | "heavy" = "light") => {
      if (!hapticsEnabled || !Capacitor.isNativePlatform()) {
        return;
      }

      try {
        const impactStyle: ImpactStyle =
          style === "light"
            ? ImpactStyle.Light
            : style === "medium"
              ? ImpactStyle.Medium
              : ImpactStyle.Heavy;

        await Haptics.impact({ style: impactStyle });
      } catch (error) {
        logger.debug("Haptics impact failed:", error, {
          category: "haptics",
          action: "impact",
          severity: "info",
        });
      }
    },
    [hapticsEnabled],
  );

  /**
   * Trigger notification haptic feedback
   * @param type - 'success' | 'warning' | 'error' (default: 'success')
   */
  const notification = useCallback(
    async (type: "success" | "warning" | "error" = "success") => {
      if (!hapticsEnabled || !Capacitor.isNativePlatform()) {
        return;
      }

      try {
        const notificationType: NotificationType =
          type === "success"
            ? NotificationType.Success
            : type === "warning"
              ? NotificationType.Warning
              : NotificationType.Error;

        await Haptics.notification({ type: notificationType });
      } catch (error) {
        logger.debug("Haptics notification failed:", error, {
          category: "haptics",
          action: "notification",
          severity: "info",
        });
      }
    },
    [hapticsEnabled],
  );

  /**
   * Trigger a simple vibration
   * @param duration - Duration in milliseconds (default: 300)
   */
  const vibrate = useCallback(
    async (duration: number = 300) => {
      if (!hapticsEnabled || !Capacitor.isNativePlatform()) {
        return;
      }

      try {
        await Haptics.vibrate({ duration });
      } catch (error) {
        logger.debug("Haptics vibrate failed:", error, {
          category: "haptics",
          action: "vibrate",
          severity: "info",
        });
      }
    },
    [hapticsEnabled],
  );

  /**
   * Trigger selection changed feedback (iOS only - subtle tick)
   */
  const selectionChanged = useCallback(async () => {
    if (!hapticsEnabled || !Capacitor.isNativePlatform()) {
      return;
    }

    try {
      await Haptics.selectionChanged();
    } catch (error) {
      logger.debug("Haptics selectionChanged failed:", error, {
        category: "haptics",
        action: "selectionChanged",
        severity: "info",
      });
    }
  }, [hapticsEnabled]);

  /**
   * Start selection feedback loop (call selectionEnd when done)
   */
  const selectionStart = useCallback(async () => {
    if (!hapticsEnabled || !Capacitor.isNativePlatform()) {
      return;
    }

    try {
      await Haptics.selectionStart();
    } catch (error) {
      logger.debug("Haptics selectionStart failed:", error, {
        category: "haptics",
        action: "selectionStart",
        severity: "info",
      });
    }
  }, [hapticsEnabled]);

  /**
   * End selection feedback loop
   */
  const selectionEnd = useCallback(async () => {
    if (!hapticsEnabled || !Capacitor.isNativePlatform()) {
      return;
    }

    try {
      await Haptics.selectionEnd();
    } catch (error) {
      logger.debug("Haptics selectionEnd failed:", error, {
        category: "haptics",
        action: "selectionEnd",
        severity: "info",
      });
    }
  }, [hapticsEnabled]);

  return {
    impact,
    notification,
    vibrate,
    selectionChanged,
    selectionStart,
    selectionEnd,
    isEnabled: hapticsEnabled,
  };
}
