import { describe, it, expect, vi, beforeEach } from "vitest";
import { CoreAPI } from "../../../lib/coreApi";

const mockSend = vi.fn();

describe("CoreAPI AbortSignal Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CoreAPI.setSend(mockSend);
  });

  describe("call method with AbortSignal", () => {
    it("should return cancelled result when signal is already aborted", async () => {
      const abortedSignal = { aborted: true };

      const result = await CoreAPI.call("test.method", {}, abortedSignal as AbortSignal);

      expect(result).toEqual({ cancelled: true });
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("should handle abort signal during request", async () => {
      const abortController = new AbortController();

      // Start the request
      const promise = CoreAPI.call("test.method", {}, abortController.signal);

      // Abort the signal before response
      abortController.abort();

      const result = await promise;
      expect(result).toEqual({ cancelled: true });
    });

    it("should clear timeout when request is aborted", async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      const abortController = new AbortController();

      // Start the request
      const promise = CoreAPI.call("test.method", {}, abortController.signal);

      // Abort immediately
      abortController.abort();

      await promise;

      // Timeout should be cleared when aborted
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it("should properly set up abort event listener", async () => {
      const abortController = new AbortController();
      const addEventListenerSpy = vi.spyOn(abortController.signal, 'addEventListener');

      // Start a request with abort signal
      const promise = CoreAPI.call("test.method", {}, abortController.signal);

      // Verify addEventListener was called
      expect(addEventListenerSpy).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });

      // Abort to complete the test
      abortController.abort();

      const result = await promise;
      expect(result).toEqual({ cancelled: true });

      addEventListenerSpy.mockRestore();
    });
  });

  describe("callWithTracking method with AbortSignal", () => {
    it("should return cancelled result when signal is already aborted", async () => {
      const abortedSignal = { aborted: true };

      const { promise } = CoreAPI.callWithTracking("test.method", {}, abortedSignal as AbortSignal);
      const result = await promise;

      expect(result).toEqual({ cancelled: true });
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("should handle abort signal during tracked request", async () => {
      const abortController = new AbortController();

      // Start the tracked request
      const { id, promise } = CoreAPI.callWithTracking("test.method", {}, abortController.signal);

      // Abort the signal before response
      abortController.abort();

      const result = await promise;
      expect(result).toEqual({ cancelled: true });
      expect(id).toBeDefined();
    });
  });

  describe("timeout handling with AbortSignal", () => {
    it("should clear timeout when abort signal is triggered", async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      const abortController = new AbortController();

      // Start the request
      const promise = CoreAPI.call("test.method", {}, abortController.signal);

      // Abort the request
      abortController.abort();

      const result = await promise;

      expect(result).toEqual({ cancelled: true });
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it("should handle race condition between timeout and abort", async () => {
      vi.useFakeTimers();

      const abortController = new AbortController();

      // Start the request
      const promise = CoreAPI.call("test.method", {}, abortController.signal);

      // Abort just before timeout (but after some time)
      setTimeout(() => {
        abortController.abort();
      }, 10);

      // Advance time to trigger the abort
      vi.advanceTimersByTime(50);

      const result = await promise;
      expect(result).toEqual({ cancelled: true });

      vi.useRealTimers();
    });
  });

  describe("write method with AbortSignal", () => {
    it("should handle write cancellation properly", async () => {
      const abortController = new AbortController();

      // Start write operation
      const writePromise = CoreAPI.write({ text: "test" }, abortController.signal);

      // Cancel the write
      abortController.abort();

      const result = await writePromise;
      expect(result).toEqual({ cancelled: true });
    });

    it("should handle write with pre-aborted signal", async () => {
      const abortedSignal = { aborted: true };

      const result = await CoreAPI.write({ text: "test" }, abortedSignal as AbortSignal);
      expect(result).toEqual({ cancelled: true });
    });

    it("should clear pendingWriteId when write is cancelled", async () => {
      const abortController = new AbortController();

      // Start write operation
      const writePromise = CoreAPI.write({ text: "test" }, abortController.signal);

      // Verify pendingWriteId is set
      const originalPendingId = (CoreAPI as any).pendingWriteId;
      expect(originalPendingId).toBeDefined();

      // Cancel the write
      abortController.abort();

      const result = await writePromise;
      expect(result).toEqual({ cancelled: true });

      // pendingWriteId should be cleared after cancellation (bug fix)
      expect((CoreAPI as any).pendingWriteId).toBeNull();
    });
  });

  describe("cancelWrite improvements", () => {
    it("should resolve with cancelled result instead of rejecting", async () => {
      // Start a write operation
      const writePromise = CoreAPI.write({ text: "test" });

      // Verify pendingWriteId is set
      expect((CoreAPI as any).pendingWriteId).toBeDefined();

      // Cancel the write using cancelWrite method
      CoreAPI.cancelWrite();

      // Should resolve with cancelled status, not reject
      const result = await writePromise;
      expect(result).toEqual({ cancelled: true });
    });

    it("should clear timeout when cancelling write", async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      // Start a write operation
      const writePromise = CoreAPI.write({ text: "test" });

      // Cancel immediately
      CoreAPI.cancelWrite();

      await writePromise;

      // Timeout should be cleared
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it("should handle multiple cancelWrite calls gracefully", async () => {
      // Start a write operation
      const writePromise = CoreAPI.write({ text: "test" });

      // Cancel multiple times
      CoreAPI.cancelWrite();
      CoreAPI.cancelWrite();
      CoreAPI.cancelWrite();

      // Should still resolve properly
      const result = await writePromise;
      expect(result).toEqual({ cancelled: true });
    });

    it("should handle cancelWrite without affecting other operations", async () => {
      // Start a write operation
      const writePromise = CoreAPI.write({ text: "test" });

      // Verify write request was sent
      expect(mockSend).toHaveBeenCalledTimes(1);
      const writeCall = JSON.parse(mockSend.mock.calls[0][0]);
      expect(writeCall.method).toBe("readers.write");

      // Cancel the write
      CoreAPI.cancelWrite();

      // Write should be cancelled
      const writeResult = await writePromise;
      expect(writeResult).toEqual({ cancelled: true });

      // Verify cancel request was sent
      expect(mockSend).toHaveBeenCalledTimes(2);
      const cancelCall = JSON.parse(mockSend.mock.calls[1][0]);
      expect(cancelCall.method).toBe("readers.write.cancel");
    });
  });
});