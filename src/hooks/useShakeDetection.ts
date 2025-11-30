import { useEffect, useRef } from "react";
import type { PluginListenerHandle } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";
import { CapacitorShake } from "@capgo/capacitor-shake";
import { usePreferencesStore } from "../lib/preferencesStore";
import { useStatusStore } from "../lib/store";
import { logger } from "../lib/logger";

interface UseShakeDetectionProps {
  shakeEnabled: boolean;
  launcherAccess: boolean;
  connected: boolean;
}

export function useShakeDetection({
  shakeEnabled,
  launcherAccess,
  connected
}: UseShakeDetectionProps) {
  const setRunQueue = useStatusStore((state) => state.setRunQueue);
  const lastShakeTimeRef = useRef(0);
  const DEBOUNCE_MS = 1000; // Prevent multiple shakes within 1 second

  useEffect(() => {
    // Only enable shake detection on native platforms
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    // Require Pro access, connection, and enabled setting
    if (!shakeEnabled || !launcherAccess || !connected) {
      return;
    }

    let listener: PluginListenerHandle | null = null;
    let isMounted = true;

    const setupListener = async () => {
      try {
        const newListener = await CapacitorShake.addListener("shake", async () => {
          const now = Date.now();

          // Debounce: ignore shakes that happen too quickly
          if (now - lastShakeTimeRef.current < DEBOUNCE_MS) {
            logger.log(
              "Shake detected but debounced (too soon after last shake)"
            );
            return;
          }

          lastShakeTimeRef.current = now;

          const zapscript = usePreferencesStore.getState().shakeZapscript;

          if (!zapscript) {
            logger.log("Shake detected, but no zapscript configured");
            return;
          }

          logger.log("Shake detected, queueing zapscript:", zapscript);
          setRunQueue({ value: zapscript, unsafe: true });
        });

        // Only assign listener if still mounted
        if (isMounted) {
          listener = newListener;
        } else {
          // Component unmounted during async setup, clean up immediately
          newListener.remove();
        }
      } catch (error) {
        logger.error("Failed to setup shake listener:", error, { category: "accelerometer", action: "setupShakeListener", severity: "warning" });
      }
    };

    setupListener();

    return () => {
      isMounted = false;
      if (listener) {
        listener.remove();
      }
    };
  }, [shakeEnabled, launcherAccess, connected, setRunQueue]);
}
