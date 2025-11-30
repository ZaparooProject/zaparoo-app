import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { TourInitializer } from "../../../components/TourInitializer";
import { usePreferencesStore } from "../../../lib/preferencesStore";
import { useStatusStore } from "../../../lib/store";

// Mock dependencies
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../../lib/tourService", () => ({
  createAppTour: vi.fn(() => ({
    start: vi.fn(),
    on: vi.fn((event, callback) => {
      // Store callbacks for testing
      if (!mockTourCallbacks[event]) {
        mockTourCallbacks[event] = [];
      }
      mockTourCallbacks[event].push(callback);
    }),
  })),
}));

let mockTourCallbacks: Record<string, Array<() => void>> = {};

describe("TourInitializer", () => {
  let mockSetTourCompleted: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTourCallbacks = {};
    vi.useFakeTimers();

    mockSetTourCompleted = vi.fn();

    // Reset stores
    usePreferencesStore.setState({
      tourCompleted: false,
      setTourCompleted: mockSetTourCompleted,
    });

    useStatusStore.setState({
      connected: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should not start tour when tourCompleted is true", async () => {
    usePreferencesStore.setState({ tourCompleted: true });

    const { createAppTour } = await import("../../../lib/tourService");

    renderHook(() => TourInitializer());

    // Fast-forward timers
    vi.advanceTimersByTime(1000);

    expect(createAppTour).not.toHaveBeenCalled();
  });

  it("should start tour when tourCompleted is false", async () => {
    const { createAppTour } = await import("../../../lib/tourService");

    renderHook(() => TourInitializer());

    // Fast-forward timers
    vi.runAllTimers();

    expect(createAppTour).toHaveBeenCalled();
  });

  it("should pass connected state to createAppTour", async () => {
    useStatusStore.setState({ connected: true });

    const { createAppTour } = await import("../../../lib/tourService");

    renderHook(() => TourInitializer());

    vi.runAllTimers();

    expect(createAppTour).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      true, // connected = true
    );
  });

  it("should mark tour as completed when tour completes", async () => {
    const { createAppTour } = await import("../../../lib/tourService");

    renderHook(() => TourInitializer());

    vi.runAllTimers();

    expect(createAppTour).toHaveBeenCalled();

    // Trigger the complete callback
    const completeCallback = mockTourCallbacks["complete"]?.[0];
    expect(completeCallback).toBeDefined();
    completeCallback?.();

    expect(mockSetTourCompleted).toHaveBeenCalledWith(true);
  });

  it("should mark tour as completed when tour is cancelled", async () => {
    const { createAppTour } = await import("../../../lib/tourService");

    renderHook(() => TourInitializer());

    vi.runAllTimers();

    expect(createAppTour).toHaveBeenCalled();

    // Trigger the cancel callback
    const cancelCallback = mockTourCallbacks["cancel"]?.[0];
    expect(cancelCallback).toBeDefined();
    cancelCallback?.();

    expect(mockSetTourCompleted).toHaveBeenCalledWith(true);
  });

  it("should cleanup timer on unmount", async () => {
    const { createAppTour } = await import("../../../lib/tourService");

    const { unmount } = renderHook(() => TourInitializer());

    unmount();

    vi.advanceTimersByTime(1000);

    // Tour should not have been created since component unmounted
    expect(createAppTour).not.toHaveBeenCalled();
  });

  it("should wait 1 second before starting tour", async () => {
    const { createAppTour } = await import("../../../lib/tourService");

    renderHook(() => TourInitializer());

    // Before 1 second
    vi.advanceTimersByTime(999);
    expect(createAppTour).not.toHaveBeenCalled();

    // After 1 second
    vi.advanceTimersByTime(1);

    expect(createAppTour).toHaveBeenCalled();
  });
});
