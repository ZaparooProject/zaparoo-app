import React, { useRef, useCallback, useEffect } from "react";

interface DragToScrollOptions {
  enabled?: boolean;
  scrollSensitivity?: number;
}

interface DragToScrollReturn<T extends HTMLElement = HTMLElement> {
  isDragging: boolean;
  dragProps: {
    ref: React.RefObject<T | null>;
    onMouseDown: (e: React.MouseEvent) => void;
    style: React.CSSProperties;
  };
}

/**
 * Hook that enables drag-to-scroll functionality for horizontal scrolling containers.
 * Provides a smooth drag experience similar to mobile touch scrolling on desktop.
 */
export function useDragToScroll<T extends HTMLElement = HTMLElement>({
  enabled = true,
  scrollSensitivity = 1,
}: DragToScrollOptions = {}): DragToScrollReturn<T> {
  const elementRef = useRef<T>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollStartRef = useRef(0);
  // Store cleanup function to allow unmount cleanup
  const cleanupRef = useRef<(() => void) | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled || !elementRef.current) return;

      // Only handle left mouse button
      if (e.button !== 0) return;

      isDraggingRef.current = true;
      startXRef.current = e.clientX;
      scrollStartRef.current = elementRef.current.scrollLeft;

      // Prevent text selection while dragging
      e.preventDefault();

      // Add global event listeners for drag
      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDraggingRef.current || !elementRef.current) return;

        const deltaX = moveEvent.clientX - startXRef.current;
        const newScrollLeft =
          scrollStartRef.current - deltaX * scrollSensitivity;

        elementRef.current.scrollLeft = newScrollLeft;
      };

      const handleMouseUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        cleanupRef.current = null;
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      // Store cleanup function for unmount
      cleanupRef.current = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    },
    [enabled, scrollSensitivity],
  );

  // Clean up event listeners on unmount
  useEffect(() => {
    return () => {
      isDraggingRef.current = false;
      // Clean up any dangling listeners
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  // Note: Reading refs here is intentional - isDragging is meant to track realtime drag state
  // The ref is used because React state would cause re-renders during mouse movement
  /* eslint-disable react-hooks/refs -- Intentional: reading drag state for return value */
  const dragProps = {
    ref: elementRef,
    onMouseDown: handleMouseDown,
    style: {
      cursor: enabled
        ? isDraggingRef.current
          ? "grabbing"
          : "grab"
        : "default",
      userSelect: "none" as const,
    },
  };

  return {
    isDragging: isDraggingRef.current,
    dragProps,
  };
}
