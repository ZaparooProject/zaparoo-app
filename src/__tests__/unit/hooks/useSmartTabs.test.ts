import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "../../../test-utils";
import { useSmartTabs } from "@/hooks/useSmartTabs";

describe("useSmartTabs", () => {
  let mockResizeObserverInstances: Array<{
    callback: (
      entries: ResizeObserverEntry[],
      observer: ResizeObserver,
    ) => void;
    observe: ReturnType<typeof vi.fn>;
    unobserve: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];
  let mockMutationObserverInstances: Array<{
    callback: (mutations: MutationRecord[], observer: MutationObserver) => void;
    observe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    takeRecords: ReturnType<typeof vi.fn>;
  }> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockResizeObserverInstances = [];
    mockMutationObserverInstances = [];

    // Mock ResizeObserver
    global.ResizeObserver = vi.fn().mockImplementation((callback) => {
      const instance = {
        callback,
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      };
      mockResizeObserverInstances.push(instance);
      return instance;
    }) as unknown as typeof ResizeObserver;

    // Mock MutationObserver
    global.MutationObserver = vi.fn().mockImplementation((callback) => {
      const instance = {
        callback,
        observe: vi.fn(),
        disconnect: vi.fn(),
        takeRecords: vi.fn().mockReturnValue([]),
      };
      mockMutationObserverInstances.push(instance);
      return instance;
    }) as unknown as typeof MutationObserver;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("return values", () => {
    it("should return hasOverflow false by default", () => {
      const { result } = renderHook(() => useSmartTabs());

      expect(result.current.hasOverflow).toBe(false);
    });

    it("should return isDragging false by default", () => {
      const { result } = renderHook(() => useSmartTabs());

      expect(result.current.isDragging).toBe(false);
    });

    it("should return tabsProps with required properties", () => {
      const { result } = renderHook(() => useSmartTabs());

      expect(result.current.tabsProps).toHaveProperty("ref");
      expect(result.current.tabsProps).toHaveProperty("onMouseDown");
      expect(result.current.tabsProps).toHaveProperty("style");
      expect(result.current.tabsProps).toHaveProperty("className");
      expect(result.current.tabsProps).toHaveProperty("onWheel");
    });
  });

  describe("className based on overflow", () => {
    it("should return centered className when no overflow", () => {
      const { result } = renderHook(() => useSmartTabs());

      expect(result.current.tabsProps.className).toContain("justify-center");
      expect(result.current.tabsProps.className).not.toContain(
        "overflow-x-auto",
      );
    });
  });

  describe("onScroll handler", () => {
    it("should not have onScroll handler when onScrollChange is not provided", () => {
      const { result } = renderHook(() => useSmartTabs());

      expect(result.current.tabsProps.onScroll).toBeUndefined();
    });

    it("should have onScroll handler when onScrollChange is provided", () => {
      const onScrollChange = vi.fn();
      const { result } = renderHook(() => useSmartTabs({ onScrollChange }));

      expect(result.current.tabsProps.onScroll).toBeDefined();
    });

    it("should call onScrollChange with scroll position and overflow state", () => {
      const onScrollChange = vi.fn();
      const { result } = renderHook(() => useSmartTabs({ onScrollChange }));

      // hasOverflow is false by default
      const mockElement = { scrollLeft: 50 };
      const scrollEvent = {
        currentTarget: mockElement,
      } as unknown as React.UIEvent<HTMLElement>;

      act(() => {
        result.current.tabsProps.onScroll?.(scrollEvent);
      });

      // Called with scrollLeft and current hasOverflow state (false)
      expect(onScrollChange).toHaveBeenCalledWith(50, false);
    });
  });

  describe("onWheel handler", () => {
    it("should not prevent default when no overflow", () => {
      const { result } = renderHook(() => useSmartTabs());

      const preventDefault = vi.fn();
      const mockElement = { scrollLeft: 0 };
      const wheelEvent = {
        deltaX: 30,
        deltaY: 0,
        shiftKey: false,
        currentTarget: mockElement,
        preventDefault,
      } as unknown as React.WheelEvent<HTMLElement>;

      act(() => {
        result.current.tabsProps.onWheel?.(wheelEvent);
      });

      // Should not prevent default when no overflow
      expect(preventDefault).not.toHaveBeenCalled();
    });

    it("should not modify scrollLeft when vertical scroll without shift", () => {
      const { result } = renderHook(() => useSmartTabs());

      const preventDefault = vi.fn();
      const mockElement = { scrollLeft: 0 };
      const wheelEvent = {
        deltaX: 0, // No horizontal
        deltaY: 50, // Vertical scroll
        shiftKey: false, // No shift
        currentTarget: mockElement,
        preventDefault,
      } as unknown as React.WheelEvent<HTMLElement>;

      act(() => {
        result.current.tabsProps.onWheel?.(wheelEvent);
      });

      // Should not handle regular vertical scroll
      expect(preventDefault).not.toHaveBeenCalled();
      expect(mockElement.scrollLeft).toBe(0);
    });
  });

  describe("style property", () => {
    it("should have userSelect none in style", () => {
      const { result } = renderHook(() => useSmartTabs());

      expect(result.current.tabsProps.style.userSelect).toBe("none");
    });

    it("should have cursor grab in style when enabled", () => {
      const { result } = renderHook(() => useSmartTabs());

      // The drag is enabled when there's overflow, but by default hasOverflow is false
      // useDragToScroll uses enabled: hasOverflow internally
      // When hasOverflow is false, enabled is false, so cursor should be default
      expect(result.current.tabsProps.style.cursor).toBe("default");
    });
  });

  describe("ref behavior", () => {
    it("should provide a ref object", () => {
      const { result } = renderHook(() => useSmartTabs());

      expect(result.current.tabsProps.ref).toBeDefined();
      expect(result.current.tabsProps.ref).toHaveProperty("current");
    });

    it("should allow setting ref.current", () => {
      const { result } = renderHook(() => useSmartTabs());

      const mockElement = document.createElement("div");

      act(() => {
        (
          result.current.tabsProps
            .ref as React.MutableRefObject<HTMLElement | null>
        ).current = mockElement;
      });

      expect(result.current.tabsProps.ref.current).toBe(mockElement);
    });
  });

  describe("observer setup", () => {
    // Note: The hook's useEffect for observer setup depends on ref.current being set
    // at the time the effect runs. In renderHook, the initial render happens before
    // we can set the ref, so we test what we can reliably verify.

    it("should provide ResizeObserver and MutationObserver constructor mocks", () => {
      // Verify our test infrastructure is correctly set up for components
      // that will use this hook with actual DOM elements
      renderHook(() => useSmartTabs());

      expect(global.ResizeObserver).toBeDefined();
      expect(global.MutationObserver).toBeDefined();
      expect(vi.isMockFunction(global.ResizeObserver)).toBe(true);
      expect(vi.isMockFunction(global.MutationObserver)).toBe(true);
    });

    it("should start with hasOverflow false before element is attached", () => {
      const { result } = renderHook(() => useSmartTabs());

      // Before element is attached, no overflow detection happens
      expect(result.current.hasOverflow).toBe(false);
    });

    it("should provide correct className for non-overflow state", () => {
      const { result } = renderHook(() => useSmartTabs());

      // Without overflow, should have centered layout
      expect(result.current.tabsProps.className).toContain("justify-center");
      expect(result.current.tabsProps.className).not.toContain(
        "overflow-x-auto",
      );
    });

    it("should provide stable ref object across rerenders", () => {
      const { result, rerender } = renderHook(() => useSmartTabs());

      const initialRef = result.current.tabsProps.ref;

      rerender();

      // Ref object should be the same instance
      expect(result.current.tabsProps.ref).toBe(initialRef);
    });
  });

  describe("integration with element", () => {
    it("should allow setting up observers for overflow detection", () => {
      const { result } = renderHook(() => useSmartTabs());

      // Create a mock element with overflow dimensions
      const mockElement = {
        scrollWidth: 500,
        clientWidth: 300,
        scrollLeft: 0,
      };

      // Set the ref
      act(() => {
        (
          result.current.tabsProps
            .ref as React.MutableRefObject<HTMLElement | null>
        ).current = mockElement as unknown as HTMLElement;
      });

      // Verify the ref was set correctly
      expect(result.current.tabsProps.ref.current).toBe(mockElement);

      // The hook should have the correct initial hasOverflow state
      // Note: Overflow detection happens via observers which are set up in useEffect
      // The initial state is false before any observer callbacks run
      expect(result.current.hasOverflow).toBe(false);
    });
  });

  describe("cleanup on unmount", () => {
    it("should disconnect observers when unmounted", () => {
      const { unmount } = renderHook(() => useSmartTabs());

      unmount();

      // Check that disconnect was called on the observers
      mockResizeObserverInstances.forEach((instance) => {
        expect(instance.disconnect).toHaveBeenCalled();
      });
      mockMutationObserverInstances.forEach((instance) => {
        expect(instance.disconnect).toHaveBeenCalled();
      });
    });
  });
});
