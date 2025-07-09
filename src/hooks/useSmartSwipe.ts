import { useSwipeable, SwipeableHandlers } from 'react-swipeable';

interface SmartSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  preventScrollOnSwipe?: boolean;
  swipeThreshold?: number;
  velocityThreshold?: number;
}

export function useSmartSwipe(options: SmartSwipeOptions = {}): SwipeableHandlers {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    preventScrollOnSwipe = false,
    swipeThreshold = 50,
    velocityThreshold = 0.3
  } = options;

  return useSwipeable({
    onSwipedLeft: onSwipeLeft ? (eventData) => {
      if (Math.abs(eventData.deltaX) > swipeThreshold && eventData.velocity > velocityThreshold) {
        onSwipeLeft();
      }
    } : undefined,
    
    onSwipedRight: onSwipeRight ? (eventData) => {
      if (Math.abs(eventData.deltaX) > swipeThreshold && eventData.velocity > velocityThreshold) {
        onSwipeRight();
      }
    } : undefined,
    
    onSwipedUp: onSwipeUp ? (eventData) => {
      if (Math.abs(eventData.deltaY) > swipeThreshold && eventData.velocity > velocityThreshold) {
        onSwipeUp();
      }
    } : undefined,
    
    onSwipedDown: onSwipeDown ? (eventData) => {
      if (Math.abs(eventData.deltaY) > swipeThreshold && eventData.velocity > velocityThreshold) {
        onSwipeDown();
      }
    } : undefined,
    
    preventScrollOnSwipe,
    delta: 10,
    trackMouse: true
  });
}