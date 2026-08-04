import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CoreAPI,
  CoreApiError,
  MalformedCoreResponseError,
  getDeviceAddress,
  getWsUrl,
  isExpectedMediaDatabaseError,
  isMissingMediaDatabaseSetupError,
  isUnsupportedMediaApiError,
} from "@/lib/coreApi";
import { Capacitor } from "@capacitor/core";
import { Method, Notification } from "@/lib/models.ts";

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

describe("media API error classification", () => {
  it("should recognize unsupported media API errors case-insensitively", () => {
    expect(isUnsupportedMediaApiError(new Error("Method not found"))).toBe(
      true,
    );
    expect(isUnsupportedMediaApiError("METHOD NOT FOUND")).toBe(true);
  });

  it("should recognize JSON-RPC method-not-found codes", () => {
    expect(
      isUnsupportedMediaApiError(new CoreApiError("No method", -32601)),
    ).toBe(true);
    expect(
      isUnsupportedMediaApiError(new CoreApiError("Other failure", -32000)),
    ).toBe(false);
  });

  it("should only match exact missing query/system contract errors", () => {
    expect(isUnsupportedMediaApiError("query or system is required")).toBe(
      true,
    );
    expect(
      isUnsupportedMediaApiError(
        "query or system is required for old endpoint",
      ),
    ).toBe(false);
  });

  it("should recognize missing media database setup errors", () => {
    expect(
      isMissingMediaDatabaseSetupError(
        new Error("failed to get optimization status: no such table: DBConfig"),
      ),
    ).toBe(true);
    expect(
      isMissingMediaDatabaseSetupError(
        "failed to get optimization status during indexing check",
      ),
    ).toBe(true);
    expect(isMissingMediaDatabaseSetupError(null)).toBe(false);
  });

  it("should classify unsupported and missing setup failures as expected", () => {
    expect(isExpectedMediaDatabaseError(new Error("Method not found"))).toBe(
      true,
    );
    expect(
      isExpectedMediaDatabaseError(new Error("no such table: DBConfig")),
    ).toBe(true);
    expect(isExpectedMediaDatabaseError(new Error("network down"))).toBe(false);
  });
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

  it("should log request metadata without JSON-RPC params", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    CoreAPI.call(Method.Run, { text: "plain-private-request-value" }).catch(
      () => {},
    );

    const logCall = debugSpy.mock.calls.find(
      ([message]) => message === "Sending request",
    );
    expect(logCall).toBeDefined();
    expect(logCall?.[1]).toEqual(
      expect.objectContaining({ method: Method.Run }),
    );
    expect(logCall?.[1]).not.toHaveProperty("params");
    expect(JSON.stringify(logCall)).not.toContain(
      "plain-private-request-value",
    );

    debugSpy.mockRestore();
  });

  it("should log tracked request metadata without JSON-RPC params", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    CoreAPI.write({ text: "plain-private-write-value" }).catch(() => {});

    const logCall = debugSpy.mock.calls.find(
      ([message]) => message === "Sending tracked request",
    );
    expect(logCall).toBeDefined();
    expect(logCall?.[1]).toEqual(
      expect.objectContaining({ method: Method.ReadersWrite }),
    );
    expect(logCall?.[1]).not.toHaveProperty("params");
    expect(JSON.stringify(logCall)).not.toContain("plain-private-write-value");

    debugSpy.mockRestore();
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

  it("should reject unknown malformed JSON in processReceived", async () => {
    const invalidJsonEvent = { data: "invalid json" } as MessageEvent;

    await expect(
      CoreAPI.processReceived(invalidJsonEvent),
    ).rejects.toBeInstanceOf(MalformedCoreResponseError);
  });

  it("should reject matching pending requests for malformed JSON responses", async () => {
    const promise = CoreAPI.version();
    const sentData = JSON.parse(mockSend.mock.calls[0][0]);

    await expect(
      CoreAPI.processReceived({
        data: `{"jsonrpc":"2.0","id":"${sentData.id}","result":{"version":`,
      } as MessageEvent),
    ).resolves.toBeNull();

    await expect(promise).rejects.toBeInstanceOf(MalformedCoreResponseError);
  });

  it.each([
    ["stop", () => CoreAPI.stop(), "stop"],
    ["mediaActive", () => CoreAPI.mediaActive(), "media.active"],
    ["settingsReload", () => CoreAPI.settingsReload(), "settings.reload"],
    ["clientsCurrent", () => CoreAPI.clientsCurrent(), "clients.current"],
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

  it("should send slot-targeted media.control params and resolve", async () => {
    const controlPromise = CoreAPI.mediaControl({
      action: "stop",
      slot: "background",
    });
    const request = JSON.parse(mockSend.mock.calls[0][0]);

    expect(request.method).toBe("media.control");
    expect(request.params).toEqual({
      action: "stop",
      slot: "background",
    });

    await CoreAPI.processReceived({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result: {},
      }),
    } as MessageEvent);

    await expect(controlPromise).resolves.toBeUndefined();
  });

  it("should reject cancelled media.control responses", async () => {
    const controlPromise = CoreAPI.mediaControl({
      action: "stop",
      slot: "background",
    });
    const request = JSON.parse(mockSend.mock.calls[0][0]);

    await CoreAPI.processReceived({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result: { cancelled: true },
      }),
    } as MessageEvent);

    await expect(controlPromise).rejects.toThrow(
      "Media control request was not delivered",
    );
  });

  it("should resolve media.active object, null, and cancellation responses", async () => {
    const activeMedia = {
      systemId: "SNES",
      systemName: "Super Nintendo",
      mediaName: "Super Mario World",
      mediaPath: "/games/smw.sfc",
      zapScript: "@SNES/Super Mario World",
    };
    const activePromise = CoreAPI.mediaActive();
    const activeRequest = JSON.parse(mockSend.mock.calls[0][0]);

    CoreAPI.processReceived({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: activeRequest.id,
        result: activeMedia,
      }),
    } as MessageEvent).catch(() => undefined);

    await expect(activePromise).resolves.toEqual(activeMedia);

    mockSend.mockClear();
    const emptyPromise = CoreAPI.mediaActive();
    const emptyRequest = JSON.parse(mockSend.mock.calls[0][0]);

    CoreAPI.processReceived({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: emptyRequest.id,
        result: null,
      }),
    } as MessageEvent).catch(() => undefined);

    await expect(emptyPromise).resolves.toBeNull();

    mockSend.mockClear();
    const cancelledPromise = CoreAPI.mediaActive();
    const cancelledRequest = JSON.parse(mockSend.mock.calls[0][0]);

    CoreAPI.processReceived({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: cancelledRequest.id,
        result: { cancelled: true },
      }),
    } as MessageEvent).catch(() => undefined);

    await expect(cancelledPromise).resolves.toBeNull();
  });

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

  it("should send input.keyboard with keys params", () => {
    CoreAPI.inputKeyboard({ keys: "abc{enter}" }).catch(() => {
      // Ignore timeout errors
    });

    expect(mockSend).toHaveBeenCalledOnce();
    const sentData = JSON.parse(mockSend.mock.calls[0][0]);
    expect(sentData.method).toBe("input.keyboard");
    expect(sentData.params).toEqual({ keys: "abc{enter}" });
  });

  it("should send input.gamepad with buttons params", () => {
    CoreAPI.inputGamepad({ buttons: "^^vv<><>BA{start}" }).catch(() => {
      // Ignore timeout errors
    });

    expect(mockSend).toHaveBeenCalledOnce();
    const sentData = JSON.parse(mockSend.mock.calls[0][0]);
    expect(sentData.method).toBe("input.gamepad");
    expect(sentData.params).toEqual({ buttons: "^^vv<><>BA{start}" });
  });

  it("should send and resolve device auth status requests", async () => {
    const promise = CoreAPI.settingsAuthStatus({
      url: "https://api.zaparoo.com",
    });
    const sentData = JSON.parse(mockSend.mock.calls[0][0]);

    expect(sentData.method).toBe("settings.auth.status");
    expect(sentData.params).toEqual({ url: "https://api.zaparoo.com" });

    await CoreAPI.processReceived({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: sentData.id,
        result: { linked: true },
      }),
    } as MessageEvent);

    await expect(promise).resolves.toEqual({ linked: true });
  });

  it("should send and resolve one-shot device auth claims", async () => {
    const promise = CoreAPI.settingsAuthClaim({
      claimUrl: "https://api.zaparoo.com/v1/device-claims/redeem",
      token: "zpc1_test",
    });
    const sentData = JSON.parse(mockSend.mock.calls[0][0]);

    expect(sentData.method).toBe("settings.auth.claim");
    expect(sentData.params).toEqual({
      claimUrl: "https://api.zaparoo.com/v1/device-claims/redeem",
      token: "zpc1_test",
    });

    await CoreAPI.processReceived({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: sentData.id,
        result: { domains: ["https://api.zaparoo.com"] },
      }),
    } as MessageEvent);

    await expect(promise).resolves.toEqual({
      domains: ["https://api.zaparoo.com"],
    });
  });

  it("should send and resolve cloud backup status requests", async () => {
    const promise = CoreAPI.settingsBackupStatus();
    const sentData = JSON.parse(mockSend.mock.calls[0][0]);
    const result = {
      activeOperation: "",
      local: { lastStatus: "", lastBackupSize: 0, enabled: true },
      remote: {
        linked: true,
        enabled: false,
        lastStatus: "success",
        lastBackupSize: 123,
      },
    };

    expect(sentData.method).toBe("settings.backup.status");
    expect(sentData.params).toBeUndefined();

    await CoreAPI.processReceived({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: sentData.id,
        result,
      }),
    } as MessageEvent);

    await expect(promise).resolves.toEqual(result);
  });

  it("should resolve screenshot responses", async () => {
    const promise = CoreAPI.screenshot();

    expect(mockSend).toHaveBeenCalledOnce();
    const sentData = JSON.parse(mockSend.mock.calls[0][0]);
    expect(sentData.method).toBe("screenshot");
    expect(sentData.params).toBeUndefined();

    CoreAPI.processReceived({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: sentData.id,
        result: {
          path: "/media/fat/screenshots/MiSTer.png",
          data: "iVBORw0KGgo=",
          size: 12,
        },
      }),
    } as MessageEvent).catch(() => undefined);

    await expect(promise).resolves.toEqual({
      path: "/media/fat/screenshots/MiSTer.png",
      data: "iVBORw0KGgo=",
      size: 12,
    });
  });

  it("should reject invalid screenshot responses", async () => {
    const promise = CoreAPI.screenshot();
    const sentData = JSON.parse(mockSend.mock.calls[0][0]);

    CoreAPI.processReceived({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: sentData.id,
        result: { path: "/tmp/screenshot.png", data: "abc" },
      }),
    } as MessageEvent).catch(() => undefined);

    await expect(promise).rejects.toThrow("Invalid screenshot response");
  });

  it("should not queue input methods while disconnected", async () => {
    CoreAPI.setWsInstance({ isConnected: false, send: mockSend });

    await expect(CoreAPI.inputKeyboard({ keys: "a" })).rejects.toThrow(
      "Request requires active connection",
    );

    expect(mockSend).not.toHaveBeenCalled();
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

    it("should reject non-numeric port", () => {
      localStorageMock.getItem.mockReturnValue("192.168.1.100:abc");

      const wsUrl = getWsUrl();
      expect(wsUrl).toBe("");
    });

    it("should reject port that is out of range", () => {
      localStorageMock.getItem.mockReturnValue("192.168.1.100:70000");

      const wsUrl = getWsUrl();
      expect(wsUrl).toBe("");
    });

    it("should reject zero port", () => {
      localStorageMock.getItem.mockReturnValue("192.168.1.100:0");

      const wsUrl = getWsUrl();
      expect(wsUrl).toBe("");
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

    it("should reject trailing colon", () => {
      localStorageMock.getItem.mockReturnValue("192.168.1.100:");

      const wsUrl = getWsUrl();
      expect(wsUrl).toBe("");
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
