import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock Capacitor to simulate native platform
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => "ios",
    isNativePlatform: () => true,
  },
}));

// Mock rollbar module that logger will lazy-load
const mockRollbar = {
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  critical: vi.fn(),
};

vi.mock("../../../lib/rollbar", () => ({
  rollbar: mockRollbar,
  rollbarConfig: {},
}));

// Mock store
vi.mock("../../../lib/store", () => ({
  useStatusStore: {
    getState: () => ({
      connectionState: "connected",
      connected: true,
    }),
  },
}));

// Mock Device
vi.mock("@capacitor/device", () => ({
  Device: {
    getInfo: vi.fn().mockResolvedValue({
      model: "iPhone 14",
      osVersion: "16.0",
      manufacturer: "Apple",
      isVirtual: false,
    }),
  },
}));

// Mock import.meta.env for production mode with token
vi.stubEnv("PROD", true);
vi.stubEnv("VITE_ROLLBAR_ACCESS_TOKEN", "test-token");

// Logger uses 60 second throttle window - we need to advance past it
const THROTTLE_WINDOW_MS = 60_000;
const PAST_THROTTLE_WINDOW_MS = THROTTLE_WINDOW_MS + 1_000;

describe("Logger Rate Limiting", () => {
  let logger: typeof import("../../../lib/logger").logger;
  let rollbarPromise: typeof import("../../../lib/logger").rollbarPromise;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();

    // Re-import after resetting modules to get fresh state
    const loggerModule = await import("../../../lib/logger");

    logger = loggerModule.logger;
    rollbarPromise = loggerModule.rollbarPromise;

    // Wait for rollbar to be loaded
    await rollbarPromise;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should report the first error", () => {
    logger.error("Test error", { category: "general", action: "test" });

    expect(mockRollbar.error).toHaveBeenCalledTimes(1);
  });

  it("should throttle duplicate errors within the same minute", () => {
    const metadata = { category: "nfc" as const, action: "write" };

    // First call should go through
    logger.error("NFC error", { ...metadata });
    expect(mockRollbar.error).toHaveBeenCalledTimes(1);

    // Same fingerprint within 1 minute should be throttled
    logger.error("NFC error", { ...metadata });
    logger.error("NFC error", { ...metadata });
    expect(mockRollbar.error).toHaveBeenCalledTimes(1);
  });

  it("should allow different error fingerprints", () => {
    logger.error("Error 1", { category: "nfc" as const, action: "write" });
    logger.error("Error 2", { category: "api" as const, action: "fetch" });
    logger.error("Error 3", { category: "storage" as const, action: "save" });

    expect(mockRollbar.error).toHaveBeenCalledTimes(3);
  });

  it("should enforce global limit of 10 errors per minute", () => {
    // Generate 15 unique errors
    for (let i = 0; i < 15; i++) {
      logger.error(`Error ${i}`, {
        category: "general" as const,
        action: `action${i}`,
      });
    }

    // Only 10 should be reported
    expect(mockRollbar.error).toHaveBeenCalledTimes(10);
  });

  it("should reset rate limits after 1 minute", () => {
    // Fill up the global limit
    for (let i = 0; i < 10; i++) {
      logger.error(`Error ${i}`, {
        category: "general" as const,
        action: `action${i}`,
      });
    }
    expect(mockRollbar.error).toHaveBeenCalledTimes(10);

    // This should be throttled
    logger.error("Error 11", {
      category: "general" as const,
      action: "action11",
    });
    expect(mockRollbar.error).toHaveBeenCalledTimes(10);

    // Advance time past the throttle window
    vi.advanceTimersByTime(PAST_THROTTLE_WINDOW_MS);

    // Now this should go through
    logger.error("Error after reset", {
      category: "general" as const,
      action: "actionNew",
    });
    expect(mockRollbar.error).toHaveBeenCalledTimes(11);
  });

  it("should allow same fingerprint after throttle window expires", () => {
    const metadata = { category: "nfc" as const, action: "write" };

    // First call
    logger.error("NFC error", { ...metadata });
    expect(mockRollbar.error).toHaveBeenCalledTimes(1);

    // Throttled
    logger.error("NFC error", { ...metadata });
    expect(mockRollbar.error).toHaveBeenCalledTimes(1);

    // Advance past throttle window
    vi.advanceTimersByTime(PAST_THROTTLE_WINDOW_MS);

    // Should now go through
    logger.error("NFC error", { ...metadata });
    expect(mockRollbar.error).toHaveBeenCalledTimes(2);
  });

  it("should use correct severity method on rollbar", () => {
    logger.error("Critical error", {
      category: "general" as const,
      severity: "critical",
    });
    expect(mockRollbar.critical).toHaveBeenCalledTimes(1);

    logger.error("Warning", {
      category: "general" as const,
      severity: "warning",
      action: "warn",
    });
    expect(mockRollbar.warning).toHaveBeenCalledTimes(1);

    logger.error("Info", {
      category: "general" as const,
      severity: "info",
      action: "info",
    });
    expect(mockRollbar.info).toHaveBeenCalledTimes(1);
  });

  it("should include base context in error reports", () => {
    logger.error("Test error", { category: "nfc" as const, action: "test" });

    expect(mockRollbar.error).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        platform: "ios",
        category: "nfc",
        action: "test",
      }),
    );
  });
});
