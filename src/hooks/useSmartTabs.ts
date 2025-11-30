import React, { useState, useEffect, useCallback } from "react";
import { useDragToScroll } from "./useDragToScroll";

interface SmartTabsOptions {
  onScrollChange?: (scrollLeft: number, hasOverflow: boolean) => void;
}

interface SmartTabsReturn<T extends HTMLElement = HTMLElement> {
  hasOverflow: boolean;
  isDragging: boolean;
  tabsProps: {
    ref: React.RefObject<T | null>;
    onMouseDown: (e: React.MouseEvent) => void;
    onScroll?: (e: React.UIEvent<T>) => void;
    onWheel?: (e: React.WheelEvent<T>) => void;
    style: React.CSSProperties;
    className: string;
  };
}

/**
 * Hook that provides smart tab behavior:
 * - Detects overflow and enables drag-to-scroll when needed
 * - Centers tabs when they fit within the container
 * - Provides scroll change callbacks for gradient indicators
 * - Supports horizontal scrolling with mouse wheel and shift+scroll
 */
export function useSmartTabs<T extends HTMLElement = HTMLElement>({
  onScrollChange,
}: SmartTabsOptions = {}): SmartTabsReturn<T> {
  const [hasOverflow, setHasOverflow] = useState(false);

  // Get drag-to-scroll functionality
  const { isDragging, dragProps } = useDragToScroll<T>({
    enabled: hasOverflow,
  });

  // Check for overflow - reads from DOM and updates state
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- Intentional: callback depends on ref object, not its value
  const checkOverflow = useCallback(() => {
    const element = dragProps.ref.current;
    if (!element) return;

    const isOverflowing = element.scrollWidth > element.clientWidth;
    setHasOverflow(isOverflowing);
  }, [dragProps.ref]);

  // Handle scroll events for gradient indicators
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLElement>) => {
      if (!onScrollChange) return;

      const element = e.currentTarget;
      onScrollChange(element.scrollLeft, hasOverflow);
    },
    [onScrollChange, hasOverflow],
  );

  // Handle wheel events for horizontal scrolling
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLElement>) => {
      if (!hasOverflow) return;

      // Only handle horizontal scrolling or shift+vertical scroll
      if (e.deltaX !== 0 || e.shiftKey) {
        e.preventDefault();
        const element = e.currentTarget;
        const scrollAmount = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        element.scrollLeft += scrollAmount;
      }
    },
    [hasOverflow],
  );

  // Set up resize observer to detect overflow changes
  useEffect(() => {
    const element = dragProps.ref.current;
    if (!element) return;

    // Initial check - syncing state with DOM measurements
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: initial DOM measurement
    checkOverflow();

    // Create resize observer to watch for size changes
    const resizeObserver = new ResizeObserver(() => {
      checkOverflow();
    });

    resizeObserver.observe(element);

    // Also observe children changes (when tabs are added/removed)
    const mutationObserver = new MutationObserver(() => {
      // Use setTimeout to ensure DOM has updated
      setTimeout(checkOverflow, 0);
    });

    mutationObserver.observe(element, {
      childList: true,
      subtree: true,
    });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [checkOverflow, dragProps.ref]);

  // Determine the appropriate className based on overflow state
  const getClassName = () => {
    const baseClasses = "flex w-full";

    if (hasOverflow) {
      // When overflowing: left-align and enable scrolling
      return `${baseClasses} justify-start overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`;
    } else {
      // When not overflowing: center the tabs
      return `${baseClasses} justify-center`;
    }
  };

  const tabsProps = {
    ...dragProps,
    onScroll: onScrollChange ? handleScroll : undefined,
    onWheel: handleWheel,
    className: getClassName(),
  };

  return {
    hasOverflow,
    isDragging,
    tabsProps,
  };
}
