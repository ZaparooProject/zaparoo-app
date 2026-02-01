import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CoreAPI, getDeviceAddress, getWsUrl } from "@/lib/coreApi.ts";
import { Capacitor } from "@capacitor/core";
import { Notification } from "@/lib/models.ts";

// Mock Capacitor
vi.mock("@capacitor/core");

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// Mock window.location
Object.defineProperty(window, "location", {
  value: {
    hostname: "localhost",
  },
  writable: true,
});

describe("CoreAPI", () => {
  let mockSend: any;

  beforeEach(() => {
    mockSend = vi.fn();
    CoreAPI.setSend(mockSend);
    // Mock WebSocket connection as connected so requests are sent immediately
    CoreAPI.setWsInstance({ isConnected: true, send: mockSend } as any);
    vi.useFakeTimers();

    // Clear mocks
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue("");
  });

  afterEach(() => {
    vi.useRealTimers();
    // Clear any pending promises/timeouts
    vi.clearAllTimers();
  });

  it("should initialize with default send function", () => {
    expect(CoreAPI).toBeDefined();
  });

  it("should send JSON-RPC requests with correct format", () => {
    // Start a version call (but don't await to avoid timeout)
    CoreAPI.version().catch(() => {
      // Ignore timeout errors to prevent unhandled rejections
    });

    // Verify the request was sent with correct format
    expect(mockSend).toHaveBeenCalledOnce();

    const sentData = JSON.parse(mockSend.mock.calls[0][0]);
    expect(sentData.jsonrpc).toBe("2.0");
    expect(sentData.method).toBe("version");
    expect(sentData.id).toBeDefined();
    expect(sentData.timestamp).toBeDefined();
  });

  it("should timeout requests after 30 seconds", async () => {
    vi.useFakeTimers();

    const promise = CoreAPI.version();

    // Advance time by 30 seconds to trigger timeout
    vi.advanceTimersByTime(30000);

    // The promise should reject with timeout error
    await expect(promise).rejects.toThrow("Request timeout");

    // Clean up any remaining timers
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("should return stored address from localStorage when available", () => {
    localStorageMock.getItem.mockReturnValue("192.168.1.100");

    const address = getDeviceAddress();
    expect(address).toBe("192.168.1.100");
    expect(localStorageMock.getItem).toHaveBeenCalledWith("deviceAddress");
  });

  it("should return hostname when on web platform and no stored address", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    localStorageMock.getItem.mockReturnValue("");

    const address = getDeviceAddress();
    expect(address).toBe("localhost");
  });

  it("should handle pong messages in processReceived", async () => {
    const pongEvent = { data: "pong" } as MessageEvent;
    const result = await CoreAPI.processReceived(pongEvent);
    expect(result).toBeNull();
  });

  it("should handle invalid JSON in processReceived", async () => {
    const invalidJsonEvent = { data: "invalid json" } as MessageEvent;
    await expect(CoreAPI.processReceived(invalidJsonEvent)).rejects.toThrow(
      "Error parsing JSON response",
    );
  });

  it.each([
    ["stop", () => CoreAPI.stop(), "stop"],
    ["mediaActive", () => CoreAPI.mediaActive(), "media.active"],
    ["settingsReload", () => CoreAPI.settingsReload(), "settings.reload"],
    [
      "readersWriteCancel",
      () => CoreAPI.readersWriteCancel(),
      "readers.write.cancel",
    ],
  ] as const)(
    "should call %s method with correct JSON-RPC format",
    (_, apiCall, expectedMethod) => {
      apiCall().catch(() => {
        // Ignore timeout errors
      });

      expect(mockSend).toHaveBeenCalledOnce();
      const sentData = JSON.parse(mockSend.mock.calls[0][0]);
      expect(sentData.jsonrpc).toBe("2.0");
      expect(sentData.method).toBe(expectedMethod);
      expect(sentData.id).toBeDefined();
      expect(sentData.timestamp).toBeDefined();
    },
  );

  it("should handle tokens.removed notification", async () => {
    const tokensRemovedEvent = {
      data: JSON.stringify({
        jsonrpc: "2.0",
        method: "tokens.removed",
        params: { uid: "test-uid" },
      }),
    } as MessageEvent;

    const result = await CoreAPI.processReceived(tokensRemovedEvent);

    expect(result).toEqual({
      method: Notification.TokensRemoved,
      params: { uid: "test-uid" },
    });
  });

  it("should have readers method returning ReadersResponse type", () => {
    // Test that readers method exists and has proper typing
    expect(typeof CoreAPI.readers).toBe("function");

    // This test verifies the method exists and is properly typed
    // The actual implementation test will be in integration tests
    CoreAPI.readers().catch(() => {
      // Ignore timeout errors to prevent unhandled rejections
    });

    // Verify it calls the correct API method
    const sentData = JSON.parse(mockSend.mock.calls[0][0]);
    expect(sentData.method).toBe("readers");
  });

  describe("getWsUrl", () => {
    it("should use default port 7497 when address has no port", () => {
      localStorageMock.getItem.mockReturnValue("192.168.1.100");

      const wsUrl = getWsUrl();
      expect(wsUrl).toBe("ws://192.168.1.100:7497/api/v0.1");
    });

    it("should use custom port when address includes port", () => {
      localStorageMock.getItem.mockReturnValue("192.168.1.100:8080");

      const wsUrl = getWsUrl();
      expect(wsUrl).toBe("ws://192.168.1.100:8080/api/v0.1");
    });

    it("should handle hostname with custom port", () => {
      localStorageMock.getItem.mockReturnValue("zaparoo.local:9090");

      const wsUrl = getWsUrl();
      expect(wsUrl).toBe("ws://zaparoo.local:9090/api/v0.1");
    });

    it("should strip invalid port and use default when port is non-numeric", () => {
      localStorageMock.getItem.mockReturnValue("192.168.1.100:abc");

      const wsUrl = getWsUrl();
      expect(wsUrl).toBe("ws://192.168.1.100:7497/api/v0.1");
    });

    it("should strip invalid port and use default when port is out of range", () => {
      localStorageMock.getItem.mockReturnValue("192.168.1.100:70000");

      const wsUrl = getWsUrl();
      expect(wsUrl).toBe("ws://192.168.1.100:7497/api/v0.1");
    });

    it("should strip invalid port and use default when port is zero", () => {
      localStorageMock.getItem.mockReturnValue("192.168.1.100:0");

      const wsUrl = getWsUrl();
      expect(wsUrl).toBe("ws://192.168.1.100:7497/api/v0.1");
    });

    it("should handle unbracketed IPv6 addresses by wrapping in brackets", () => {
      localStorageMock.getItem.mockReturnValue("::1");

      const wsUrl = getWsUrl();
      // Unbracketed IPv6 addresses should be wrapped in brackets with default port
      expect(wsUrl).toBe("ws://[::1]:7497/api/v0.1");
    });

    it("should handle addresses with multiple colons as IPv6", () => {
      // Addresses with multiple colons are treated as IPv6 and wrapped in brackets
      localStorageMock.getItem.mockReturnValue("fe80::1");

      const wsUrl = getWsUrl();
      expect(wsUrl).toBe("ws://[fe80::1]:7497/api/v0.1");
    });

    it("should handle trailing colon by stripping it and using default port", () => {
      localStorageMock.getItem.mockReturnValue("192.168.1.100:");

      const wsUrl = getWsUrl();
      expect(wsUrl).toBe("ws://192.168.1.100:7497/api/v0.1");
    });

    it("should use localhost with default port when no address is stored and on web", () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      localStorageMock.getItem.mockReturnValue("");

      const wsUrl = getWsUrl();
      expect(wsUrl).toBe("ws://localhost:7497/api/v0.1");
    });

    it("should handle edge case port numbers", () => {
      localStorageMock.getItem.mockReturnValue("192.168.1.100:1");

      const wsUrl = getWsUrl();
      expect(wsUrl).toBe("ws://192.168.1.100:1/api/v0.1");
    });

    it("should handle maximum valid port number", () => {
      localStorageMock.getItem.mockReturnValue("192.168.1.100:65535");

      const wsUrl = getWsUrl();
      expect(wsUrl).toBe("ws://192.168.1.100:65535/api/v0.1");
    });
  });
});
