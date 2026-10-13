import { useRef, useState } from "react";
import type { PointerEvent, TouchEvent } from "react";
import { useHapticPress } from "@/hooks/useHapticPress";

/** Movement past this many pixels is a scroll gesture, not a press. */
const SCROLL_THRESHOLD_PX = 10;

export type TactileIntent = "default" | "primary" | "destructive" | "pro";

interface UseTactilePressOptions {
  intent?: TactileIntent;
  disabled?: boolean;
  decorative?: boolean;
  /** Presses only earn haptics when something is listening for them. */
  hasOnClick?: boolean;
}

/**
 * Shared press behaviour for the tactile controls: depressed state for the
 * material's travel, haptics on a completed touch, and suppression of presses
 * that turned out to be scrolls.
 */
export function useTactilePress({
  intent = "default",
  disabled = false,
  decorative = false,
  hasOnClick = false,
}: UseTactilePressOptions = {}) {
  const [pressed, setPressed] = useState(false);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const hasMoved = useRef(false);

  const hapticStyle =
    intent === "destructive"
      ? "heavy"
      : intent === "primary" || intent === "pro"
        ? "medium"
        : "light";
  const handleHapticPress = useHapticPress(
    hapticStyle,
    !disabled && !decorative && hasOnClick,
  );

  return {
    pressed: pressed && !disabled,
    /** False when the gesture turned into a scroll, or the control is inert. */
    shouldFireClick: () => !hasMoved.current && !disabled,
    handlers: {
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        if (!hasMoved.current) {
          handleHapticPress(event);
        }
      },
      onTouchStart: (event: TouchEvent<HTMLElement>) => {
        const touch = event.touches[0];
        if (!touch) return;
        touchStartPos.current = { x: touch.clientX, y: touch.clientY };
        hasMoved.current = false;
        setPressed(true);
      },
      onTouchMove: (event: TouchEvent<HTMLElement>) => {
        if (!touchStartPos.current) return;
        const touch = event.touches[0];
        if (!touch) return;
        const deltaX = Math.abs(touch.clientX - touchStartPos.current.x);
        const deltaY = Math.abs(touch.clientY - touchStartPos.current.y);

        if (deltaX > SCROLL_THRESHOLD_PX || deltaY > SCROLL_THRESHOLD_PX) {
          hasMoved.current = true;
          setPressed(false);
        }
      },
      onTouchEnd: () => {
        setPressed(false);
        // Reset after a short delay to allow click to process
        setTimeout(() => {
          hasMoved.current = false;
          touchStartPos.current = null;
        }, 100);
      },
      onTouchCancel: () => {
        setPressed(false);
        hasMoved.current = false;
        touchStartPos.current = null;
      },
      onMouseDown: () => setPressed(true),
      onMouseUp: () => setPressed(false),
      onMouseLeave: () => setPressed(false),
    },
  };
}
