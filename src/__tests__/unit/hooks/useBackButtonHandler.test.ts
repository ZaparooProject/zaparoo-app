import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "../../../test-utils";
import { App } from "@capacitor/app";
import { useBackButtonHandler } from "@/hooks/useBackButtonHandler";

// Mock the logger
vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    log: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("useBackButtonHandler", () => {
  let backButtonCallback: (() => void) | null = null;
  let removeListenerMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    backButtonCallback = null;

    // Set up the App.addListener mock to capture the callback
    removeListenerMock = vi.fn().mockResolvedValue(undefined);
    (vi.mocked(App.addListener) as ReturnType<typeof vi.fn>).mockImplementation(
      (eventName: string, callback: () => void) => {
        if (eventName === "backButton") {
          backButtonCallback = callback;
        }
        return Promise.resolve({ remove: removeListenerMock });
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should register handler on mount when enabled", () => {
    const handler = vi.fn();

    renderHook(() => useBackButtonHandler("test-handler", handler, 50, true));

    expect(App.addListener).toHaveBeenCalledWith(
      "backButton",
      expect.any(Function),
    );
  });

  it("should not register handler when disabled", () => {
    const handler = vi.fn();

    renderHook(() => useBackButtonHandler("test-handler", handler, 50, false));

    // No listener should be added when disabled
    expect(App.addListener).not.toHaveBeenCalled();
  });

  it("should call handler when back button is pressed", () => {
    const handler = vi.fn();

    renderHook(() => useBackButtonHandler("test-handler", handler, 50, true));

    // Simulate back button press
    expect(backButtonCallback).not.toBeNull();
    backButtonCallback!();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should stop propagation when handler returns true", () => {
    const handler1 = vi.fn().mockReturnValue(true);
    const handler2 = vi.fn();

    // Register first handler with lower priority
    renderHook(() => useBackButtonHandler("handler-1", handler1, 100, true));
    // Register second handler with higher priority (but handler1 registered first)
    renderHook(() => useBackButtonHandler("handler-2", handler2, 50, true));

    // Simulate back button press
    backButtonCallback!();

    // handler1 has higher priority (100 > 50), so it runs first and returns true
    expect(handler1).toHaveBeenCalledTimes(1);
    // handler2 should not be called because handler1 returned true
    expect(handler2).not.toHaveBeenCalled();
  });

  it("should continue to next handler when handler returns undefined", () => {
    const handler1 = vi.fn().mockReturnValue(undefined);
    const handler2 = vi.fn();

    // Register handlers with different priorities
    renderHook(() => useBackButtonHandler("handler-1", handler1, 100, true));
    renderHook(() => useBackButtonHandler("handler-2", handler2, 50, true));

    // Simulate back button press
    backButtonCallback!();

    // Both handlers should be called since handler1 returns undefined
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it("should continue to next handler when handler returns false", () => {
    const handler1 = vi.fn().mockReturnValue(false);
    const handler2 = vi.fn();

    // Register handlers with different priorities
    renderHook(() => useBackButtonHandler("handler-1", handler1, 100, true));
    renderHook(() => useBackButtonHandler("handler-2", handler2, 50, true));

    // Simulate back button press
    backButtonCallback!();

    // Both handlers should be called since handler1 returns false (not === true)
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it("should sort handlers by priority (higher priority first)", () => {
    const callOrder: string[] = [];
    const handler1 = vi.fn(() => {
      callOrder.push("low");
    });
    const handler2 = vi.fn(() => {
      callOrder.push("high");
    });

    // Register low priority first, then high priority
    renderHook(() => useBackButtonHandler("low-priority", handler1, 10, true));
    renderHook(() =>
      useBackButtonHandler("high-priority", handler2, 100, true),
    );

    // Simulate back button press
    backButtonCallback!();

    // High priority handler should be called first
    expect(callOrder).toEqual(["high", "low"]);
  });

  it("should unregister handler on unmount", async () => {
    const handler = vi.fn();

    const { unmount } = renderHook(() =>
      useBackButtonHandler("test-handler", handler, 50, true),
    );

    // Unmount the hook
    unmount();

    // After unmounting, the handler should be removed
    // Simulate back button press - handler should not be called
    if (backButtonCallback) {
      backButtonCallback();
    }

    expect(handler).not.toHaveBeenCalled();
  });

  it("should remove listener when last handler is removed", async () => {
    const handler = vi.fn();

    const { unmount } = renderHook(() =>
      useBackButtonHandler("test-handler", handler, 50, true),
    );

    // The listener was set up
    expect(App.addListener).toHaveBeenCalled();

    // Unmount the only handler
    unmount();

    // Wait for async cleanup
    await vi.waitFor(() => {
      expect(removeListenerMock).toHaveBeenCalled();
    });
  });

  it("should use default priority of 50 when not specified", () => {
    const handler1 = vi.fn().mockReturnValue(true);
    const handler2 = vi.fn();

    // handler1 with explicit priority 60 (higher than default 50)
    renderHook(() => useBackButtonHandler("handler-1", handler1, 60, true));
    // handler2 with default priority (should be 50)
    renderHook(() => useBackButtonHandler("handler-2", handler2));

    // Simulate back button press
    backButtonCallback!();

    // handler1 (priority 60) should run first and stop propagation
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).not.toHaveBeenCalled();
  });

  it("should handle removeListener failure gracefully", async () => {
    // The BackButtonManager has internal error handling via .catch()
    // This test verifies that the hook doesn't throw when removeListener fails
    const removeError = new Error("Remove failed");

    // Make the remove function reject
    (vi.mocked(App.addListener) as ReturnType<typeof vi.fn>).mockImplementation(
      (eventName: string, callback: () => void) => {
        if (eventName === "backButton") {
          backButtonCallback = callback;
        }
        return Promise.resolve({
          remove: vi.fn().mockRejectedValue(removeError),
        });
      },
    );

    const handler = vi.fn();

    const { unmount } = renderHook(() =>
      useBackButtonHandler("test-handler", handler, 50, true),
    );

    // Unmount should not throw even if removeListener fails
    // The error is caught internally by BackButtonManager
    expect(() => unmount()).not.toThrow();
  });

  it("should re-register when enabled changes from false to true", async () => {
    const handler = vi.fn();

    const { rerender } = renderHook(
      ({ enabled }) =>
        useBackButtonHandler("test-handler", handler, 50, enabled),
      { initialProps: { enabled: false } },
    );

    // Initially disabled, no listener
    expect(App.addListener).not.toHaveBeenCalled();

    // Enable the handler
    rerender({ enabled: true });

    // Now the listener should be added
    expect(App.addListener).toHaveBeenCalledWith(
      "backButton",
      expect.any(Function),
    );
  });

  it("should unregister when enabled changes from true to false", () => {
    const handler = vi.fn();

    const { rerender } = renderHook(
      ({ enabled }) =>
        useBackButtonHandler("test-handler", handler, 50, enabled),
      { initialProps: { enabled: true } },
    );

    // Clear the addListener mock to track new calls
    vi.mocked(App.addListener).mockClear();

    // Disable the handler
    rerender({ enabled: false });

    // After disabling, back button press should not call handler
    if (backButtonCallback) {
      backButtonCallback();
    }

    expect(handler).not.toHaveBeenCalled();
  });
});
