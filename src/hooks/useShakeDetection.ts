import { useEffect, useRef } from "react";
import type { PluginListenerHandle } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { CapacitorShake } from "@capgo/capacitor-shake";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useStatusStore } from "@/lib/store";
import { logger } from "@/lib/logger";

interface UseShakeDetectionProps {
  shakeEnabled: boolean;
  connected: boolean;
  pathname: string;
}

// Require 2 shakes within this window to trigger
const SHAKE_WINDOW_MS = 1500;
// Cooldown after a successful trigger before accepting new shakes
const TRIGGER_COOLDOWN_MS = 2000;
// Required number of shakes to trigger
const REQUIRED_SHAKES = 2;

export function useShakeDetection({
  shakeEnabled,
  connected,
  pathname,
}: UseShakeDetectionProps) {
  const setRunQueue = useStatusStore((state) => state.setRunQueue);
  // Track timestamps of recent shakes for multi-shake detection
  const shakeTimestampsRef = useRef<number[]>([]);
  // Track when last trigger occurred for cooldown
  const lastTriggerTimeRef = useRef(0);

  useEffect(() => {
    // Only enable shake detection on native platforms
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    // Require connection and enabled setting
    // Pro access is checked when the shake triggers runToken via the queue processor
    if (!shakeEnabled || !connected) {
      return;
    }

    let listener: PluginListenerHandle | null = null;
    let isMounted = true;

    const setupListener = async () => {
      try {
        const newListener = await CapacitorShake.addListener(
          "shake",
          async () => {
            const now = Date.now();

            // Only trigger on home page
            if (pathname !== "/") {
              logger.log("Shake detected but not on home page, ignoring");
              return;
            }

            // Check cooldown after last successful trigger
            if (now - lastTriggerTimeRef.current < TRIGGER_COOLDOWN_MS) {
              logger.log("Shake detected but in cooldown period, ignoring");
              return;
            }

            // Add this shake timestamp and filter out old ones outside the window
            shakeTimestampsRef.current = [
              ...shakeTimestampsRef.current.filter(
                (t) => now - t < SHAKE_WINDOW_MS,
              ),
              now,
            ];

            const shakeCount = shakeTimestampsRef.current.length;
            logger.log(
              `Shake ${shakeCount}/${REQUIRED_SHAKES} detected within window`,
            );

            // Light haptic feedback to acknowledge shake was detected
            const hapticsEnabled =
              usePreferencesStore.getState().hapticsEnabled;
            if (hapticsEnabled && shakeCount < REQUIRED_SHAKES) {
              Haptics.impact({ style: ImpactStyle.Light }).catch(() => {
                // Ignore haptics errors
              });
            }

            // Check if we have enough shakes to trigger
            if (shakeCount < REQUIRED_SHAKES) {
              return;
            }

            // Clear shake timestamps and set cooldown
            shakeTimestampsRef.current = [];
            lastTriggerTimeRef.current = now;

            const zapscript = usePreferencesStore.getState().shakeZapscript;

            if (!zapscript) {
              logger.log("Shake triggered, but no zapscript configured");
              return;
            }

            logger.log("Shake triggered, queueing zapscript:", zapscript);

            // Heavy haptic feedback to confirm shake trigger was recognized
            if (hapticsEnabled) {
              Haptics.impact({ style: ImpactStyle.Heavy }).catch((error) => {
                logger.debug("Haptics impact failed:", error, {
                  category: "haptics",
                  action: "shakeImpact",
                  severity: "info",
                });
              });
            }

            setRunQueue({ value: zapscript, unsafe: true });
          },
        );

        // Only assign listener if still mounted
        if (isMounted) {
          listener = newListener;
        } else {
          // Component unmounted during async setup, clean up immediately
          newListener.remove();
        }
      } catch (error) {
        logger.error("Failed to setup shake listener:", error, {
          category: "accelerometer",
          action: "setupShakeListener",
          severity: "warning",
        });
      }
    };

    setupListener();

    return () => {
      isMounted = false;
      if (listener) {
        listener.remove();
      }
    };
  }, [shakeEnabled, connected, pathname, setRunQueue]);
}
