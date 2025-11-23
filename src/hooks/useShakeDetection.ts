import { useEffect, useRef } from "react";
import type { PluginListenerHandle } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";
import { CapacitorShake } from "@capgo/capacitor-shake";
import { usePreferencesStore } from "../lib/preferencesStore";
import { useStatusStore } from "../lib/store";

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

    const setupListener = async () => {
      try {
        listener = await CapacitorShake.addListener("shake", async () => {
          const now = Date.now();

          // Debounce: ignore shakes that happen too quickly
          if (now - lastShakeTimeRef.current < DEBOUNCE_MS) {
            console.log(
              "Shake detected but debounced (too soon after last shake)"
            );
            return;
          }

          lastShakeTimeRef.current = now;

          const zapscript = usePreferencesStore.getState().shakeZapscript;

          if (!zapscript) {
            console.log("Shake detected, but no zapscript configured");
            return;
          }

          console.log("Shake detected, queueing zapscript:", zapscript);
          setRunQueue({ value: zapscript, unsafe: true });
        });
      } catch (error) {
        console.error("Failed to setup shake listener:", error);
      }
    };

    setupListener();

    return () => {
      if (listener) {
        listener.remove();
      }
    };
  }, [shakeEnabled, launcherAccess, connected, setRunQueue]);
}
