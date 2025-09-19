import { describe, it, expect, vi, beforeEach } from "vitest";
import { CoreAPI } from "../../lib/coreApi";

const mockSend = vi.fn();

describe("CoreAPI Missing Coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CoreAPI.setSend(mockSend);
  });

  describe("hasWriteCapableReader method", () => {
    it("should return true when readers have write capability", async () => {
      // Mock the readers response with write-capable readers
      const mockReaders = {
        readers: [
          {
            connected: true,
            capabilities: ["read", "write", "format"]
          }
        ]
      };

      // Mock CoreAPI.readers to return the mock data
      const originalReaders = CoreAPI.readers;
      CoreAPI.readers = vi.fn().mockResolvedValue(mockReaders);

      const result = await (CoreAPI as any).hasWriteCapableReader();

      expect(result).toBe(true);
      expect(CoreAPI.readers).toHaveBeenCalled();

      // Restore
      CoreAPI.readers = originalReaders;
    });

    it("should return false when readers have no write capability", async () => {
      // Mock the readers response with no write-capable readers
      const mockReaders = {
        readers: [
          {
            connected: true,
            capabilities: ["read", "format"]
          }
        ]
      };

      // Mock CoreAPI.readers to return the mock data
      const originalReaders = CoreAPI.readers;
      CoreAPI.readers = vi.fn().mockResolvedValue(mockReaders);

      const result = await (CoreAPI as any).hasWriteCapableReader();

      expect(result).toBe(false);
      expect(CoreAPI.readers).toHaveBeenCalled();

      // Restore
      CoreAPI.readers = originalReaders;
    });

    it("should handle errors in hasWriteCapableReader method", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Mock CoreAPI.readers to reject
      const originalReaders = CoreAPI.readers;
      CoreAPI.readers = vi.fn().mockRejectedValue(new Error("Reader error"));

      const result = await (CoreAPI as any).hasWriteCapableReader();

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith("Failed to check write capable readers:", expect.any(Error));

      // Restore
      CoreAPI.readers = originalReaders;
      consoleSpy.mockRestore();
    });
  });

  describe("readersWriteCancel success path", () => {
    it("should resolve successfully on readersWriteCancel success", async () => {
      // Mock CoreAPI.call to resolve
      const originalCall = CoreAPI.call;
      CoreAPI.call = vi.fn().mockResolvedValue({ result: "success" });

      await expect(CoreAPI.readersWriteCancel()).resolves.toBeUndefined();
      expect(CoreAPI.call).toHaveBeenCalledWith("readers.write.cancel");

      // Restore
      CoreAPI.call = originalCall;
    });
  });

  describe("launchersRefresh success path", () => {
    it("should resolve successfully on launchersRefresh success", async () => {
      // Mock CoreAPI.call to resolve
      const originalCall = CoreAPI.call;
      CoreAPI.call = vi.fn().mockResolvedValue({ result: "success" });

      await expect((CoreAPI as any).launchersRefresh()).resolves.toBeUndefined();
      expect(CoreAPI.call).toHaveBeenCalledWith("launchers.refresh");

      // Restore
      CoreAPI.call = originalCall;
    });
  });
});