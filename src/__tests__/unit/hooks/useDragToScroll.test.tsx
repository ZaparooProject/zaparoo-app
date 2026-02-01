/**
 * Unit Tests: useDragToScroll Hook
 *
 * Tests the drag-to-scroll functionality for horizontal scrolling containers:
 * - Returns dragProps with ref and event handlers
 * - Updates scrollLeft on mouse drag
 * - Only handles left mouse button (button === 0)
 * - Does not respond when disabled
 * - Respects scrollSensitivity option
 * - Cleans up global listeners on mouse up/unmount
 * - Reports isDragging state correctly
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDragToScroll } from "@/hooks/useDragToScroll";

describe("useDragToScroll", () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    addEventListenerSpy = vi.spyOn(document, "addEventListener");
    removeEventListenerSpy = vi.spyOn(document, "removeEventListener");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("basic functionality", () => {
    it("should return dragProps with ref and event handlers", () => {
      // Act
      const { result } = renderHook(() => useDragToScroll());

      // Assert
      expect(result.current.dragProps).toBeDefined();
      expect(result.current.dragProps.ref).toBeDefined();
      expect(result.current.dragProps.onMouseDown).toBeDefined();
      expect(result.current.dragProps.style).toBeDefined();
    });

    it("should have grab cursor style when enabled", () => {
      // Act
      const { result } = renderHook(() => useDragToScroll({ enabled: true }));

      // Assert
      expect(result.current.dragProps.style.cursor).toBe("grab");
    });

    it("should have default cursor style when disabled", () => {
      // Act
      const { result } = renderHook(() => useDragToScroll({ enabled: false }));

      // Assert
      expect(result.current.dragProps.style.cursor).toBe("default");
    });
  });

  describe("mouse button handling", () => {
    it("should only handle left mouse button (button === 0)", () => {
      // Arrange
      const { result } = renderHook(() => useDragToScroll());

      // Create a mock element
      const mockElement = document.createElement("div");
      Object.defineProperty(mockElement, "scrollLeft", {
        value: 0,
        writable: true,
      });

      // Set the ref
      (
        result.current.dragProps.ref as { current: HTMLDivElement | null }
      ).current = mockElement;

      // Act - try right mouse button
      const rightClickEvent = {
        button: 2, // Right click
        clientX: 100,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent;

      act(() => {
        result.current.dragProps.onMouseDown(rightClickEvent);
      });

      // Assert - should not add listeners for right click
      expect(addEventListenerSpy).not.toHaveBeenCalledWith(
        "mousemove",
        expect.any(Function),
      );
    });

    it("should handle left mouse button (button === 0)", () => {
      // Arrange
      const { result } = renderHook(() => useDragToScroll());

      // Create a mock element
      const mockElement = document.createElement("div");
      Object.defineProperty(mockElement, "scrollLeft", {
        value: 0,
        writable: true,
      });

      // Set the ref
      (
        result.current.dragProps.ref as { current: HTMLDivElement | null }
      ).current = mockElement;

      // Act - left mouse button
      const leftClickEvent = {
        button: 0, // Left click
        clientX: 100,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent;

      act(() => {
        result.current.dragProps.onMouseDown(leftClickEvent);
      });

      // Assert - should add listeners for left click
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "mousemove",
        expect.any(Function),
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "mouseup",
        expect.any(Function),
      );
    });
  });

  describe("disabled state", () => {
    it("should not respond when disabled", () => {
      // Arrange
      const { result } = renderHook(() => useDragToScroll({ enabled: false }));

      // Create a mock element
      const mockElement = document.createElement("div");
      Object.defineProperty(mockElement, "scrollLeft", {
        value: 0,
        writable: true,
      });

      // Set the ref
      (
        result.current.dragProps.ref as { current: HTMLDivElement | null }
      ).current = mockElement;

      // Act
      const mouseEvent = {
        button: 0,
        clientX: 100,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent;

      act(() => {
        result.current.dragProps.onMouseDown(mouseEvent);
      });

      // Assert - should not add listeners when disabled
      expect(addEventListenerSpy).not.toHaveBeenCalledWith(
        "mousemove",
        expect.any(Function),
      );
    });
  });

  describe("scroll sensitivity", () => {
    it("should respect scrollSensitivity option", () => {
      // Arrange
      const sensitivity = 2;
      const { result } = renderHook(() =>
        useDragToScroll({ scrollSensitivity: sensitivity }),
      );

      // Create a mock element with mutable scrollLeft
      let scrollLeftValue = 100;
      const mockElement = document.createElement("div");
      Object.defineProperty(mockElement, "scrollLeft", {
        get: () => scrollLeftValue,
        set: (v) => {
          scrollLeftValue = v;
        },
      });

      // Set the ref
      (
        result.current.dragProps.ref as { current: HTMLDivElement | null }
      ).current = mockElement;

      // Start drag
      const startX = 100;
      const mouseDownEvent = {
        button: 0,
        clientX: startX,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent;

      act(() => {
        result.current.dragProps.onMouseDown(mouseDownEvent);
      });

      // Get the mousemove handler
      const mouseMoveHandler = addEventListenerSpy.mock.calls.find(
        (call: [string, EventListener]) => call[0] === "mousemove",
      )?.[1] as EventListener;

      // Simulate mouse move
      const deltaX = 50;
      const mouseMoveEvent = new MouseEvent("mousemove", {
        clientX: startX + deltaX,
      });

      act(() => {
        mouseMoveHandler(mouseMoveEvent);
      });

      // Assert - scroll should change by deltaX * sensitivity
      // New scroll = startScroll - (deltaX * sensitivity)
      // 100 - (50 * 2) = 0
      expect(scrollLeftValue).toBe(100 - deltaX * sensitivity);
    });
  });

  describe("cleanup", () => {
    it("should cleanup global listeners on mouse up", () => {
      // Arrange
      const { result } = renderHook(() => useDragToScroll());

      // Create a mock element
      const mockElement = document.createElement("div");
      Object.defineProperty(mockElement, "scrollLeft", {
        value: 0,
        writable: true,
      });

      // Set the ref
      (
        result.current.dragProps.ref as { current: HTMLDivElement | null }
      ).current = mockElement;

      // Start drag
      const mouseDownEvent = {
        button: 0,
        clientX: 100,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent;

      act(() => {
        result.current.dragProps.onMouseDown(mouseDownEvent);
      });

      // Get the mouseup handler
      const mouseUpHandler = addEventListenerSpy.mock.calls.find(
        (call: [string, EventListener]) => call[0] === "mouseup",
      )?.[1] as EventListener;

      // Simulate mouse up
      const mouseUpEvent = new MouseEvent("mouseup");
      act(() => {
        mouseUpHandler(mouseUpEvent);
      });

      // Assert - listeners should be removed
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "mousemove",
        expect.any(Function),
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "mouseup",
        expect.any(Function),
      );
    });

    it("should cleanup global listeners on unmount", () => {
      // Arrange
      const { result, unmount } = renderHook(() => useDragToScroll());

      // Create a mock element
      const mockElement = document.createElement("div");
      Object.defineProperty(mockElement, "scrollLeft", {
        value: 0,
        writable: true,
      });

      // Set the ref
      (
        result.current.dragProps.ref as { current: HTMLDivElement | null }
      ).current = mockElement;

      // Start drag
      const mouseDownEvent = {
        button: 0,
        clientX: 100,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent;

      act(() => {
        result.current.dragProps.onMouseDown(mouseDownEvent);
      });

      // Act - unmount while dragging
      unmount();

      // Assert - listeners should be cleaned up
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "mousemove",
        expect.any(Function),
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "mouseup",
        expect.any(Function),
      );
    });
  });

  describe("dragging state", () => {
    it("should be false initially", () => {
      // Act
      const { result } = renderHook(() => useDragToScroll());

      // Assert
      expect(result.current.isDragging).toBe(false);
    });

    it("should have grabbing cursor during drag", () => {
      // Arrange
      const { result, rerender } = renderHook(() => useDragToScroll());

      const mockElement = document.createElement("div");
      Object.defineProperty(mockElement, "scrollLeft", {
        value: 0,
        writable: true,
      });

      (
        result.current.dragProps.ref as { current: HTMLDivElement | null }
      ).current = mockElement;

      // Initially should have grab cursor
      expect(result.current.dragProps.style.cursor).toBe("grab");

      // Act - start drag
      const mouseDownEvent = {
        button: 0,
        clientX: 100,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent;

      act(() => {
        result.current.dragProps.onMouseDown(mouseDownEvent);
      });

      // Rerender to get updated cursor style (ref value is captured at render time)
      rerender();

      // Assert - should have grabbing cursor during drag
      expect(result.current.dragProps.style.cursor).toBe("grabbing");
      expect(result.current.isDragging).toBe(true);

      // Act - end drag
      const mouseUpHandler = addEventListenerSpy.mock.calls.find(
        (call: [string, EventListener]) => call[0] === "mouseup",
      )?.[1] as EventListener;

      act(() => {
        mouseUpHandler(new MouseEvent("mouseup"));
      });

      rerender();

      // Assert - should be back to grab cursor
      expect(result.current.dragProps.style.cursor).toBe("grab");
      expect(result.current.isDragging).toBe(false);
    });
  });

  describe("scroll behavior", () => {
    it("should update scrollLeft on mouse drag", () => {
      // Arrange
      const { result } = renderHook(() => useDragToScroll());

      // Create a mock element with mutable scrollLeft
      let scrollLeftValue = 50;
      const mockElement = document.createElement("div");
      Object.defineProperty(mockElement, "scrollLeft", {
        get: () => scrollLeftValue,
        set: (v) => {
          scrollLeftValue = v;
        },
      });

      // Set the ref
      (
        result.current.dragProps.ref as { current: HTMLDivElement | null }
      ).current = mockElement;

      // Start drag
      const startX = 100;
      const mouseDownEvent = {
        button: 0,
        clientX: startX,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent;

      act(() => {
        result.current.dragProps.onMouseDown(mouseDownEvent);
      });

      // Get the mousemove handler
      const mouseMoveHandler = addEventListenerSpy.mock.calls.find(
        (call: [string, EventListener]) => call[0] === "mousemove",
      )?.[1] as EventListener;

      // Simulate dragging right (should scroll left - decrease scrollLeft)
      const moveRight = new MouseEvent("mousemove", {
        clientX: startX + 30,
      });

      act(() => {
        mouseMoveHandler(moveRight);
      });

      // scrollLeft should decrease when dragging right
      // New scroll = startScroll - deltaX * sensitivity
      // 50 - (30 * 1) = 20
      expect(scrollLeftValue).toBe(20);
    });
  });

  describe("prevent default", () => {
    it("should prevent text selection while dragging", () => {
      // Arrange
      const { result } = renderHook(() => useDragToScroll());

      // Create a mock element
      const mockElement = document.createElement("div");
      Object.defineProperty(mockElement, "scrollLeft", {
        value: 0,
        writable: true,
      });

      // Set the ref
      (
        result.current.dragProps.ref as { current: HTMLDivElement | null }
      ).current = mockElement;

      // Act
      const preventDefault = vi.fn();
      const mouseDownEvent = {
        button: 0,
        clientX: 100,
        preventDefault,
      } as unknown as React.MouseEvent;

      act(() => {
        result.current.dragProps.onMouseDown(mouseDownEvent);
      });

      // Assert - preventDefault should be called to prevent text selection
      expect(preventDefault).toHaveBeenCalled();
    });
  });
});
