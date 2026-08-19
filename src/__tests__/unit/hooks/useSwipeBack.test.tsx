import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SwipeEventData } from "react-swipeable";
import {
  SWIPE_BACK_TRIGGER_DISTANCE,
  useSwipeBack,
} from "@/hooks/useSwipeBack";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";

let swipeOptions: Parameters<typeof useSmartSwipe>[0] | undefined;

vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: vi.fn((options) => {
    swipeOptions = options;
    return { ref: vi.fn() };
  }),
}));

function swipeData(overrides: Partial<SwipeEventData> = {}): SwipeEventData {
  return {
    absX: 0,
    absY: 0,
    deltaX: 0,
    deltaY: 0,
    dir: "Right",
    event: {} as TouchEvent,
    first: false,
    initial: [0, 0],
    velocity: 0,
    vxvy: [0, 0],
    ...overrides,
  };
}

describe("useSwipeBack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    swipeOptions = undefined;
  });

  it("tracks rightward progress up to the trigger distance", () => {
    const { result } = renderHook(() => useSwipeBack(vi.fn()));

    act(() => {
      swipeOptions?.onSwiping?.(
        swipeData({
          absX: SWIPE_BACK_TRIGGER_DISTANCE / 2,
          deltaX: SWIPE_BACK_TRIGGER_DISTANCE / 2,
        }),
      );
    });
    expect(result.current.progress).toBe(0.5);

    act(() => {
      swipeOptions?.onSwiping?.(
        swipeData({
          absX: SWIPE_BACK_TRIGGER_DISTANCE * 2,
          deltaX: SWIPE_BACK_TRIGGER_DISTANCE * 2,
        }),
      );
    });
    expect(result.current.progress).toBe(1);
  });

  it("latches cancellation after a meaningful reversal", () => {
    const onSwipeBack = vi.fn();
    const { result } = renderHook(() => useSwipeBack(onSwipeBack));

    act(() => {
      swipeOptions?.onSwipeStart?.(
        swipeData({ deltaX: 10, absX: 10, first: true }),
      );
      swipeOptions?.onSwiping?.(swipeData({ deltaX: 120, absX: 120 }));
      swipeOptions?.onSwiping?.(swipeData({ deltaX: 100, absX: 100 }));
      swipeOptions?.onSwiped?.(swipeData({ deltaX: 100, absX: 100 }));
      swipeOptions?.onSwipeRight?.();
    });

    expect(result.current.progress).toBe(0);
    expect(
      swipeOptions?.shouldHandleSwipe?.(swipeData({ deltaX: 100, absX: 100 })),
    ).toBe(false);
    expect(onSwipeBack).not.toHaveBeenCalled();
  });

  it("latches cancellation after cumulative gradual reversal", () => {
    const onSwipeBack = vi.fn();
    const { result } = renderHook(() => useSwipeBack(onSwipeBack));

    act(() => {
      swipeOptions?.onSwipeStart?.(
        swipeData({ deltaX: 10, absX: 10, first: true }),
      );
      swipeOptions?.onSwiping?.(swipeData({ deltaX: 120, absX: 120 }));
      swipeOptions?.onSwiping?.(swipeData({ deltaX: 114, absX: 114 }));
      swipeOptions?.onSwiping?.(swipeData({ deltaX: 108, absX: 108 }));
      swipeOptions?.onSwiping?.(swipeData({ deltaX: 102, absX: 102 }));
      swipeOptions?.onSwiped?.(swipeData({ deltaX: 102, absX: 102 }));
      swipeOptions?.onSwipeRight?.();
    });

    expect(result.current.progress).toBe(0);
    expect(onSwipeBack).not.toHaveBeenCalled();
  });

  it("latches cancellation after vertical movement", () => {
    const onSwipeBack = vi.fn();
    const { result } = renderHook(() => useSwipeBack(onSwipeBack));

    act(() => {
      swipeOptions?.onSwipeStart?.(
        swipeData({ deltaX: 10, absX: 10, first: true }),
      );
      swipeOptions?.onSwiping?.(swipeData({ deltaX: 60, absX: 60 }));
      swipeOptions?.onSwiping?.(
        swipeData({
          deltaX: 60,
          deltaY: 80,
          absX: 60,
          absY: 80,
          dir: "Down",
        }),
      );
      swipeOptions?.onSwiping?.(
        swipeData({
          deltaX: 100,
          deltaY: 80,
          absX: 100,
          absY: 80,
        }),
      );
      swipeOptions?.onSwiped?.(
        swipeData({
          deltaX: 100,
          deltaY: 80,
          absX: 100,
          absY: 80,
        }),
      );
      swipeOptions?.onSwipeRight?.();
    });

    expect(result.current.progress).toBe(0);
    expect(onSwipeBack).not.toHaveBeenCalled();
  });

  it("resets cancellation when the next gesture starts", () => {
    const onSwipeBack = vi.fn();
    renderHook(() => useSwipeBack(onSwipeBack));

    act(() => {
      swipeOptions?.onSwipeStart?.(
        swipeData({ deltaX: 10, absX: 10, first: true }),
      );
      swipeOptions?.onSwiping?.(
        swipeData({ deltaY: 40, absY: 40, dir: "Down" }),
      );
      swipeOptions?.onSwipeStart?.(
        swipeData({ deltaX: 10, absX: 10, first: true }),
      );
      swipeOptions?.onSwiping?.(swipeData({ deltaX: 100, absX: 100 }));
      swipeOptions?.onSwiped?.(swipeData({ deltaX: 100, absX: 100 }));
      swipeOptions?.onSwipeRight?.();
    });

    expect(onSwipeBack).toHaveBeenCalledOnce();
  });

  it("cancels visual progress when an incomplete swipe ends", () => {
    const onSwipeBack = vi.fn();
    const { result } = renderHook(() => useSwipeBack(onSwipeBack));

    const incompleteDistance = SWIPE_BACK_TRIGGER_DISTANCE - 1;

    act(() => {
      swipeOptions?.onSwiping?.(
        swipeData({
          absX: incompleteDistance,
          deltaX: incompleteDistance,
          velocity: 0.5,
        }),
      );
    });
    act(() => {
      swipeOptions?.onSwiped?.(
        swipeData({
          absX: incompleteDistance,
          deltaX: incompleteDistance,
          velocity: 0.5,
        }),
      );
    });

    expect(result.current.progress).toBe(0);
    expect(onSwipeBack).not.toHaveBeenCalled();
  });

  it("blocks completion after touch cancellation", () => {
    const onSwipeBack = vi.fn();
    const { result } = renderHook(() => useSwipeBack(onSwipeBack));

    act(() => {
      swipeOptions?.onSwipeStart?.(
        swipeData({ deltaX: 10, absX: 10, first: true }),
      );
      swipeOptions?.onSwiping?.(swipeData({ deltaX: 100, absX: 100 }));
      result.current.cancelSwipeBack();
      swipeOptions?.onSwipeRight?.();
    });

    expect(result.current.progress).toBe(0);
    expect(onSwipeBack).not.toHaveBeenCalled();
  });

  it("configures distance-based back navigation", () => {
    const onSwipeBack = vi.fn();
    renderHook(() => useSwipeBack(onSwipeBack));

    expect(swipeOptions).toMatchObject({
      preventScrollOnSwipe: false,
      swipeThreshold: SWIPE_BACK_TRIGGER_DISTANCE,
      velocityThreshold: 0,
    });
    expect(swipeOptions?.onSwipeStart).toBeTypeOf("function");
    expect(swipeOptions?.onSwipeRight).toBeTypeOf("function");
    expect(swipeOptions?.shouldHandleSwipe).toBeTypeOf("function");

    act(() => {
      swipeOptions?.onSwipeRight?.();
    });
    expect(onSwipeBack).toHaveBeenCalledOnce();
  });

  it("does not track progress when back navigation is unavailable", () => {
    const { result } = renderHook(() => useSwipeBack());

    expect(swipeOptions?.onSwipeRight).toBeUndefined();
    expect(swipeOptions?.onSwipeStart).toBeUndefined();
    expect(swipeOptions?.onSwiping).toBeUndefined();
    expect(swipeOptions?.onSwiped).toBeUndefined();
    expect(swipeOptions?.shouldHandleSwipe).toBeUndefined();
    expect(result.current.progress).toBe(0);
  });
});
