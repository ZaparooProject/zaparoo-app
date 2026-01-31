/**
 * Unit Tests: useShakeDetection Hook
 *
 * Tests the shake detection functionality including:
 * - Platform detection (only enabled on native)
 * - Connection and enabled state requirements
 * - Multi-shake detection within time window
 * - Cooldown period after trigger
 * - Haptic feedback for intermediate and confirmed shakes
 * - Zapscript queueing on successful trigger
 * - Listener cleanup on unmount
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useShakeDetection } from "@/hooks/useShakeDetection";
import { useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
}));

// Mock CapacitorShake with controllable listener
let mockShakeCallback: (() => void) | null = null;
const mockRemove = vi.fn();

vi.mock("@capgo/capacitor-shake", () => ({
  CapacitorShake: {
    addListener: vi.fn((_event: string, callback: () => void) => {
      mockShakeCallback = callback;
      return Promise.resolve({ remove: mockRemove });
    }),
  },
}));

// Mock Haptics
vi.mock("@capacitor/haptics", () => ({
  Haptics: {
    impact: vi.fn(() => Promise.resolve()),
  },
  ImpactStyle: {
    Light: "LIGHT",
    Heavy: "HEAVY",
  },
}));

// Import after mocks are set up
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { CapacitorShake } from "@capgo/capacitor-shake";

// Helper to trigger a shake event and flush microtasks
async function triggerShake() {
  if (mockShakeCallback) {
    await act(async () => {
      mockShakeCallback!();
      // Allow promise microtasks to resolve
      await Promise.resolve();
    });
  }
}

// Helper to wait for async effect setup
async function flushAsyncSetup() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useShakeDetection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset stores
    useStatusStore.setState(useStatusStore.getInitialState());
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
      hapticsEnabled: true,
      shakeZapscript: "**launch.random",
    });

    // Clear mock state
    mockShakeCallback = null;
    vi.clearAllMocks();

    // Default to native platform
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("platform detection", () => {
    it("should not setup listener on web platform", () => {
      // Arrange
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

      // Act
      renderHook(() =>
        useShakeDetection({
          shakeEnabled: true,
          connected: true,
          pathname: "/",
        }),
      );

      // Assert
      expect(CapacitorShake.addListener).not.toHaveBeenCalled();
    });

    it("should setup listener on native platform when enabled and connected", async () => {
      // Arrange
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

      // Act
      renderHook(() =>
        useShakeDetection({
          shakeEnabled: true,
          connected: true,
          pathname: "/",
        }),
      );
      await flushAsyncSetup();

      // Assert
      expect(CapacitorShake.addListener).toHaveBeenCalledWith(
        "shake",
        expect.any(Function),
      );
    });
  });

  describe("state requirements", () => {
    it("should not setup listener when shake is disabled", () => {
      // Arrange & Act
      renderHook(() =>
        useShakeDetection({
          shakeEnabled: false,
          connected: true,
          pathname: "/",
        }),
      );

      // Assert
      expect(CapacitorShake.addListener).not.toHaveBeenCalled();
    });

    it("should not setup listener when disconnected", () => {
      // Arrange & Act
      renderHook(() =>
        useShakeDetection({
          shakeEnabled: true,
          connected: false,
          pathname: "/",
        }),
      );

      // Assert
      expect(CapacitorShake.addListener).not.toHaveBeenCalled();
    });
  });

  describe("pathname requirement", () => {
    it("should ignore shake when not on home page", async () => {
      // Arrange
      const setRunQueue = vi.fn();
      useStatusStore.setState({ setRunQueue });

      renderHook(() =>
        useShakeDetection({
          shakeEnabled: true,
          connected: true,
          pathname: "/settings",
        }),
      );
      await flushAsyncSetup();

      // Act - trigger 2 shakes (normally enough to trigger)
      await triggerShake();
      vi.advanceTimersByTime(100);
      await triggerShake();

      // Assert - should not queue because not on home page
      expect(setRunQueue).not.toHaveBeenCalled();
    });
  });

  describe("multi-shake detection", () => {
    it("should require 2 shakes within 1.5s window to trigger", async () => {
      // Arrange
      const setRunQueue = vi.fn();
      useStatusStore.setState({ setRunQueue });

      renderHook(() =>
        useShakeDetection({
          shakeEnabled: true,
          connected: true,
          pathname: "/",
        }),
      );
      await flushAsyncSetup();

      // Act - single shake should not trigger
      await triggerShake();
      expect(setRunQueue).not.toHaveBeenCalled();

      // Act - second shake within window should trigger
      vi.advanceTimersByTime(500);
      await triggerShake();

      // Assert
      expect(setRunQueue).toHaveBeenCalledWith({
        value: "**launch.random",
        unsafe: true,
      });
    });

    it("should not trigger if shakes are outside the 1.5s window", async () => {
      // Arrange
      const setRunQueue = vi.fn();
      useStatusStore.setState({ setRunQueue });

      renderHook(() =>
        useShakeDetection({
          shakeEnabled: true,
          connected: true,
          pathname: "/",
        }),
      );
      await flushAsyncSetup();

      // Act - first shake
      await triggerShake();

      // Wait beyond the shake window
      vi.advanceTimersByTime(2000);

      // Second shake after window expired
      await triggerShake();

      // Assert - should not trigger because first shake expired
      expect(setRunQueue).not.toHaveBeenCalled();
    });
  });

  describe("cooldown period", () => {
    it("should ignore shakes during 2s cooldown after trigger", async () => {
      // Arrange
      const setRunQueue = vi.fn();
      useStatusStore.setState({ setRunQueue });

      renderHook(() =>
        useShakeDetection({
          shakeEnabled: true,
          connected: true,
          pathname: "/",
        }),
      );
      await flushAsyncSetup();

      // Act - trigger first time
      await triggerShake();
      vi.advanceTimersByTime(100);
      await triggerShake();

      expect(setRunQueue).toHaveBeenCalledTimes(1);

      // Act - try to trigger again within cooldown
      vi.advanceTimersByTime(1000); // 1s into cooldown
      await triggerShake();
      vi.advanceTimersByTime(100);
      await triggerShake();

      // Assert - should still only have been called once
      expect(setRunQueue).toHaveBeenCalledTimes(1);
    });

    it("should allow new trigger after cooldown expires", async () => {
      // Arrange
      const setRunQueue = vi.fn();
      useStatusStore.setState({ setRunQueue });

      renderHook(() =>
        useShakeDetection({
          shakeEnabled: true,
          connected: true,
          pathname: "/",
        }),
      );
      await flushAsyncSetup();

      // First trigger
      await triggerShake();
      vi.advanceTimersByTime(100);
      await triggerShake();

      expect(setRunQueue).toHaveBeenCalledTimes(1);

      // Wait for cooldown to expire
      vi.advanceTimersByTime(2500);

      // Trigger again
      await triggerShake();
      vi.advanceTimersByTime(100);
      await triggerShake();

      // Assert - should have been called twice now
      expect(setRunQueue).toHaveBeenCalledTimes(2);
    });
  });

  describe("haptic feedback", () => {
    it("should provide light haptic for intermediate shakes", async () => {
      // Arrange
      renderHook(() =>
        useShakeDetection({
          shakeEnabled: true,
          connected: true,
          pathname: "/",
        }),
      );
      await flushAsyncSetup();

      // Act - single shake (intermediate)
      await triggerShake();

      // Assert - light haptic feedback
      expect(Haptics.impact).toHaveBeenCalledWith({ style: ImpactStyle.Light });
    });

    it("should provide heavy haptic when shake triggers", async () => {
      // Arrange
      renderHook(() =>
        useShakeDetection({
          shakeEnabled: true,
          connected: true,
          pathname: "/",
        }),
      );
      await flushAsyncSetup();

      // Act - two shakes to trigger
      await triggerShake();
      vi.advanceTimersByTime(100);
      await triggerShake();

      // Assert - heavy haptic feedback on trigger
      expect(Haptics.impact).toHaveBeenCalledWith({ style: ImpactStyle.Heavy });
    });

    it("should not provide haptic when haptics disabled", async () => {
      // Arrange
      usePreferencesStore.setState({ hapticsEnabled: false });

      renderHook(() =>
        useShakeDetection({
          shakeEnabled: true,
          connected: true,
          pathname: "/",
        }),
      );
      await flushAsyncSetup();

      // Act - two shakes to trigger
      await triggerShake();
      vi.advanceTimersByTime(100);
      await triggerShake();

      // Assert - no haptic feedback
      expect(Haptics.impact).not.toHaveBeenCalled();
    });
  });

  describe("zapscript configuration", () => {
    it("should not trigger when no zapscript configured", async () => {
      // Arrange
      const setRunQueue = vi.fn();
      useStatusStore.setState({ setRunQueue });
      usePreferencesStore.setState({ shakeZapscript: "" });

      renderHook(() =>
        useShakeDetection({
          shakeEnabled: true,
          connected: true,
          pathname: "/",
        }),
      );
      await flushAsyncSetup();

      // Act - trigger two shakes
      await triggerShake();
      vi.advanceTimersByTime(100);
      await triggerShake();

      // Assert - should not queue because no zapscript
      expect(setRunQueue).not.toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("should cleanup listener on unmount", async () => {
      // Arrange
      const { unmount } = renderHook(() =>
        useShakeDetection({
          shakeEnabled: true,
          connected: true,
          pathname: "/",
        }),
      );
      await flushAsyncSetup();

      // Act
      unmount();

      // Assert
      expect(mockRemove).toHaveBeenCalled();
    });

    it("should cleanup listener when shakeEnabled changes to false", async () => {
      // Arrange
      const { rerender } = renderHook(
        ({ shakeEnabled }) =>
          useShakeDetection({
            shakeEnabled,
            connected: true,
            pathname: "/",
          }),
        { initialProps: { shakeEnabled: true } },
      );
      await flushAsyncSetup();

      // Act
      rerender({ shakeEnabled: false });

      // Assert
      expect(mockRemove).toHaveBeenCalled();
    });
  });
});
