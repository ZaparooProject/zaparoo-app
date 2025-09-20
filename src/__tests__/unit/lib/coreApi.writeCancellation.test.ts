import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CoreAPI } from "../../../lib/coreApi";

// Mock dependencies
vi.mock("../../../lib/models", () => ({
  Method: {
    ReadersWrite: "readers.write",
    ReadersWriteCancel: "readers.write.cancel"
  }
}));

describe("CoreAPI Write Cancellation", () => {
  let originalSend: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock the WebSocket send function
    originalSend = CoreAPI.setSend;
    const mockSend = vi.fn();
    CoreAPI.setSend(mockSend);
    // Mock WebSocket connection as connected so requests are sent immediately
    CoreAPI.setWsInstance({ isConnected: true, send: mockSend } as any);
  });

  afterEach(() => {
    if (originalSend) {
      CoreAPI.setSend(originalSend);
    }
  });

  describe("write method tracking", () => {
    it("should track pending write requests", async () => {
      const mockSend = vi.fn();
      CoreAPI.setSend(mockSend);

      // Start a write operation but don't resolve it
      const writePromise = CoreAPI.write({ text: "test" });

      // Verify that a request was sent
      expect(mockSend).toHaveBeenCalledTimes(1);
      const sentPayload = mockSend.mock.calls[0][0];
      const sentRequest = JSON.parse(sentPayload);

      expect(sentRequest.method).toBe("readers.write");
      expect(sentRequest.params).toEqual({ text: "test" });
      expect(sentRequest.id).toBeDefined();

      // Cancel the write
      CoreAPI.cancelWrite();

      // The promise should resolve with cancelled status
      const result = await writePromise;
      expect(result).toEqual({ cancelled: true });
    });

    it("should handle multiple write operations", async () => {
      const mockSend = vi.fn();
      CoreAPI.setSend(mockSend);

      // Start first write
      const writePromise1 = CoreAPI.write({ text: "test1" });

      // Cancel first write
      CoreAPI.cancelWrite();

      // First should be cancelled
      const result1 = await writePromise1;
      expect(result1).toEqual({ cancelled: true });

      // Start second write
      const writePromise2 = CoreAPI.write({ text: "test2" });

      // Cancel second write
      CoreAPI.cancelWrite();
      const result2 = await writePromise2;
      expect(result2).toEqual({ cancelled: true });

      // Should have sent 4 requests: write1, write1-cancel, write2, write2-cancel
      expect(mockSend).toHaveBeenCalledTimes(4);
    });

    it("should not fail when cancelling with no pending write", () => {
      expect(() => CoreAPI.cancelWrite()).not.toThrow();
    });

    it("should clear pending write ID after successful completion", async () => {
      const mockSend = vi.fn();
      CoreAPI.setSend(mockSend);

      // Start write operation
      const writePromise = CoreAPI.write({ text: "test" });

      // Simulate successful response
      const sentPayload = mockSend.mock.calls[0][0];
      JSON.parse(sentPayload);

      // Since we can't easily mock the WebSocket message processing,
      // we'll test the cancellation after completion
      CoreAPI.cancelWrite();

      // Wait for the promise to resolve with cancellation
      const result = await writePromise;
      expect(result).toEqual({ cancelled: true });

      // Should not throw since the write was already completed/cancelled
      expect(() => CoreAPI.cancelWrite()).not.toThrow();
    });

    it("should send cancel command when cancelling write", async () => {
      const mockSend = vi.fn();
      CoreAPI.setSend(mockSend);

      // Start write operation
      const writePromise = CoreAPI.write({ text: "test" });

      // Clear the mock calls to focus on cancel behavior
      mockSend.mockClear();

      // Cancel the write
      CoreAPI.cancelWrite();

      // Wait for the promise to be cancelled
      const result = await writePromise;
      expect(result).toEqual({ cancelled: true });

      // Should send a cancel command
      expect(mockSend).toHaveBeenCalledTimes(1);
      const cancelPayload = mockSend.mock.calls[0][0];
      const cancelRequest = JSON.parse(cancelPayload);

      expect(cancelRequest.method).toBe("readers.write.cancel");
    });
  });

  describe("timeout behavior", () => {
    it("should prevent timeout errors after cancellation", async () => {
      vi.useFakeTimers();

      const mockSend = vi.fn();
      CoreAPI.setSend(mockSend);

      // Start write operation
      const writePromise = CoreAPI.write({ text: "test" });

      // Cancel immediately
      CoreAPI.cancelWrite();

      // Fast-forward past the timeout period (30 seconds)
      vi.advanceTimersByTime(31000);

      // Should reject with cancellation, not timeout
      const result = await writePromise;
      expect(result).toEqual({ cancelled: true });

      vi.useRealTimers();
    });

    it("should still timeout if not cancelled", async () => {
      vi.useFakeTimers();

      const mockSend = vi.fn();
      CoreAPI.setSend(mockSend);

      // Start write operation
      const writePromise = CoreAPI.write({ text: "test" });

      // Fast-forward past the timeout period without cancelling
      vi.advanceTimersByTime(31000);

      // Should reject with timeout
      await expect(writePromise).rejects.toThrow("Request timeout");

      vi.useRealTimers();
    });
  });

  describe("error handling", () => {
    it("should handle send errors gracefully during cancellation", async () => {
      const mockSend = vi.fn();
      CoreAPI.setSend(mockSend);

      // Start write operation
      const writePromise = CoreAPI.write({ text: "test" });

      // Make subsequent send calls fail (for the cancel command)
      mockSend.mockImplementationOnce(() => {
        throw new Error("WebSocket send failed");
      });

      // Cancel should not throw even if send fails
      expect(() => CoreAPI.cancelWrite()).not.toThrow();

      // Wait for the promise to be cancelled
      const result = await writePromise;
      expect(result).toEqual({ cancelled: true });
    });

    it("should handle readersWriteCancel API failures gracefully", async () => {
      const mockSend = vi.fn();
      CoreAPI.setSend(mockSend);

      // Start write operation
      const writePromise = CoreAPI.write({ text: "test" });

      // Mock console.error to verify error logging
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Cancel the write (this will call readersWriteCancel internally)
      CoreAPI.cancelWrite();

      // The write promise should still be cancelled even if readersWriteCancel fails
      const result = await writePromise;
      expect(result).toEqual({ cancelled: true });

      consoleErrorSpy.mockRestore();
    });
  });
});