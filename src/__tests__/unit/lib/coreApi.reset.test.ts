import { describe, it, expect, vi, beforeEach } from "vitest";
import { CoreAPI } from "../../../lib/coreApi";

describe("CoreAPI reset method", () => {
  beforeEach(() => {
    // Clear any existing state
    vi.clearAllMocks();
  });

  it("should clear response pool and cancel pending requests", async () => {
    // Set up a mock WebSocket manager
    const mockSend = vi.fn();
    const mockWsManager = {
      send: mockSend,
      isConnected: true,
      destroy: vi.fn(),
    };

    CoreAPI.setWsInstance(mockWsManager as any);

    // Start a request that will be pending
    const pendingPromise = CoreAPI.version();

    // Reset the CoreAPI
    CoreAPI.reset();

    // The pending request should be rejected with cancellation error
    await expect(pendingPromise).rejects.toThrow(
      "Request cancelled: connection reset",
    );
  });

  it("should clear request queue", async () => {
    // Set up a mock WebSocket manager that's not connected
    const mockWsManager = {
      send: vi.fn(),
      isConnected: false,
      destroy: vi.fn(),
    };

    CoreAPI.setWsInstance(mockWsManager as any);

    // Create a queued request (will be queued because not connected)
    const queuedPromise = CoreAPI.version();

    // Reset the CoreAPI
    CoreAPI.reset();

    // The queued request should be rejected with cancellation error
    await expect(queuedPromise).rejects.toThrow(
      "Request cancelled: connection reset",
    );
  });

  it("should clear pending write ID", async () => {
    // Set up a mock WebSocket manager
    const mockSend = vi.fn();
    const mockWsManager = {
      send: mockSend,
      isConnected: true,
      destroy: vi.fn(),
    };

    CoreAPI.setWsInstance(mockWsManager as any);

    // Start a write request
    const writePromise = CoreAPI.write({ text: "test" });

    // Reset the CoreAPI
    CoreAPI.reset();

    // The write request should be rejected with cancellation error
    await expect(writePromise).rejects.toThrow(
      "Request cancelled: connection reset",
    );
  });

  it("should reset WebSocket manager and send function", () => {
    // Set up a mock WebSocket manager
    const mockWsManager = {
      send: vi.fn(),
      isConnected: true,
      destroy: vi.fn(),
    };

    CoreAPI.setWsInstance(mockWsManager as any);

    // Reset the CoreAPI
    CoreAPI.reset();

    // Attempting to call an API method should not use the old WebSocket
    expect(() => {
      CoreAPI.version();
    }).not.toThrow();
  });

  it("should handle reset when no requests are pending", () => {
    // Reset without any pending requests
    expect(() => {
      CoreAPI.reset();
    }).not.toThrow();
  });

  it("should clear multiple pending requests", async () => {
    // Set up a mock WebSocket manager
    const mockSend = vi.fn();
    const mockWsManager = {
      send: mockSend,
      isConnected: true,
      destroy: vi.fn(),
    };

    CoreAPI.setWsInstance(mockWsManager as any);

    // Start multiple requests
    const promise1 = CoreAPI.version();
    const promise2 = CoreAPI.settings();
    const promise3 = CoreAPI.media();

    // Reset the CoreAPI
    CoreAPI.reset();

    // All requests should be rejected with cancellation error
    await expect(promise1).rejects.toThrow(
      "Request cancelled: connection reset",
    );
    await expect(promise2).rejects.toThrow(
      "Request cancelled: connection reset",
    );
    await expect(promise3).rejects.toThrow(
      "Request cancelled: connection reset",
    );
  });

  it("should log reset message", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    CoreAPI.reset();

    expect(consoleSpy).toHaveBeenCalledWith("Resetting CoreAPI state");
    consoleSpy.mockRestore();
  });

  it("should handle timeout clearance properly", async () => {
    // Set up a mock WebSocket manager
    const mockSend = vi.fn();
    const mockWsManager = {
      send: mockSend,
      isConnected: true,
      destroy: vi.fn(),
    };

    CoreAPI.setWsInstance(mockWsManager as any);

    // Mock setTimeout and clearTimeout to track timeout handling
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;

    const clearTimeoutSpy = vi.fn();
    global.clearTimeout = clearTimeoutSpy;

    try {
      // Start a request that will have a timeout
      const pendingPromise = CoreAPI.version();

      // Reset the CoreAPI
      CoreAPI.reset();

      // clearTimeout should have been called for the request timeout
      expect(clearTimeoutSpy).toHaveBeenCalled();

      // The request should be rejected with cancellation error
      await expect(pendingPromise).rejects.toThrow(
        "Request cancelled: connection reset",
      );
    } finally {
      // Restore original functions
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    }
  });
});
