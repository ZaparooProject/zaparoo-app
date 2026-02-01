import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CoreAPI } from "../../lib/coreApi";
import { getWsUrl } from "../../lib/coreApi";

// Mock WebSocket
const mockSend = vi.fn();
const mockWebSocket = vi.fn().mockImplementation(() => ({
  send: mockSend,
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));

// Add static properties to mock
Object.assign(mockWebSocket, {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
});

global.WebSocket = mockWebSocket as any;

describe("CoreAPI Write Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up the send function
    CoreAPI.setSend(mockSend);
    // Mock WebSocket connection as connected so requests are sent immediately
    CoreAPI.setWsInstance({ isConnected: true, send: mockSend } as any);
  });

  describe("hasWriteCapableReader", () => {
    it("should return true when write capable readers exist", async () => {
      // Mock successful readers response
      const mockReadersResponse = {
        readers: [
          {
            id: "reader1",
            info: "NFC Reader 1",
            capabilities: ["read", "write"],
            connected: true,
          },
          {
            id: "reader2",
            info: "NFC Reader 2",
            capabilities: ["read"],
            connected: true,
          },
        ],
      };

      // Mock the call method to resolve with readers response
      vi.spyOn(CoreAPI, "call" as any).mockResolvedValue(mockReadersResponse);

      const result = await CoreAPI.hasWriteCapableReader();

      expect(result).toBe(true);
    });

    it("should return false when no write capable readers exist", async () => {
      const mockReadersResponse = {
        readers: [
          {
            id: "reader1",
            info: "Read Only Reader",
            capabilities: ["read"],
            connected: true,
          },
        ],
      };

      vi.spyOn(CoreAPI, "call" as any).mockResolvedValue(mockReadersResponse);

      const result = await CoreAPI.hasWriteCapableReader();

      expect(result).toBe(false);
    });

    it("should return false when readers are not connected", async () => {
      const mockReadersResponse = {
        readers: [
          {
            id: "reader1",
            info: "NFC Reader",
            capabilities: ["read", "write"],
            connected: false,
          },
        ],
      };

      vi.spyOn(CoreAPI, "call" as any).mockResolvedValue(mockReadersResponse);

      const result = await CoreAPI.hasWriteCapableReader();

      expect(result).toBe(false);
    });

    it("should handle API errors gracefully", async () => {
      vi.spyOn(CoreAPI, "call" as any).mockRejectedValue(
        new Error("API Error"),
      );

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = await CoreAPI.hasWriteCapableReader();

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to check write capable readers:",
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });

    it("should check for case-insensitive write capability", async () => {
      const mockReadersResponse = {
        readers: [
          {
            id: "reader1",
            info: "NFC Reader",
            capabilities: ["READ", "WRITE"], // uppercase
            connected: true,
          },
        ],
      };

      vi.spyOn(CoreAPI, "call" as any).mockResolvedValue(mockReadersResponse);

      const result = await CoreAPI.hasWriteCapableReader();

      expect(result).toBe(true);
    });

    // Regression tests for handling malformed API responses
    it("should return false when readers array is undefined", async () => {
      // Simulates API returning response without readers property
      const mockReadersResponse = {};

      vi.spyOn(CoreAPI, "call" as any).mockResolvedValue(mockReadersResponse);

      const result = await CoreAPI.hasWriteCapableReader();

      expect(result).toBe(false);
    });

    it("should return false when readers is null", async () => {
      const mockReadersResponse = { readers: null };

      vi.spyOn(CoreAPI, "call" as any).mockResolvedValue(mockReadersResponse);

      const result = await CoreAPI.hasWriteCapableReader();

      expect(result).toBe(false);
    });

    it("should return false when readers is not an array", async () => {
      const mockReadersResponse = { readers: "not-an-array" };

      vi.spyOn(CoreAPI, "call" as any).mockResolvedValue(mockReadersResponse);

      const result = await CoreAPI.hasWriteCapableReader();

      expect(result).toBe(false);
    });

    it("should return false when response is null", async () => {
      vi.spyOn(CoreAPI, "call" as any).mockResolvedValue(null);

      const result = await CoreAPI.hasWriteCapableReader();

      expect(result).toBe(false);
    });

    it("should return false when reader capabilities is undefined", async () => {
      const mockReadersResponse = {
        readers: [
          {
            id: "reader1",
            info: "NFC Reader",
            capabilities: undefined,
            connected: true,
          },
        ],
      };

      vi.spyOn(CoreAPI, "call" as any).mockResolvedValue(mockReadersResponse);

      const result = await CoreAPI.hasWriteCapableReader();

      expect(result).toBe(false);
    });

    it("should return false when reader capabilities is not an array", async () => {
      const mockReadersResponse = {
        readers: [
          {
            id: "reader1",
            info: "NFC Reader",
            capabilities: "write", // string instead of array
            connected: true,
          },
        ],
      };

      vi.spyOn(CoreAPI, "call" as any).mockResolvedValue(mockReadersResponse);

      const result = await CoreAPI.hasWriteCapableReader();

      expect(result).toBe(false);
    });

    it("should return false when readers array is empty", async () => {
      const mockReadersResponse = { readers: [] };

      vi.spyOn(CoreAPI, "call" as any).mockResolvedValue(mockReadersResponse);

      const result = await CoreAPI.hasWriteCapableReader();

      // Empty array means no write capable readers, but it's a valid response
      expect(result).toBe(false);
    });
  });

  describe("cancelWrite", () => {
    it("should not throw when called without pending write", () => {
      // cancelWrite should gracefully handle being called with no pending write
      expect(() => CoreAPI.cancelWrite()).not.toThrow();
    });

    it("should not call readersWriteCancel when no pending write exists", () => {
      vi.spyOn(CoreAPI, "readersWriteCancel");

      // Call cancelWrite without any pending write
      CoreAPI.cancelWrite();

      expect(CoreAPI.readersWriteCancel).not.toHaveBeenCalled();
    });
  });

  describe("callWithTracking", () => {
    it("should return request ID and promise", () => {
      const { id, promise } = CoreAPI.callWithTracking("version" as any);
      // Attach catch handler to prevent unhandled rejection when CoreAPI.reset() is called
      promise.catch(() => {});

      expect(id).toBeTruthy();
      expect(typeof id).toBe("string");
      expect(promise).toBeInstanceOf(Promise);
    });

    it("should throw when send fails", () => {
      mockSend.mockImplementation(() => {
        throw new Error("Send failed");
      });

      // Note: setSend wraps errors as "WebSocket send error", then callWithTracking
      // wraps again as "Failed to send request", then outer catch as "API call error"
      expect(() => {
        CoreAPI.callWithTracking("version" as any);
      }).toThrow(/API call error.*Failed to send request.*Send failed/);
    });

    it("should return a promise that can be awaited", () => {
      // Reset the mock to not throw error for this test
      mockSend.mockImplementation(() => {});

      const result = CoreAPI.callWithTracking("version" as any);
      // Attach catch handler to prevent unhandled rejection when CoreAPI.reset() is called
      result.promise.catch(() => {});
      expect(result.id).toBeTruthy();
      expect(result.promise).toBeInstanceOf(Promise);
    });
  });

  describe("write method with tracking", () => {
    it("should use callWithTracking internally", () => {
      const callWithTrackingSpy = vi
        .spyOn(CoreAPI, "callWithTracking")
        .mockReturnValue({
          id: "test-id",
          promise: Promise.resolve(),
        });

      CoreAPI.write({ text: "test" });

      expect(callWithTrackingSpy).toHaveBeenCalled();

      // Clean up
      CoreAPI.cancelWrite();
    });

    it("should resolve on successful write", async () => {
      vi.spyOn(CoreAPI, "callWithTracking").mockReturnValue({
        id: "test-id",
        promise: Promise.resolve({ success: true }),
      });

      // write() returns void on success (not the raw result)
      const result = await CoreAPI.write({ text: "test" });

      expect(result).toBeUndefined();
    });

    it("should reject on write error", async () => {
      vi.spyOn(CoreAPI, "callWithTracking").mockReturnValue({
        id: "test-id",
        promise: Promise.reject(new Error("Write failed")),
      });

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await expect(CoreAPI.write({ text: "test" })).rejects.toThrow(
        "Write failed",
      );

      consoleErrorSpy.mockRestore();
    });
  });
});

