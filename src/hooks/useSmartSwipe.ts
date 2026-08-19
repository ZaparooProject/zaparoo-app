import {
  useSwipeable,
  SwipeableHandlers,
  type SwipeCallback,
  type SwipeEventData,
} from "react-swipeable";
import { useMediaQuery } from "@uidotdev/usehooks";
import { useHaptics } from "./useHaptics";

interface SmartSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSwipeStart?: SwipeCallback;
  onSwiping?: SwipeCallback;
  onSwiped?: SwipeCallback;
  shouldHandleSwipe?: (eventData: SwipeEventData) => boolean;
  preventScrollOnSwipe?: boolean;
  swipeThreshold?: number;
  velocityThreshold?: number;
  /**
   * Force enable mouse-based swipe gestures even on desktop.
   * By default, mouse tracking is only enabled on mobile-sized screens (< 640px).
   * Touch events always work regardless of this setting.
   */
  forceEnable?: boolean;
}

export function useSmartSwipe(
  options: SmartSwipeOptions = {},
): SwipeableHandlers {
  // Tailwind 'sm' breakpoint is 640px - only enable mouse tracking on smaller screens
  const isMobile = useMediaQuery("(max-width: 639px)");
  const { impact } = useHaptics();
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onSwipeStart,
    onSwiping,
    onSwiped,
    shouldHandleSwipe,
    preventScrollOnSwipe = false,
    swipeThreshold = 50,
    velocityThreshold = 0.3,
    forceEnable = false,
  } = options;

  // Enable mouse tracking only on mobile-sized screens, unless forced
  const enableMouseTracking = forceEnable || isMobile;
  const meetsThreshold = (distance: number, eventData: SwipeEventData) =>
    Math.abs(distance) >= swipeThreshold &&
    eventData.velocity >= velocityThreshold &&
    (shouldHandleSwipe?.(eventData) ?? true);

  return useSwipeable({
    onSwipedLeft: onSwipeLeft
      ? (eventData) => {
          if (meetsThreshold(eventData.deltaX, eventData)) {
            impact("light");
            onSwipeLeft();
          }
        }
      : undefined,

    onSwipedRight: onSwipeRight
      ? (eventData) => {
          if (meetsThreshold(eventData.deltaX, eventData)) {
            impact("light");
            onSwipeRight();
          }
        }
      : undefined,

    onSwipedUp: onSwipeUp
      ? (eventData) => {
          if (meetsThreshold(eventData.deltaY, eventData)) {
            impact("light");
            onSwipeUp();
          }
        }
      : undefined,

    onSwipedDown: onSwipeDown
      ? (eventData) => {
          if (meetsThreshold(eventData.deltaY, eventData)) {
            impact("light");
            onSwipeDown();
          }
        }
      : undefined,

    onSwipeStart,
    onSwiping,
    onSwiped,
    preventScrollOnSwipe,
    delta: 10,
    trackMouse: enableMouseTracking,
  });
}
