import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { Capacitor } from "@capacitor/core";
import { ScreenReader } from "@capacitor/screen-reader";
import { useScreenReaderEnabled } from "../../../hooks/useScreenReaderEnabled";

describe("useScreenReaderEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return false on web platform", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    const { result } = renderHook(() => useScreenReaderEnabled());

    expect(result.current).toBe(false);
    expect(ScreenReader.isEnabled).not.toHaveBeenCalled();
  });

  it("should check initial screen reader state on native platform", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(ScreenReader.isEnabled).mockResolvedValue({ value: true });

    const { result } = renderHook(() => useScreenReaderEnabled());

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
    expect(ScreenReader.isEnabled).toHaveBeenCalled();
  });

  it("should return false when screen reader is not enabled", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(ScreenReader.isEnabled).mockResolvedValue({ value: false });

    const { result } = renderHook(() => useScreenReaderEnabled());

    // Initial state is false, wait for async check to complete
    await waitFor(() => {
      expect(ScreenReader.isEnabled).toHaveBeenCalled();
    });
    expect(result.current).toBe(false);
  });

  it("should subscribe to state changes on native platform", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(ScreenReader.isEnabled).mockResolvedValue({ value: false });

    renderHook(() => useScreenReaderEnabled());

    await waitFor(() => {
      expect(ScreenReader.addListener).toHaveBeenCalledWith(
        "stateChange",
        expect.any(Function),
      );
    });
  });

  it("should update when screen reader state changes", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(ScreenReader.isEnabled).mockResolvedValue({ value: false });

    let stateChangeCallback: ((state: { value: boolean }) => void) | null =
      null;
    vi.mocked(ScreenReader.addListener).mockImplementation(
      (event, callback) => {
        if (event === "stateChange") {
          stateChangeCallback = callback;
        }
        return Promise.resolve({ remove: vi.fn() });
      },
    );

    const { result } = renderHook(() => useScreenReaderEnabled());

    // Initially false
    await waitFor(() => {
      expect(ScreenReader.addListener).toHaveBeenCalled();
    });
    expect(result.current).toBe(false);

    // Simulate screen reader being enabled
    act(() => {
      stateChangeCallback?.({ value: true });
    });

    expect(result.current).toBe(true);
  });

  it("should remove listener on unmount", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(ScreenReader.isEnabled).mockResolvedValue({ value: false });

    const removeFn = vi.fn();
    vi.mocked(ScreenReader.addListener).mockResolvedValue({ remove: removeFn });

    const { unmount } = renderHook(() => useScreenReaderEnabled());

    // Wait for listener to be added
    await waitFor(() => {
      expect(ScreenReader.addListener).toHaveBeenCalled();
    });

    unmount();

    await waitFor(() => {
      expect(removeFn).toHaveBeenCalled();
    });
  });
});
