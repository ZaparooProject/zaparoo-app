import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CoreAPI, getDeviceAddress } from "../../../lib/coreApi";
import { Capacitor } from "@capacitor/core";

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
});