/**
 * Unit Tests: useHaptics Hook
 *
 * Tests for haptic feedback functionality including:
 * - Platform detection (native vs web)
 * - User preference respect
 * - Impact feedback styles
 * - Notification feedback types
 * - Vibration with custom duration
 * - Error handling when haptics fail
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHaptics } from "@/hooks/useHaptics";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

// Mock Capacitor and Haptics
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}));

vi.mock("@capacitor/haptics", () => ({
  Haptics: {
    impact: vi.fn(),
    notification: vi.fn(),
    vibrate: vi.fn(),
  },
  ImpactStyle: {
    Light: "LIGHT",
    Medium: "MEDIUM",
    Heavy: "HEAVY",
  },
  NotificationType: {
    Success: "SUCCESS",
    Warning: "WARNING",
    Error: "ERROR",
  },
}));

describe("useHaptics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset preferences store to enabled haptics
    usePreferencesStore.setState({
      ...usePreferencesStore.getState(),
      hapticsEnabled: true,
      _hasHydrated: true,
    });
    // Default to native platform
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("platform detection", () => {
    it("should not call Haptics on web platform", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

      const { result } = renderHook(() => useHaptics());

      await act(async () => {
        await result.current.impact("light");
        await result.current.notification("success");
        await result.current.vibrate(300);
      });

      expect(Haptics.impact).not.toHaveBeenCalled();
      expect(Haptics.notification).not.toHaveBeenCalled();
      expect(Haptics.vibrate).not.toHaveBeenCalled();
    });

    it("should call Haptics on native platform", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

      const { result } = renderHook(() => useHaptics());

      await act(async () => {
        await result.current.impact("light");
      });

      expect(Haptics.impact).toHaveBeenCalledTimes(1);
    });
  });

  describe("preference respect", () => {
    it("should not trigger haptics when disabled in preferences", async () => {
      usePreferencesStore.setState({
        ...usePreferencesStore.getState(),
        hapticsEnabled: false,
      });

      const { result } = renderHook(() => useHaptics());

      await act(async () => {
        await result.current.impact("light");
        await result.current.notification("success");
        await result.current.vibrate(300);
      });

      expect(Haptics.impact).not.toHaveBeenCalled();
      expect(Haptics.notification).not.toHaveBeenCalled();
      expect(Haptics.vibrate).not.toHaveBeenCalled();
    });

    it("should report isEnabled state correctly", () => {
      usePreferencesStore.setState({
        ...usePreferencesStore.getState(),
        hapticsEnabled: true,
      });

      const { result, rerender } = renderHook(() => useHaptics());
      expect(result.current.isEnabled).toBe(true);

      act(() => {
        usePreferencesStore.setState({
          ...usePreferencesStore.getState(),
          hapticsEnabled: false,
        });
      });

      rerender();
      expect(result.current.isEnabled).toBe(false);
    });
  });

  describe("impact feedback", () => {
    it("should use light impact style by default", async () => {
      const { result } = renderHook(() => useHaptics());

      await act(async () => {
        await result.current.impact();
      });

      expect(Haptics.impact).toHaveBeenCalledWith({ style: ImpactStyle.Light });
    });

    it("should use medium impact style when specified", async () => {
      const { result } = renderHook(() => useHaptics());

      await act(async () => {
        await result.current.impact("medium");
      });

      expect(Haptics.impact).toHaveBeenCalledWith({
        style: ImpactStyle.Medium,
      });
    });

    it("should use heavy impact style when specified", async () => {
      const { result } = renderHook(() => useHaptics());

      await act(async () => {
        await result.current.impact("heavy");
      });

      expect(Haptics.impact).toHaveBeenCalledWith({ style: ImpactStyle.Heavy });
    });
  });

  describe("notification feedback", () => {
    it("should use success notification type by default", async () => {
      const { result } = renderHook(() => useHaptics());

      await act(async () => {
        await result.current.notification();
      });

      expect(Haptics.notification).toHaveBeenCalledWith({
        type: NotificationType.Success,
      });
    });

    it("should use warning notification type when specified", async () => {
      const { result } = renderHook(() => useHaptics());

      await act(async () => {
        await result.current.notification("warning");
      });

      expect(Haptics.notification).toHaveBeenCalledWith({
        type: NotificationType.Warning,
      });
    });

    it("should use error notification type when specified", async () => {
      const { result } = renderHook(() => useHaptics());

      await act(async () => {
        await result.current.notification("error");
      });

      expect(Haptics.notification).toHaveBeenCalledWith({
        type: NotificationType.Error,
      });
    });
  });

  describe("vibrate", () => {
    it("should use 300ms duration by default", async () => {
      const { result } = renderHook(() => useHaptics());

      await act(async () => {
        await result.current.vibrate();
      });

      expect(Haptics.vibrate).toHaveBeenCalledWith({ duration: 300 });
    });

    it("should use custom duration when specified", async () => {
      const { result } = renderHook(() => useHaptics());

      await act(async () => {
        await result.current.vibrate(500);
      });

      expect(Haptics.vibrate).toHaveBeenCalledWith({ duration: 500 });
    });
  });

  describe("error handling", () => {
    it("should handle impact error gracefully", async () => {
      vi.mocked(Haptics.impact).mockRejectedValue(new Error("Haptics failed"));

      const { result } = renderHook(() => useHaptics());

      // Should not throw
      await expect(
        act(async () => {
          await result.current.impact("light");
        }),
      ).resolves.not.toThrow();
    });

    it("should handle notification error gracefully", async () => {
      vi.mocked(Haptics.notification).mockRejectedValue(
        new Error("Haptics failed"),
      );

      const { result } = renderHook(() => useHaptics());

      // Should not throw
      await expect(
        act(async () => {
          await result.current.notification("success");
        }),
      ).resolves.not.toThrow();
    });

    it("should handle vibrate error gracefully", async () => {
      vi.mocked(Haptics.vibrate).mockRejectedValue(new Error("Haptics failed"));

      const { result } = renderHook(() => useHaptics());

      // Should not throw
      await expect(
        act(async () => {
          await result.current.vibrate(300);
        }),
      ).resolves.not.toThrow();
    });
  });
});
