/**
 * Unit Tests: useSmartSwipe Hook
 *
 * Tests the smart swipe gesture detection hook including:
 * - Returns swipeable handlers
 * - Triggers onSwipeLeft/Right when swipe exceeds threshold and velocity
 * - Does not trigger when swipe below threshold or velocity too low
 * - Provides haptic feedback on successful swipe
 * - Enables mouse tracking only on mobile-sized screens
 * - Always enables mouse tracking when forceEnable is true
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";

// Mock useMediaQuery
let mockIsMobile = true;
vi.mock("@uidotdev/usehooks", () => ({
  useMediaQuery: vi.fn(() => mockIsMobile),
}));

// Mock useHaptics
const mockImpact = vi.fn();
vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({
    impact: mockImpact,
    notification: vi.fn(),
    vibrate: vi.fn(),
  }),
}));

// Mock react-swipeable
let lastSwipeableConfig:
  | Parameters<typeof import("react-swipeable").useSwipeable>[0]
  | null = null;
vi.mock("react-swipeable", () => ({
  useSwipeable: vi.fn((config) => {
    lastSwipeableConfig = config;
    return {
      ref: vi.fn(),
      onMouseDown: vi.fn(),
    };
  }),
}));

describe("useSmartSwipe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMobile = true;
    lastSwipeableConfig = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("basic functionality", () => {
    it("should return swipeable handlers", () => {
      // Act
      const { result } = renderHook(() => useSmartSwipe());

      // Assert
      expect(result.current).toBeDefined();
      expect(result.current).toHaveProperty("ref");
    });

    it("should call onSwipeLeft when swipe exceeds threshold and velocity", () => {
      // Arrange
      const onSwipeLeft = vi.fn();

      // Act
      renderHook(() => useSmartSwipe({ onSwipeLeft }));

      // Simulate a swipe that exceeds default thresholds
      const swipeData = {
        deltaX: -100, // Negative for left
        deltaY: 0,
        velocity: 0.5,
        dir: "Left" as const,
        event: {} as TouchEvent,
        initial: [0, 0] as [number, number],
        absX: 100,
        absY: 0,
        first: false,
        vxvy: [-0.5, 0] as [number, number],
      };

      // Call the handler
      lastSwipeableConfig?.onSwipedLeft?.(swipeData);

      // Assert
      expect(onSwipeLeft).toHaveBeenCalled();
      expect(mockImpact).toHaveBeenCalledWith("light");
    });

    it("should call onSwipeRight when swipe exceeds threshold and velocity", () => {
      // Arrange
      const onSwipeRight = vi.fn();

      // Act
      renderHook(() => useSmartSwipe({ onSwipeRight }));

      // Simulate a swipe that exceeds default thresholds
      const swipeData = {
        deltaX: 100, // Positive for right
        deltaY: 0,
        velocity: 0.5,
        dir: "Right" as const,
        event: {} as TouchEvent,
        initial: [0, 0] as [number, number],
        absX: 100,
        absY: 0,
        first: false,
        vxvy: [0.5, 0] as [number, number],
      };

      // Call the handler
      lastSwipeableConfig?.onSwipedRight?.(swipeData);

      // Assert
      expect(onSwipeRight).toHaveBeenCalled();
      expect(mockImpact).toHaveBeenCalledWith("light");
    });
  });

  describe("threshold validation", () => {
    it("should not trigger when swipe below threshold", () => {
      // Arrange
      const onSwipeLeft = vi.fn();

      // Act
      renderHook(() =>
        useSmartSwipe({
          onSwipeLeft,
          swipeThreshold: 50, // Default is 50
        }),
      );

      // Simulate a swipe that doesn't meet threshold
      const swipeData = {
        deltaX: -30, // Below 50 threshold
        deltaY: 0,
        velocity: 0.5,
        dir: "Left" as const,
        event: {} as TouchEvent,
        initial: [0, 0] as [number, number],
        absX: 30,
        absY: 0,
        first: false,
        vxvy: [-0.5, 0] as [number, number],
      };

      // Call the handler
      lastSwipeableConfig?.onSwipedLeft?.(swipeData);

      // Assert - should not have been called due to threshold check
      expect(onSwipeLeft).not.toHaveBeenCalled();
    });

    it("should not trigger when velocity too low", () => {
      // Arrange
      const onSwipeLeft = vi.fn();

      // Act
      renderHook(() =>
        useSmartSwipe({
          onSwipeLeft,
          velocityThreshold: 0.3, // Default is 0.3
        }),
      );

      // Simulate a swipe with low velocity
      const swipeData = {
        deltaX: -100, // Exceeds threshold
        deltaY: 0,
        velocity: 0.1, // Below 0.3 velocity threshold
        dir: "Left" as const,
        event: {} as TouchEvent,
        initial: [0, 0] as [number, number],
        absX: 100,
        absY: 0,
        first: false,
        vxvy: [-0.1, 0] as [number, number],
      };

      // Call the handler
      lastSwipeableConfig?.onSwipedLeft?.(swipeData);

      // Assert
      expect(onSwipeLeft).not.toHaveBeenCalled();
    });

    it("should respect custom threshold values", () => {
      // Arrange
      const onSwipeLeft = vi.fn();

      // Act
      renderHook(() =>
        useSmartSwipe({
          onSwipeLeft,
          swipeThreshold: 100, // Higher threshold
          velocityThreshold: 0.5, // Higher velocity requirement
        }),
      );

      // Simulate a swipe that meets higher thresholds
      const swipeData = {
        deltaX: -150,
        deltaY: 0,
        velocity: 0.7,
        dir: "Left" as const,
        event: {} as TouchEvent,
        initial: [0, 0] as [number, number],
        absX: 150,
        absY: 0,
        first: false,
        vxvy: [-0.7, 0] as [number, number],
      };

      // Call the handler
      lastSwipeableConfig?.onSwipedLeft?.(swipeData);

      // Assert
      expect(onSwipeLeft).toHaveBeenCalled();
    });
  });

  describe("haptic feedback", () => {
    it("should provide haptic feedback on successful swipe", () => {
      // Arrange
      const onSwipeRight = vi.fn();

      // Act
      renderHook(() => useSmartSwipe({ onSwipeRight }));

      // Simulate successful swipe
      const swipeData = {
        deltaX: 100,
        deltaY: 0,
        velocity: 0.5,
        dir: "Right" as const,
        event: {} as TouchEvent,
        initial: [0, 0] as [number, number],
        absX: 100,
        absY: 0,
        first: false,
        vxvy: [0.5, 0] as [number, number],
      };

      lastSwipeableConfig?.onSwipedRight?.(swipeData);

      // Assert
      expect(mockImpact).toHaveBeenCalledWith("light");
    });
  });

  describe("mouse tracking", () => {
    it("should enable mouse tracking only on mobile-sized screens", () => {
      // Arrange
      mockIsMobile = true;

      // Act
      renderHook(() => useSmartSwipe());

      // Assert - trackMouse should be true for mobile
      expect(lastSwipeableConfig?.trackMouse).toBe(true);
    });

    it("should disable mouse tracking on desktop screens", () => {
      // Arrange
      mockIsMobile = false;

      // Act
      renderHook(() => useSmartSwipe());

      // Assert - trackMouse should be false for desktop
      expect(lastSwipeableConfig?.trackMouse).toBe(false);
    });

    it("should always enable mouse tracking when forceEnable is true", () => {
      // Arrange
      mockIsMobile = false; // Desktop

      // Act
      renderHook(() => useSmartSwipe({ forceEnable: true }));

      // Assert - trackMouse should be true even on desktop when forced
      expect(lastSwipeableConfig?.trackMouse).toBe(true);
    });
  });

  describe("vertical swipes", () => {
    it("should call onSwipeUp when swipe up exceeds threshold", () => {
      // Arrange
      const onSwipeUp = vi.fn();

      // Act
      renderHook(() => useSmartSwipe({ onSwipeUp }));

      // Simulate swipe up
      const swipeData = {
        deltaX: 0,
        deltaY: -100, // Negative for up
        velocity: 0.5,
        dir: "Up" as const,
        event: {} as TouchEvent,
        initial: [0, 0] as [number, number],
        absX: 0,
        absY: 100,
        first: false,
        vxvy: [0, -0.5] as [number, number],
      };

      lastSwipeableConfig?.onSwipedUp?.(swipeData);

      // Assert
      expect(onSwipeUp).toHaveBeenCalled();
    });

    it("should call onSwipeDown when swipe down exceeds threshold", () => {
      // Arrange
      const onSwipeDown = vi.fn();

      // Act
      renderHook(() => useSmartSwipe({ onSwipeDown }));

      // Simulate swipe down
      const swipeData = {
        deltaX: 0,
        deltaY: 100, // Positive for down
        velocity: 0.5,
        dir: "Down" as const,
        event: {} as TouchEvent,
        initial: [0, 0] as [number, number],
        absX: 0,
        absY: 100,
        first: false,
        vxvy: [0, 0.5] as [number, number],
      };

      lastSwipeableConfig?.onSwipedDown?.(swipeData);

      // Assert
      expect(onSwipeDown).toHaveBeenCalled();
    });
  });

  describe("handler omission", () => {
    it("should not register handler when callback not provided", () => {
      // Act - no callbacks provided
      renderHook(() => useSmartSwipe({}));

      // Assert - handlers should be undefined
      expect(lastSwipeableConfig?.onSwipedLeft).toBeUndefined();
      expect(lastSwipeableConfig?.onSwipedRight).toBeUndefined();
      expect(lastSwipeableConfig?.onSwipedUp).toBeUndefined();
      expect(lastSwipeableConfig?.onSwipedDown).toBeUndefined();
    });
  });
});
