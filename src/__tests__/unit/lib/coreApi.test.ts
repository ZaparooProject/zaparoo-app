import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CoreAPI, getDeviceAddress } from "../../../lib/coreApi";
import { Capacitor } from "@capacitor/core";
import { Notification, SettingsResponse, Method, UpdateSettingsRequest } from "../../../lib/models";

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn().mockReturnValue(false),
  },
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    hostname: 'localhost',
  },
  writable: true,
});

describe("CoreAPI", () => {
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSend = vi.fn();
    CoreAPI.setSend(mockSend);
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
    const promise = CoreAPI.version();

    // Advance time by 30 seconds to trigger timeout
    vi.advanceTimersByTime(30000);

    // The promise should reject with timeout error
    await expect(promise).rejects.toThrow("Request timeout");
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
    await expect(CoreAPI.processReceived(invalidJsonEvent))
      .rejects.toThrow("Error parsing JSON response");
  });

  it("should call stop method with correct JSON-RPC format", () => {
    // Start a stop call (but don't await to avoid timeout)
    CoreAPI.stop().catch(() => {
      // Ignore timeout errors to prevent unhandled rejections
    });

    // Verify the request was sent with correct format
    expect(mockSend).toHaveBeenCalledOnce();

    const sentData = JSON.parse(mockSend.mock.calls[0][0]);
    expect(sentData.jsonrpc).toBe("2.0");
    expect(sentData.method).toBe("stop");
    expect(sentData.id).toBeDefined();
    expect(sentData.timestamp).toBeDefined();
  });

  it("should handle tokens.removed notification", async () => {
    const tokensRemovedEvent = {
      data: JSON.stringify({
        jsonrpc: "2.0",
        method: "tokens.removed",
        params: { uid: "test-uid" }
      })
    } as MessageEvent;

    const result = await CoreAPI.processReceived(tokensRemovedEvent);

    expect(result).toEqual({
      method: Notification.TokensRemoved,
      params: { uid: "test-uid" }
    });
  });

  it("should have runZapScript property in SettingsResponse interface", () => {
    // This test will compile check that SettingsResponse has runZapScript
    const checkInterface = (settings: SettingsResponse) => {
      // This line should cause a TypeScript error if runZapScript doesn't exist
      const hasRunZapScript: boolean = settings.runZapScript;
      expect(typeof hasRunZapScript).toBe('boolean');
    };

    const mockSettings: SettingsResponse = {
      launchingActive: true,
      runZapScript: true,
      debugLogging: false,
      audioScanFeedback: true,
      readersAutoDetect: true,
      readersScanMode: "tap",
      readersScanExitDelay: 0,
      readersScanIgnoreSystem: []
    };

    checkInterface(mockSettings);
  });

  it("should call mediaActive method with correct JSON-RPC format", () => {
    // Start a mediaActive call (but don't await to avoid timeout)
    CoreAPI.mediaActive().catch(() => {
      // Ignore timeout errors to prevent unhandled rejections
    });

    // Verify the request was sent with correct format
    expect(mockSend).toHaveBeenCalledOnce();

    const sentData = JSON.parse(mockSend.mock.calls[0][0]);
    expect(sentData.jsonrpc).toBe("2.0");
    expect(sentData.method).toBe("media.active");
    expect(sentData.id).toBeDefined();
    expect(sentData.timestamp).toBeDefined();
  });

  it("should have MediaActive enum value", () => {
    // Test that Method.MediaActive exists and equals "media.active"
    expect(Method.MediaActive).toBe("media.active");
  });

  it("should call settingsReload method with correct JSON-RPC format", () => {
    // Start a settingsReload call (but don't await to avoid timeout)
    CoreAPI.settingsReload().catch(() => {
      // Ignore timeout errors to prevent unhandled rejections
    });

    // Verify the request was sent with correct format
    expect(mockSend).toHaveBeenCalledOnce();

    const sentData = JSON.parse(mockSend.mock.calls[0][0]);
    expect(sentData.jsonrpc).toBe("2.0");
    expect(sentData.method).toBe("settings.reload");
    expect(sentData.id).toBeDefined();
    expect(sentData.timestamp).toBeDefined();
  });

  it("should call readersWriteCancel method with correct JSON-RPC format", () => {
    // Start a readersWriteCancel call (but don't await to avoid timeout)
    CoreAPI.readersWriteCancel().catch(() => {
      // Ignore timeout errors to prevent unhandled rejections
    });

    // Verify the request was sent with correct format
    expect(mockSend).toHaveBeenCalledOnce();

    const sentData = JSON.parse(mockSend.mock.calls[0][0]);
    expect(sentData.jsonrpc).toBe("2.0");
    expect(sentData.method).toBe("readers.write.cancel");
    expect(sentData.id).toBeDefined();
    expect(sentData.timestamp).toBeDefined();
  });

  it("should not have runScript method since it's not supported by core API", () => {
    // Test that runScript method doesn't exist since it's not supported by core
    expect((CoreAPI as any).runScript).toBeUndefined();
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

  it("should support runZapScript in UpdateSettingsRequest", () => {
    // Test that UpdateSettingsRequest supports runZapScript field for API compatibility
    const updateRequest: UpdateSettingsRequest = {
      runZapScript: false,
      debugLogging: true
    };

    expect(updateRequest.runZapScript).toBe(false);
    expect(updateRequest.debugLogging).toBe(true);
  });

  it("should use readersScanIgnoreSystem (singular) to match core API response", () => {
    // Core API returns readersScanIgnoreSystem (singular), but our interface expects plural
    // This test will fail until we fix the interface to match core API

    // Simulate a core API response with singular field name
    const coreApiResponse = {
      runZapScript: true,
      debugLogging: false,
      audioScanFeedback: true,
      readersAutoDetect: true,
      readersScanMode: "tap" as const,
      readersScanExitDelay: 2.5,
      readersScanIgnoreSystem: ["system1", "system2"] // Core uses singular
    };

    // This should work with our SettingsResponse interface
    // but will fail because we currently have the plural field name
    const typedResponse: SettingsResponse = {
      launchingActive: true,
      runZapScript: coreApiResponse.runZapScript,
      debugLogging: coreApiResponse.debugLogging,
      audioScanFeedback: coreApiResponse.audioScanFeedback,
      readersAutoDetect: coreApiResponse.readersAutoDetect,
      readersScanMode: coreApiResponse.readersScanMode,
      readersScanExitDelay: coreApiResponse.readersScanExitDelay,
      readersScanIgnoreSystem: coreApiResponse.readersScanIgnoreSystem
    };

    expect(typedResponse.readersScanIgnoreSystem).toEqual(["system1", "system2"]);
  });
});