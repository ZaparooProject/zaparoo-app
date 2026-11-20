/**
 * Unit Tests: useShakeDetection Hook
 *
 * Tests the shake detection functionality including:
 * - Platform detection (only enabled on native)
 * - Connection and enabled state requirements
 * - Shake works on any route, but is blocked while another task owns the screen
 * - Multi-shake detection within time window, and the charge it reports
 * - Cooldown period after trigger
 * - Haptic feedback through the haptics preference
 * - Zapscript queueing on successful trigger
 * - Native detector start/stop tied to the listener lifetime
 * - Listener cleanup on unmount
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { useShakeDetection } from "@/hooks/useShakeDetection";
import { useSlideModalManager } from "@/hooks/useSlideModalManager";
import { SlideModalProvider } from "@/components/SlideModalProvider";
import { useStatusStore, type RunQueueItem } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useShakeSheetStore } from "@/lib/shakeSheetStore";
import { sessionManager } from "@/lib/nfc";

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => "ios"),
  },
}));

// Mock the native shake bridge with a controllable listener
let mockShakeCallback: (() => void) | null = null;
const mockRemove = vi.fn();

vi.mock("@/lib/shakeDetector", () => ({
  ShakeDetector: {
    addListener: vi.fn((_event: string, callback: () => void) => {
      mockShakeCallback = callback;
      return Promise.resolve({ remove: mockRemove });
    }),
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
  },
}));

// Mock Haptics
vi.mock("@capacitor/haptics", () => ({
  Haptics: {
    impact: vi.fn(() => Promise.resolve()),
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

// Import after mocks are set up
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { ShakeDetector } from "@/lib/shakeDetector";

const PROPS = { shakeEnabled: true, connected: true };

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

async function triggerConfirmedShake() {
  await triggerShake();
  await act(async () => {
    vi.advanceTimersByTime(100);
  });
  await triggerShake();
}

// Helper to wait for async effect setup
async function flushAsyncSetup() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function withModalProvider({ children }: { children: ReactNode }) {
  return createElement(SlideModalProvider, null, children);
}

describe("useShakeDetection", () => {
  let setRunQueue: ReturnType<
    typeof vi.fn<(item: RunQueueItem | null) => void>
  >;

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
    useShakeSheetStore.getState().dismiss();
    sessionManager.setIsScanning(false);
    setRunQueue = vi.fn<(item: RunQueueItem | null) => void>();
    useStatusStore.setState({ setRunQueue });

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
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

      renderHook(() => useShakeDetection(PROPS));

      expect(ShakeDetector.addListener).not.toHaveBeenCalled();
    });

    it("should setup listener on native platform when enabled and connected", async () => {
      renderHook(() => useShakeDetection(PROPS));
      await flushAsyncSetup();

      expect(ShakeDetector.addListener).toHaveBeenCalledWith(
        "shake",
        expect.any(Function),
      );
    });
  });

  describe("native detector lifetime", () => {
    it("should start the detector after subscribing", async () => {
      renderHook(() => useShakeDetection(PROPS));
      await flushAsyncSetup();

      expect(ShakeDetector.start).toHaveBeenCalledTimes(1);
      expect(
        vi.mocked(ShakeDetector.addListener).mock.invocationCallOrder[0],
      ).toBeLessThan(
        vi.mocked(ShakeDetector.start).mock.invocationCallOrder[0]!,
      );
    });

    it("should not start the detector while shake is disabled", async () => {
      renderHook(() => useShakeDetection({ ...PROPS, shakeEnabled: false }));
      await flushAsyncSetup();

      expect(ShakeDetector.start).not.toHaveBeenCalled();
    });

    it("should stop the detector when the connection drops", async () => {
      const { rerender } = renderHook(
        ({ connected }) => useShakeDetection({ ...PROPS, connected }),
        { initialProps: { connected: true } },
      );
      await flushAsyncSetup();

      rerender({ connected: false });

      expect(ShakeDetector.stop).toHaveBeenCalledTimes(1);
    });

    it("should stop the detector on unmount", async () => {
      const { unmount } = renderHook(() => useShakeDetection(PROPS));
      await flushAsyncSetup();

      unmount();

      expect(ShakeDetector.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe("state requirements", () => {
    it("should not setup listener when shake is disabled", () => {
      renderHook(() => useShakeDetection({ ...PROPS, shakeEnabled: false }));

      expect(ShakeDetector.addListener).not.toHaveBeenCalled();
    });

    it("should not setup listener when disconnected", () => {
      renderHook(() => useShakeDetection({ ...PROPS, connected: false }));

      expect(ShakeDetector.addListener).not.toHaveBeenCalled();
    });
  });

  describe("blocking", () => {
    it("should trigger without any route requirement", async () => {
      renderHook(() => useShakeDetection(PROPS), {
        wrapper: withModalProvider,
      });
      await flushAsyncSetup();

      await triggerConfirmedShake();

      expect(setRunQueue).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["an input", () => document.createElement("input")],
      ["a textarea", () => document.createElement("textarea")],
      [
        "a contentEditable element",
        () => {
          const element = document.createElement("div");
          element.contentEditable = "true";
          element.tabIndex = 0;
          return element;
        },
      ],
    ])("should ignore shakes while %s is focused", async (_name, create) => {
      const field = create();
      document.body.appendChild(field);
      field.focus();
      renderHook(() => useShakeDetection(PROPS));
      await flushAsyncSetup();

      await triggerConfirmedShake();

      expect(setRunQueue).not.toHaveBeenCalled();
      expect(Haptics.impact).not.toHaveBeenCalled();
      expect(useShakeSheetStore.getState().phase).toBe("idle");
      field.remove();
    });

    it("should ignore shakes while a slide modal is open", async () => {
      const { result } = renderHook(
        () => {
          useShakeDetection(PROPS);
          return useSlideModalManager();
        },
        { wrapper: withModalProvider },
      );
      await flushAsyncSetup();

      act(() => {
        result.current.registerModal("settings-modal", () => {});
      });
      await triggerConfirmedShake();
      expect(setRunQueue).not.toHaveBeenCalled();

      // Closing the modal lets shake through again
      act(() => {
        result.current.unregisterModal("settings-modal");
      });
      await triggerConfirmedShake();
      expect(setRunQueue).toHaveBeenCalledTimes(1);
    });

    it("should ignore shakes while the Pro purchase sheet is open", async () => {
      useStatusStore.setState({ proPurchaseModalOpen: true });
      renderHook(() => useShakeDetection(PROPS));
      await flushAsyncSetup();

      await triggerConfirmedShake();

      expect(setRunQueue).not.toHaveBeenCalled();
    });

    it("should ignore shakes while a tag write is open", async () => {
      useStatusStore.setState({ writeOpen: true });
      renderHook(() => useShakeDetection(PROPS));
      await flushAsyncSetup();

      await triggerConfirmedShake();

      expect(setRunQueue).not.toHaveBeenCalled();
    });

    it("should ignore shakes while an NFC scan is running", async () => {
      sessionManager.setIsScanning(true);
      renderHook(() => useShakeDetection(PROPS));
      await flushAsyncSetup();

      await triggerConfirmedShake();

      expect(setRunQueue).not.toHaveBeenCalled();
    });
  });

  describe("multi-shake detection", () => {
    it("should require 2 shakes within 1.5s window to trigger", async () => {
      renderHook(() => useShakeDetection(PROPS));
      await flushAsyncSetup();

      // Single shake should not trigger
      await triggerShake();
      expect(setRunQueue).not.toHaveBeenCalled();

      // Second shake within window should trigger
      vi.advanceTimersByTime(500);
      await triggerShake();

      expect(setRunQueue).toHaveBeenCalledWith({
        value: "**launch.random",
        unsafe: true,
        source: "shake",
      });
    });

    it("should not trigger if shakes are outside the 1.5s window", async () => {
      renderHook(() => useShakeDetection(PROPS));
      await flushAsyncSetup();

      await triggerShake();
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      await triggerShake();

      expect(setRunQueue).not.toHaveBeenCalled();
    });
  });

  describe("shake sheet charge", () => {
    it("should charge halfway on the first shake of a random command", async () => {
      renderHook(() => useShakeDetection(PROPS));
      await flushAsyncSetup();

      await triggerShake();

      expect(useShakeSheetStore.getState()).toMatchObject({
        phase: "charging",
        progress: 0.5,
        random: true,
      });
    });

    it("should drain the charge when the window passes", async () => {
      renderHook(() => useShakeDetection(PROPS));
      await flushAsyncSetup();

      await triggerShake();
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });

      expect(useShakeSheetStore.getState().phase).toBe("idle");
    });

    it("should move to launching when the shake is confirmed", async () => {
      usePreferencesStore.setState({ shakeZapscript: "**launch.search:mario" });
      renderHook(() => useShakeDetection(PROPS));
      await flushAsyncSetup();

      await triggerConfirmedShake();

      expect(useShakeSheetStore.getState()).toMatchObject({
        phase: "launching",
        progress: 1,
        random: false,
      });
    });
  });

  describe("cooldown period", () => {
    it("should ignore shakes during 2s cooldown after trigger", async () => {
      renderHook(() => useShakeDetection(PROPS));
      await flushAsyncSetup();

      await triggerConfirmedShake();
      expect(setRunQueue).toHaveBeenCalledTimes(1);

      // Try to trigger again within cooldown
      vi.advanceTimersByTime(1000);
      await triggerConfirmedShake();

      expect(setRunQueue).toHaveBeenCalledTimes(1);
    });

    it("should allow new trigger after cooldown expires", async () => {
      renderHook(() => useShakeDetection(PROPS));
      await flushAsyncSetup();

      await triggerConfirmedShake();
      expect(setRunQueue).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2500);
      await triggerConfirmedShake();

      expect(setRunQueue).toHaveBeenCalledTimes(2);
    });
  });

  describe("haptic feedback", () => {
    it("should provide light haptic for intermediate shakes", async () => {
      renderHook(() => useShakeDetection(PROPS));
      await flushAsyncSetup();

      await triggerShake();

      expect(Haptics.impact).toHaveBeenCalledWith({ style: ImpactStyle.Light });
    });

    it("should provide heavy haptic when shake triggers", async () => {
      renderHook(() => useShakeDetection(PROPS));
      await flushAsyncSetup();

      await triggerConfirmedShake();

      expect(Haptics.impact).toHaveBeenCalledWith({ style: ImpactStyle.Heavy });
    });

    it("should follow the haptics preference when it changes", async () => {
      renderHook(() => useShakeDetection(PROPS));
      await flushAsyncSetup();

      act(() => {
        usePreferencesStore.setState({ hapticsEnabled: false });
      });
      await triggerConfirmedShake();

      expect(Haptics.impact).not.toHaveBeenCalled();
      expect(setRunQueue).toHaveBeenCalledTimes(1);
    });
  });

  describe("zapscript configuration", () => {
    it("should not trigger when no zapscript configured", async () => {
      usePreferencesStore.setState({ shakeZapscript: "" });
      renderHook(() => useShakeDetection(PROPS));
      await flushAsyncSetup();

      await triggerConfirmedShake();

      expect(setRunQueue).not.toHaveBeenCalled();
      expect(useShakeSheetStore.getState().phase).toBe("idle");
    });
  });

  describe("cleanup", () => {
    it("should cleanup listener on unmount", async () => {
      const { unmount } = renderHook(() => useShakeDetection(PROPS));
      await flushAsyncSetup();

      unmount();

      expect(mockRemove).toHaveBeenCalled();
    });

    it("should cleanup listener when shakeEnabled changes to false", async () => {
      const { rerender } = renderHook(
        ({ shakeEnabled }) => useShakeDetection({ ...PROPS, shakeEnabled }),
        { initialProps: { shakeEnabled: true } },
      );
      await flushAsyncSetup();

      rerender({ shakeEnabled: false });

      expect(mockRemove).toHaveBeenCalled();
    });
  });
});
