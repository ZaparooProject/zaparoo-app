import { useCallback, useRef, useState } from "react";
import type { SwipeEventData, SwipeableHandlers } from "react-swipeable";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";

export const SWIPE_BACK_TRIGGER_DISTANCE = 96;
const SWIPE_BACK_REVERSAL_TOLERANCE = 8;

interface SwipeBackGesture {
  cancelSwipeBack: () => void;
  progress: number;
  swipeHandlers: SwipeableHandlers;
}

export function useSwipeBack(onSwipeBack?: () => void): SwipeBackGesture {
  const [progress, setProgress] = useState(0);
  const invalidatedRef = useRef(false);
  const maximumDeltaXRef = useRef(0);
  const enabled = Boolean(onSwipeBack);

  const clearSwipeBackProgress = useCallback(() => {
    setProgress(0);
  }, []);

  const cancelSwipeBack = useCallback(() => {
    invalidatedRef.current = true;
    clearSwipeBackProgress();
  }, [clearSwipeBackProgress]);

  const startSwipeBack = useCallback(() => {
    invalidatedRef.current = false;
    maximumDeltaXRef.current = 0;
    clearSwipeBackProgress();
  }, [clearSwipeBackProgress]);

  const handleSwiping = useCallback((eventData: SwipeEventData) => {
    maximumDeltaXRef.current = Math.max(
      maximumDeltaXRef.current,
      eventData.deltaX,
    );
    const reversed =
      eventData.deltaX <
      maximumDeltaXRef.current - SWIPE_BACK_REVERSAL_TOLERANCE;

    if (
      invalidatedRef.current ||
      reversed ||
      eventData.dir !== "Right" ||
      eventData.deltaX <= 0
    ) {
      invalidatedRef.current = true;
      setProgress(0);
      return;
    }

    const nextProgress = Math.min(
      eventData.deltaX / SWIPE_BACK_TRIGGER_DISTANCE,
      1,
    );
    setProgress((currentProgress) =>
      currentProgress === nextProgress ? currentProgress : nextProgress,
    );
  }, []);

  const shouldCompleteSwipeBack = useCallback(
    () => !invalidatedRef.current,
    [],
  );
  const completeSwipeBack = useCallback(() => {
    if (shouldCompleteSwipeBack()) onSwipeBack?.();
  }, [onSwipeBack, shouldCompleteSwipeBack]);

  const swipeHandlers = useSmartSwipe({
    onSwipeRight: enabled ? completeSwipeBack : undefined,
    onSwipeStart: enabled ? startSwipeBack : undefined,
    onSwiping: enabled ? handleSwiping : undefined,
    onSwiped: enabled ? clearSwipeBackProgress : undefined,
    shouldHandleSwipe: enabled ? shouldCompleteSwipeBack : undefined,
    preventScrollOnSwipe: false,
    swipeThreshold: SWIPE_BACK_TRIGGER_DISTANCE,
    velocityThreshold: 0,
  });

  return {
    cancelSwipeBack,
    progress: enabled ? progress : 0,
    swipeHandlers,
  };
}
