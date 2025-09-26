import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { CoreAPI } from "@/lib/coreApi";
import { Method } from "@/lib/models";

describe("CoreAPI Simple Additional Coverage", () => {
  const mockSend = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    CoreAPI.setSend(mockSend);
    CoreAPI.setWsInstance({ isConnected: true, send: mockSend } as any);
  });

  afterEach(() => {
    CoreAPI.reset();
  });

  describe("WebSocket management errors", () => {
    it("should handle invalid WebSocketManager instance", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Pass invalid WebSocket manager
      CoreAPI.setWsInstance(null as any);

      expect(consoleSpy).toHaveBeenCalledWith("Invalid WebSocketManager instance provided to CoreAPI");
      consoleSpy.mockRestore();
    });

    it("should handle invalid send function", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Pass invalid send function
      CoreAPI.setSend(null as any);

      expect(consoleSpy).toHaveBeenCalledWith("Invalid send function provided to CoreAPI");
      consoleSpy.mockRestore();
    });
  });

  describe("Queue flush error handling", () => {
    it("should handle send errors during queue flush", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Set up a disconnected state to queue requests
      CoreAPI.setWsInstance({ isConnected: false, send: mockSend } as any);

      // Queue a request
      const requestPromise = CoreAPI.call(Method.Version);

      // Now connect and mock send to fail during flush
      mockSend.mockImplementation(() => {
        throw new Error("Flush send failed");
      });

      CoreAPI.setWsInstance({ isConnected: true, send: mockSend } as any);

      // The queued request should be rejected
      await expect(requestPromise).rejects.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith("Failed to send queued request during flush:", expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe("hasWriteCapableReader error handling", () => {
    it("should handle errors in hasWriteCapableReader", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Mock CoreAPI.readers to throw an error
      const originalReaders = CoreAPI.readers;
      CoreAPI.readers = vi.fn().mockRejectedValue(new Error("Readers error"));

      const result = await (CoreAPI as any).hasWriteCapableReader();

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith("Failed to check write capable readers:", expect.any(Error));

      CoreAPI.readers = originalReaders;
      consoleSpy.mockRestore();
    });
  });

  describe("Method-specific error propagation", () => {
    it("should properly handle version method errors", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Mock the internal call to fail
      const originalCall = (CoreAPI as any).call;
      (CoreAPI as any).call = vi.fn().mockRejectedValue(new Error("Version call failed"));

      await expect(CoreAPI.version()).rejects.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith("Version API call failed:", expect.any(Error));

      (CoreAPI as any).call = originalCall;
      consoleSpy.mockRestore();
    });
  });

  describe("Network error simulation", () => {
    it("should handle network disconnection during API calls", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Simulate network error
      mockSend.mockImplementation(() => {
        const networkError = new Error("Network Error");
        networkError.name = "NetworkError";
        throw networkError;
      });

      await expect(CoreAPI.call(Method.Version)).rejects.toThrow("Failed to send request");

      expect(consoleSpy).toHaveBeenCalledWith("Failed to send request:", expect.any(Error));
      consoleSpy.mockRestore();
    });
  });
});