describe("getWsUrl - Enhanced URL parsing", () => {
  let originalLocalStorage: Storage;
  let originalLocation: Location;

  beforeEach(() => {
    // Store original values
    originalLocalStorage = window.localStorage;
    originalLocation = window.location;

    // Create fresh localStorage mock for each test
    const localStorageMock = {
      getItem: vi.fn((key: string) => localStorageMock._store[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        localStorageMock._store[key] = value;
      }),
      clear: vi.fn(() => {
        localStorageMock._store = {};
      }),
      _store: {} as { [key: string]: string },
    };

    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });

    // Clear the mock store
    localStorageMock.clear();
  });

  afterEach(() => {
    // Restore original values
    Object.defineProperty(window, "localStorage", {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it("should parse host and port from device address", () => {
    localStorage.setItem("deviceAddress", "192.168.1.100:8080");

    const url = getWsUrl();

    expect(url).toBe("ws://192.168.1.100:8080/api/v0.1");
  });

  it("should use default port when not specified", () => {
    localStorage.setItem("deviceAddress", "192.168.1.100");

    const url = getWsUrl();

    expect(url).toBe("ws://192.168.1.100:7497/api/v0.1");
  });

  it("should handle IPv6 addresses correctly", () => {
    localStorage.setItem("deviceAddress", "[::1]:8080");

    const url = getWsUrl();

    expect(url).toBe("ws://[::1]:8080/api/v0.1");
  });

  it("should strip invalid port and use default when port is out of range", () => {
    localStorage.setItem("deviceAddress", "192.168.1.100:99999"); // Invalid port

    const url = getWsUrl();

    // Should strip invalid port and use default
    expect(url).toBe("ws://192.168.1.100:7497/api/v0.1");
  });

  it("should reject malformed addresses with multiple colons that aren't valid IPv6", () => {
    localStorage.setItem("deviceAddress", "my:host:name");

    const url = getWsUrl();

    // 'my:host:name' has multiple colons but isn't valid IPv6 (not hex segments)
    // Should be rejected rather than wrapped in brackets
    expect(url).toBe("");
  });

  it("should return empty string for malformed address with no host", () => {
    localStorage.setItem("deviceAddress", ":8080"); // No host

    const url = getWsUrl();

    // Malformed address starting with colon returns empty string
    expect(url).toBe("");
  });

  it("should handle trailing colon by stripping it", () => {
    localStorage.setItem("deviceAddress", "192.168.1.100:");

    const url = getWsUrl();

    // Trailing colon is stripped and default port is used
    expect(url).toBe("ws://192.168.1.100:7497/api/v0.1");
  });

  it("should handle errors gracefully", () => {
    // Clear localStorage to trigger fallback
    localStorage.clear();

    const url = getWsUrl();

    // Without stored device address, it defaults to localhost
    expect(url).toBe("ws://localhost:7497/api/v0.1");
  });
});
