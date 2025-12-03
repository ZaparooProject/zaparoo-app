import { useSwipeable, SwipeableHandlers } from "react-swipeable";
import { useMediaQuery } from "@uidotdev/usehooks";
import { useHaptics } from "./useHaptics";

interface SmartSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
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
    preventScrollOnSwipe = false,
    swipeThreshold = 50,
    velocityThreshold = 0.3,
    forceEnable = false,
  } = options;

  // Enable mouse tracking only on mobile-sized screens, unless forced
  const enableMouseTracking = forceEnable || isMobile;

  return useSwipeable({
    onSwipedLeft: onSwipeLeft
      ? (eventData) => {
          if (
            Math.abs(eventData.deltaX) > swipeThreshold &&
            eventData.velocity > velocityThreshold
          ) {
            impact("light");
            onSwipeLeft();
          }
        }
      : undefined,

    onSwipedRight: onSwipeRight
      ? (eventData) => {
          if (
            Math.abs(eventData.deltaX) > swipeThreshold &&
            eventData.velocity > velocityThreshold
          ) {
            impact("light");
            onSwipeRight();
          }
        }
      : undefined,

    onSwipedUp: onSwipeUp
      ? (eventData) => {
          if (
            Math.abs(eventData.deltaY) > swipeThreshold &&
            eventData.velocity > velocityThreshold
          ) {
            impact("light");
            onSwipeUp();
          }
        }
      : undefined,

    onSwipedDown: onSwipeDown
      ? (eventData) => {
          if (
            Math.abs(eventData.deltaY) > swipeThreshold &&
            eventData.velocity > velocityThreshold
          ) {
            impact("light");
            onSwipeDown();
          }
        }
      : undefined,

    preventScrollOnSwipe,
    delta: 10,
    trackMouse: enableMouseTracking,
  });
}
