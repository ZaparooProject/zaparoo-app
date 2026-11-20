import { useContext, useEffect, useRef } from "react";
import type { PluginListenerHandle } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";
import { ShakeDetector } from "@/lib/shakeDetector";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useStatusStore } from "@/lib/store";
import { sessionManager } from "@/lib/nfc";
import { logger } from "@/lib/logger";
import { useHaptics } from "@/hooks/useHaptics";
import { SlideModalContext } from "@/hooks/useSlideModalManager";
import {
  isRandomLaunchScript,
  useShakeSheetStore,
} from "@/lib/shakeSheetStore";

interface UseShakeDetectionProps {
  shakeEnabled: boolean;
  connected: boolean;
}

// Require 2 shakes within this window to trigger
export const SHAKE_WINDOW_MS = 1500;
// Cooldown after a successful trigger before accepting new shakes
const TRIGGER_COOLDOWN_MS = 2000;
// Required number of shakes to trigger
export const REQUIRED_SHAKES = 2;

// The shake sheet is not a modal, so no registered modal is ever this id.
const SHAKE_SHEET_ID = "shake-sheet";

function isTextFieldFocused(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  return (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active.isContentEditable
  );
}

export function useShakeDetection({
  shakeEnabled,
  connected,
}: UseShakeDetectionProps) {
  const setRunQueue = useStatusStore((state) => state.setRunQueue);
  const { impact } = useHaptics();
  const modalManager = useContext(SlideModalContext);
  // Track timestamps of recent shakes for multi-shake detection
  const shakeTimestampsRef = useRef<number[]>([]);
  // Track when last trigger occurred for cooldown
  const lastTriggerTimeRef = useRef(0);
  // Empties the charge when the window passes without another shake
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read at shake time so changes do not restart the native detector
  const impactRef = useRef(impact);
  const modalManagerRef = useRef(modalManager);

  useEffect(() => {
    impactRef.current = impact;
    modalManagerRef.current = modalManager;
  }, [impact, modalManager]);

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

    const clearDrainTimer = () => {
      if (drainTimerRef.current) {
        clearTimeout(drainTimerRef.current);
        drainTimerRef.current = null;
      }
    };

    const blockedReason = (): string | null => {
      if (isTextFieldFocused()) return "a text field is focused";
      if (modalManagerRef.current?.hasOpenModalExcept?.(SHAKE_SHEET_ID)) {
        return "a modal is open";
      }
      const status = useStatusStore.getState();
      if (status.proPurchaseModalOpen) return "the Pro purchase is open";
      if (status.writeOpen) return "a tag write is in progress";
      if (sessionManager.isScanning) return "an NFC scan is in progress";
      // One shake launch owns the sheet until Core answers; a second one
      // queued behind it would report into a sheet showing the first.
      if (useShakeSheetStore.getState().phase === "launching") {
        return "a shake launch is in progress";
      }
      return null;
    };

    const setupListener = async () => {
      try {
        const newListener = await ShakeDetector.addListener(
          "shake",
          async () => {
            const now = Date.now();

            const reason = blockedReason();
            if (reason) {
              logger.log(`Shake detected but ${reason}, ignoring`);
              return;
            }

            // Check cooldown after last successful trigger
            if (now - lastTriggerTimeRef.current < TRIGGER_COOLDOWN_MS) {
              logger.log("Shake detected but in cooldown period, ignoring");
              return;
            }

            const zapscript = usePreferencesStore.getState().shakeZapscript;
            if (!zapscript) {
              logger.log("Shake detected, but no zapscript configured");
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

            const sheet = useShakeSheetStore.getState();
            clearDrainTimer();

            if (shakeCount < REQUIRED_SHAKES) {
              // Light haptic feedback to acknowledge shake was detected
              void impactRef.current("light");
              sheet.charge(
                shakeCount / REQUIRED_SHAKES,
                isRandomLaunchScript(zapscript),
              );
              drainTimerRef.current = setTimeout(() => {
                drainTimerRef.current = null;
                shakeTimestampsRef.current = [];
                useShakeSheetStore.getState().drain();
              }, SHAKE_WINDOW_MS);
              return;
            }

            // Clear shake timestamps and set cooldown
            shakeTimestampsRef.current = [];
            lastTriggerTimeRef.current = now;

            logger.log("Shake triggered, queueing zapscript:", zapscript);

            // Heavy haptic feedback to confirm shake trigger was recognized
            void impactRef.current("heavy");

            sheet.charge(1, isRandomLaunchScript(zapscript));
            useShakeSheetStore.getState().confirm();
            setRunQueue({ value: zapscript, unsafe: true, source: "shake" });
          },
        );

        if (!isMounted) {
          // Component unmounted during async setup, clean up immediately
          void newListener.remove();
          return;
        }
        listener = newListener;

        // The accelerometer only runs while this effect is active
        await ShakeDetector.start();
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
      clearDrainTimer();
      // An unfinished charge has nothing left to finish it. A launch already
      // in flight keeps its sheet.
      shakeTimestampsRef.current = [];
      useShakeSheetStore.getState().drain();
      if (listener) {
        void listener.remove();
      }
      ShakeDetector.stop().catch((error) => {
        logger.debug("Failed to stop shake detector:", error, {
          category: "accelerometer",
          action: "stopShakeDetector",
          severity: "info",
        });
      });
    };
  }, [shakeEnabled, connected, setRunQueue]);
}
