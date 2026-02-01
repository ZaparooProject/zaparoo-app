import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "../../../test-utils";
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

  it("should return isDragging false by default", () => {
    const { result } = renderHook(() => useDragToScroll());

    expect(result.current.isDragging).toBe(false);
  });

  it("should return dragProps with required properties", () => {
    const { result } = renderHook(() => useDragToScroll());

    expect(result.current.dragProps).toHaveProperty("ref");
    expect(result.current.dragProps).toHaveProperty("onMouseDown");
    expect(result.current.dragProps).toHaveProperty("style");
  });

  it("should have grab cursor when enabled", () => {
    const { result } = renderHook(() => useDragToScroll({ enabled: true }));

    expect(result.current.dragProps.style.cursor).toBe("grab");
  });

  it("should have default cursor when disabled", () => {
    const { result } = renderHook(() => useDragToScroll({ enabled: false }));

    expect(result.current.dragProps.style.cursor).toBe("default");
  });

  it("should have userSelect none in style", () => {
    const { result } = renderHook(() => useDragToScroll());

    expect(result.current.dragProps.style.userSelect).toBe("none");
  });

  it("should not start drag on right mouse button click", () => {
    const { result } = renderHook(() => useDragToScroll({ enabled: true }));

    // Create a mock element
    const mockElement = { scrollLeft: 0 };
    act(() => {
      (
        result.current.dragProps
          .ref as React.MutableRefObject<HTMLElement | null>
      ).current = mockElement as unknown as HTMLElement;
    });

    // Simulate right mouse button down (button !== 0)
    const preventDefault = vi.fn();
    act(() => {
      const mouseEvent = {
        button: 2, // Right click
        clientX: 100,
        preventDefault,
      } as unknown as React.MouseEvent;
      result.current.dragProps.onMouseDown(mouseEvent);
    });

    // Should not add event listeners for non-left clicks
    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      "mousemove",
      expect.any(Function),
    );
    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      "mouseup",
      expect.any(Function),
    );
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("should start drag on left mouse button click when enabled", () => {
    const { result } = renderHook(() => useDragToScroll({ enabled: true }));

    // Create a mock element
    const mockElement = { scrollLeft: 50 };
    act(() => {
      (
        result.current.dragProps
          .ref as React.MutableRefObject<HTMLElement | null>
      ).current = mockElement as unknown as HTMLElement;
    });

    // Simulate left mouse button down
    const preventDefault = vi.fn();
    act(() => {
      const mouseEvent = {
        button: 0, // Left click
        clientX: 100,
        preventDefault,
      } as unknown as React.MouseEvent;
      result.current.dragProps.onMouseDown(mouseEvent);
    });

    // Should add event listeners
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "mousemove",
      expect.any(Function),
    );
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "mouseup",
      expect.any(Function),
    );
    expect(preventDefault).toHaveBeenCalled();
  });

  it("should not start drag when disabled", () => {
    const { result } = renderHook(() => useDragToScroll({ enabled: false }));

    // Create a mock element
    const mockElement = { scrollLeft: 50 };
    act(() => {
      (
        result.current.dragProps
          .ref as React.MutableRefObject<HTMLElement | null>
      ).current = mockElement as unknown as HTMLElement;
    });

    // Simulate left mouse button down
    const preventDefault = vi.fn();
    act(() => {
      const mouseEvent = {
        button: 0,
        clientX: 100,
        preventDefault,
      } as unknown as React.MouseEvent;
      result.current.dragProps.onMouseDown(mouseEvent);
    });

    // Should not add event listeners when disabled
    expect(addEventListenerSpy).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("should update scrollLeft during drag with default sensitivity", () => {
    const { result } = renderHook(() => useDragToScroll({ enabled: true }));

    // Create a mock element
    const mockElement = { scrollLeft: 100 };
    act(() => {
      (
        result.current.dragProps
          .ref as React.MutableRefObject<HTMLElement | null>
      ).current = mockElement as unknown as HTMLElement;
    });

    // Start drag at position 100
    act(() => {
      const mouseEvent = {
        button: 0,
        clientX: 100,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent;
      result.current.dragProps.onMouseDown(mouseEvent);
    });

    // Get the mousemove handler that was added
    const mouseMoveHandler = addEventListenerSpy.mock.calls.find(
      (call: [string, EventListener]) => call[0] === "mousemove",
    )?.[1] as EventListener;
    expect(mouseMoveHandler).toBeDefined();

    // Simulate mouse move to position 150 (50px right)
    act(() => {
      mouseMoveHandler({ clientX: 150 } as MouseEvent);
    });

    // scrollLeft should decrease (dragging right scrolls left)
    // scrollStart (100) - deltaX (50) * sensitivity (1) = 50
    expect(mockElement.scrollLeft).toBe(50);
  });

  it("should update scrollLeft during drag with custom sensitivity", () => {
    const { result } = renderHook(() =>
      useDragToScroll({ enabled: true, scrollSensitivity: 2 }),
    );

    // Create a mock element
    const mockElement = { scrollLeft: 100 };
    act(() => {
      (
        result.current.dragProps
          .ref as React.MutableRefObject<HTMLElement | null>
      ).current = mockElement as unknown as HTMLElement;
    });

    // Start drag at position 100
    act(() => {
      const mouseEvent = {
        button: 0,
        clientX: 100,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent;
      result.current.dragProps.onMouseDown(mouseEvent);
    });

    // Get the mousemove handler
    const mouseMoveHandler = addEventListenerSpy.mock.calls.find(
      (call: [string, EventListener]) => call[0] === "mousemove",
    )?.[1] as EventListener;

    // Simulate mouse move to position 150 (50px right)
    act(() => {
      mouseMoveHandler({ clientX: 150 } as MouseEvent);
    });

    // scrollStart (100) - deltaX (50) * sensitivity (2) = 0
    expect(mockElement.scrollLeft).toBe(0);
  });

  it("should stop drag on mouseup", () => {
    const { result } = renderHook(() => useDragToScroll({ enabled: true }));

    // Create a mock element
    const mockElement = { scrollLeft: 100 };
    act(() => {
      (
        result.current.dragProps
          .ref as React.MutableRefObject<HTMLElement | null>
      ).current = mockElement as unknown as HTMLElement;
    });

    // Start drag
    act(() => {
      const mouseEvent = {
        button: 0,
        clientX: 100,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent;
      result.current.dragProps.onMouseDown(mouseEvent);
    });

    // Get the mouseup handler
    const mouseUpHandler = addEventListenerSpy.mock.calls.find(
      (call: [string, EventListener]) => call[0] === "mouseup",
    )?.[1] as EventListener;
    expect(mouseUpHandler).toBeDefined();

    // Simulate mouseup
    act(() => {
      mouseUpHandler({} as MouseEvent);
    });

    // Event listeners should be removed
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "mousemove",
      expect.any(Function),
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "mouseup",
      expect.any(Function),
    );
  });

  it("should clean up listeners on unmount", () => {
    const { result, unmount } = renderHook(() =>
      useDragToScroll({ enabled: true }),
    );

    // Create a mock element
    const mockElement = { scrollLeft: 100 };
    act(() => {
      (
        result.current.dragProps
          .ref as React.MutableRefObject<HTMLElement | null>
      ).current = mockElement as unknown as HTMLElement;
    });

    // Start drag
    act(() => {
      const mouseEvent = {
        button: 0,
        clientX: 100,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent;
      result.current.dragProps.onMouseDown(mouseEvent);
    });

    // Unmount while dragging
    unmount();

    // Cleanup should have removed the listeners
    expect(removeEventListenerSpy).toHaveBeenCalled();
  });

  it("should not update scrollLeft when ref is null during drag", () => {
    const { result } = renderHook(() => useDragToScroll({ enabled: true }));

    // Create a mock element
    const mockElement = { scrollLeft: 100 };
    act(() => {
      (
        result.current.dragProps
          .ref as React.MutableRefObject<HTMLElement | null>
      ).current = mockElement as unknown as HTMLElement;
    });

    // Start drag
    act(() => {
      const mouseEvent = {
        button: 0,
        clientX: 100,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent;
      result.current.dragProps.onMouseDown(mouseEvent);
    });

    // Set ref to null
    act(() => {
      (
        result.current.dragProps
          .ref as React.MutableRefObject<HTMLElement | null>
      ).current = null;
    });

    // Get the mousemove handler
    const mouseMoveHandler = addEventListenerSpy.mock.calls.find(
      (call: [string, EventListener]) => call[0] === "mousemove",
    )?.[1] as EventListener;

    // Simulate mouse move - should not throw
    act(() => {
      mouseMoveHandler({ clientX: 150 } as MouseEvent);
    });

    // Original mockElement should still have its original value
    expect(mockElement.scrollLeft).toBe(100);
  });

  it("should handle mousedown without element ref", () => {
    const { result } = renderHook(() => useDragToScroll({ enabled: true }));

    // Do not set the ref - it's null by default

    // Simulate left mouse button down - should not throw
    const preventDefault = vi.fn();
    act(() => {
      const mouseEvent = {
        button: 0,
        clientX: 100,
        preventDefault,
      } as unknown as React.MouseEvent;
      result.current.dragProps.onMouseDown(mouseEvent);
    });

    // Should not add event listeners when element ref is null
    expect(addEventListenerSpy).not.toHaveBeenCalled();
  });

  it("should use default enabled=true when no options provided", () => {
    const { result } = renderHook(() => useDragToScroll());

    expect(result.current.dragProps.style.cursor).toBe("grab");
  });

  it("should use default scrollSensitivity=1 when not provided", () => {
    const { result } = renderHook(() => useDragToScroll({ enabled: true }));

    // Create a mock element
    const mockElement = { scrollLeft: 100 };
    act(() => {
      (
        result.current.dragProps
          .ref as React.MutableRefObject<HTMLElement | null>
      ).current = mockElement as unknown as HTMLElement;
    });

    // Start drag
    act(() => {
      const mouseEvent = {
        button: 0,
        clientX: 100,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent;
      result.current.dragProps.onMouseDown(mouseEvent);
    });

    // Get the mousemove handler
    const mouseMoveHandler = addEventListenerSpy.mock.calls.find(
      (call: [string, EventListener]) => call[0] === "mousemove",
    )?.[1] as EventListener;

    // Simulate mouse move
    act(() => {
      mouseMoveHandler({ clientX: 120 } as MouseEvent);
    });

    // With sensitivity 1: scrollStart (100) - deltaX (20) * 1 = 80
    expect(mockElement.scrollLeft).toBe(80);
  });
});
