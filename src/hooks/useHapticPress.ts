import { useCallback } from "react";
import type { PointerEvent } from "react";
import { useHaptics } from "@/hooks/useHaptics";

type ImpactStyle = "light" | "medium" | "heavy";

/**
 * Provides haptic feedback after a touchscreen press completes.
 * Pointer cancellation prevents scrolling from being treated as a press.
 */
export function useHapticPress(style: ImpactStyle = "light", enabled = true) {
  const { impact } = useHaptics();

  return useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (enabled && event.isPrimary && event.pointerType === "touch") {
        void impact(style);
      }
    },
    [enabled, impact, style],
  );
}
