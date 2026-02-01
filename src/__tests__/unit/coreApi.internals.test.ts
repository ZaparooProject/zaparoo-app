import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CoreAPI,
  getDeviceAddress,
  setDeviceAddress,
  getWsUrl,
} from "../../lib/coreApi";

const mockSend = vi.fn();
import { Preferences } from "@capacitor/preferences";

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
}));

// Mock Preferences
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    set: vi.fn(),
    get: vi.fn(),
  },
}));

describe("CoreAPI Internals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations (not just call history)
    mockLocalStorage.getItem.mockReset();
    mockLocalStorage.setItem.mockReset();

    Object.defineProperty(window, "localStorage", {
      value: mockLocalStorage,
      writable: true,
    });

    Object.defineProperty(window, "location", {
      value: { hostname: "test-hostname" },
      writable: true,
    });

    // Mock WebSocket connection as connected so requests are sent immediately
    CoreAPI.setWsInstance({ isConnected: true, send: mockSend } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Storage error handling", () => {
    it("should throw when localStorage fails in getDeviceAddress", () => {
      // Make localStorage.getItem throw an error
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error("localStorage failed");
      });

      expect(() => getDeviceAddress()).toThrow("localStorage failed");
    });

    it("should not throw when localStorage fails in setDeviceAddress", () => {
      // Make localStorage.setItem throw an error
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error("localStorage setItem failed");
      });

      // Should not throw
      expect(() => setDeviceAddress("test-address")).not.toThrow();
    });

    it("should not throw when Preferences.set fails in setDeviceAddress", async () => {
      // Make Preferences.set reject
      vi.mocked(Preferences.set).mockRejectedValue(
        new Error("Preferences failed"),
      );

      // Should not throw
      expect(() => setDeviceAddress("test-address")).not.toThrow();
    });

    it("should throw when getWsUrl encounters an error", () => {
      // Mock String.prototype.lastIndexOf to throw an error during URL construction
      const originalLastIndexOf = String.prototype.lastIndexOf;
      String.prototype.lastIndexOf = vi.fn(() => {
        throw new Error("String operation error");
      });

      try {
        expect(() => getWsUrl()).toThrow("String operation error");
      } finally {
        // Restore mock
        String.prototype.lastIndexOf = originalLastIndexOf;
      }
    });
  });

  describe("setSend edge cases", () => {
    it("should not throw when setting invalid send function", () => {
      // Should not throw, just log error
      expect(() => CoreAPI.setSend(null as any)).not.toThrow();
    });

    it("should throw when send function errors during API call", async () => {
      // Set up a send function that throws
      CoreAPI.setSend(() => {
        throw new Error("Send failed");
      });

      // Test that calling an API method handles the send error
      await expect(CoreAPI.version()).rejects.toThrow(
        /Failed to send request.*Send failed/,
      );
    });
  });

  describe("processReceived error handling", () => {
    it("should reject invalid JSON-RPC version", async () => {
      const response = { jsonrpc: "1.0", id: "test-id", result: "test" };
      const messageEvent = new MessageEvent("message", {
        data: JSON.stringify(response),
      });

      await expect(CoreAPI.processReceived(messageEvent)).rejects.toThrow(
        "Not a valid JSON-RPC payload.",
      );
    });

    it("should process notifications and return method/params", async () => {
      const notification = {
        jsonrpc: "2.0",
        method: "test.notification",
        params: { test: "data" },
      };
      const messageEvent = new MessageEvent("message", {
        data: JSON.stringify(notification),
      });

      const result = await CoreAPI.processReceived(messageEvent);

      expect(result).toEqual({
        method: "test.notification",
        params: { test: "data" },
      });
    });

    it("should return null for unknown request IDs", async () => {
      const response = { jsonrpc: "2.0", id: "unknown-id", result: "test" };
      const messageEvent = new MessageEvent("message", {
        data: JSON.stringify(response),
      });

      const result = await CoreAPI.processReceived(messageEvent);

      expect(result).toBeNull();
    });
  });

  describe("API method error paths", () => {
    it("should propagate version method processing errors", async () => {
      // Mock call to return a response, but then make the response processing throw
      vi.spyOn(CoreAPI, "call").mockImplementation(() => {
        return Promise.resolve(null).then(() => {
          throw new Error("Response processing failed");
        });
      });

      await expect(CoreAPI.version()).rejects.toThrow(
        "Response processing failed",
      );
    });

    it("should propagate systems method call errors", async () => {
      // Mock call to reject
      vi.spyOn(CoreAPI, "call").mockRejectedValue(new Error("Network error"));

      await expect(CoreAPI.systems()).rejects.toThrow("Network error");
    });

    it("should propagate settings method errors", async () => {
      // Mock call to throw error
      vi.spyOn(CoreAPI, "call").mockImplementation(() => {
        throw new Error("Processing error");
      });

      await expect(CoreAPI.settings()).rejects.toThrow("Processing error");
    });
  });

  describe("Additional method coverage", () => {
    beforeEach(() => {
      // Mock successful calls
      vi.spyOn(CoreAPI, "call").mockResolvedValue({});
    });

    it("should call settingsUpdate without throwing", async () => {
      const params = { setting1: "value1" };
      await expect(
        CoreAPI.settingsUpdate(params as any),
      ).resolves.not.toThrow();
    });

    it("should call newMapping without throwing", async () => {
      const params = { mapping: "test" };
      await expect(CoreAPI.newMapping(params as any)).resolves.not.toThrow();
    });

    it("should call updateMapping without throwing", async () => {
      const params = { id: 1, mapping: "updated" };
      await expect(CoreAPI.updateMapping(params as any)).resolves.not.toThrow();
    });

    it("should call deleteMapping without throwing", async () => {
      const params = { id: 1 };
      await expect(CoreAPI.deleteMapping(params)).resolves.not.toThrow();
    });
  });

  describe("Queue and network error handling", () => {
    it("should reject queued requests when flush fails", async () => {
      // Set up a disconnected state to queue requests
      CoreAPI.setWsInstance({ isConnected: false, send: mockSend } as any);

      // Queue a request
      const requestPromise = CoreAPI.version();

      // Now connect and mock send to fail during flush
      mockSend.mockImplementation(() => {
        throw new Error("Flush send failed");
      });

      CoreAPI.setWsInstance({ isConnected: true, send: mockSend } as any);

      // The queued request should be rejected
      await expect(requestPromise).rejects.toThrow();
    });

    it("should reject API calls when network errors occur", async () => {
      // Simulate network error
      mockSend.mockImplementation(() => {
        const networkError = new Error("Network Error");
        networkError.name = "NetworkError";
        throw networkError;
      });

      await expect(CoreAPI.version()).rejects.toThrow("Failed to send request");
    });
  });
});
