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
  scrollSensitivity = 1
}: DragToScrollOptions = {}): DragToScrollReturn<T> {
  const elementRef = useRef<T>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollStartRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
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
      const newScrollLeft = scrollStartRef.current - (deltaX * scrollSensitivity);

      elementRef.current.scrollLeft = newScrollLeft;
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [enabled, scrollSensitivity]);

  // Clean up event listeners on unmount
  useEffect(() => {
    return () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
      }
    };
  }, []);

  const dragProps = {
    ref: elementRef,
    onMouseDown: handleMouseDown,
    style: {
      cursor: enabled ? (isDraggingRef.current ? "grabbing" : "grab") : "default",
      userSelect: "none" as const
    }
  };

  return {
    isDragging: isDraggingRef.current,
    dragProps
  };
}