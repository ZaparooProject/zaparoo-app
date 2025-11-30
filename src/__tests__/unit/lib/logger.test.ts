import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock rollbar before importing logger
vi.mock("../../../lib/rollbar", () => ({
  isRollbarEnabled: true,
  rollbar: {
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    critical: vi.fn()
  }
}));

// Mock store
vi.mock("../../../lib/store", () => ({
  useStatusStore: {
    getState: () => ({
      connectionState: "connected",
      connected: true
    })
  }
}));

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => "ios",
    isNativePlatform: () => true
  }
}));

// Mock Device
vi.mock("@capacitor/device", () => ({
  Device: {
    getInfo: vi.fn().mockResolvedValue({
      model: "iPhone 14",
      osVersion: "16.0",
      manufacturer: "Apple",
      isVirtual: false
    })
  }
}));

describe("Logger Rate Limiting", () => {
  let logger: typeof import("../../../lib/logger").logger;
  let rollbar: typeof import("../../../lib/rollbar").rollbar;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();

    // Re-import after resetting modules to get fresh state
    const loggerModule = await import("../../../lib/logger");
    const rollbarModule = await import("../../../lib/rollbar");

    logger = loggerModule.logger;
    rollbar = rollbarModule.rollbar;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should report the first error", () => {
    logger.error("Test error", { category: "general", action: "test" });

    expect(rollbar.error).toHaveBeenCalledTimes(1);
  });

  it("should throttle duplicate errors within the same minute", () => {
    const metadata = { category: "nfc" as const, action: "write" };

    // First call should go through
    logger.error("NFC error", { ...metadata });
    expect(rollbar.error).toHaveBeenCalledTimes(1);

    // Same fingerprint within 1 minute should be throttled
    logger.error("NFC error", { ...metadata });
    logger.error("NFC error", { ...metadata });
    expect(rollbar.error).toHaveBeenCalledTimes(1);
  });

  it("should allow different error fingerprints", () => {
    logger.error("Error 1", { category: "nfc" as const, action: "write" });
    logger.error("Error 2", { category: "api" as const, action: "fetch" });
    logger.error("Error 3", { category: "storage" as const, action: "save" });

    expect(rollbar.error).toHaveBeenCalledTimes(3);
  });

  it("should enforce global limit of 10 errors per minute", () => {
    // Generate 15 unique errors
    for (let i = 0; i < 15; i++) {
      logger.error(`Error ${i}`, { category: "general" as const, action: `action${i}` });
    }

    // Only 10 should be reported
    expect(rollbar.error).toHaveBeenCalledTimes(10);
  });

  it("should reset rate limits after 1 minute", () => {
    // Fill up the global limit
    for (let i = 0; i < 10; i++) {
      logger.error(`Error ${i}`, { category: "general" as const, action: `action${i}` });
    }
    expect(rollbar.error).toHaveBeenCalledTimes(10);

    // This should be throttled
    logger.error("Error 11", { category: "general" as const, action: "action11" });
    expect(rollbar.error).toHaveBeenCalledTimes(10);

    // Advance time by 61 seconds
    vi.advanceTimersByTime(61_000);

    // Now this should go through
    logger.error("Error after reset", { category: "general" as const, action: "actionNew" });
    expect(rollbar.error).toHaveBeenCalledTimes(11);
  });

  it("should allow same fingerprint after throttle window expires", () => {
    const metadata = { category: "nfc" as const, action: "write" };

    // First call
    logger.error("NFC error", { ...metadata });
    expect(rollbar.error).toHaveBeenCalledTimes(1);

    // Throttled
    logger.error("NFC error", { ...metadata });
    expect(rollbar.error).toHaveBeenCalledTimes(1);

    // Advance past throttle window
    vi.advanceTimersByTime(61_000);

    // Should now go through
    logger.error("NFC error", { ...metadata });
    expect(rollbar.error).toHaveBeenCalledTimes(2);
  });

  it("should use correct severity method on rollbar", async () => {
    const rollbarModule = await import("../../../lib/rollbar");

    logger.error("Critical error", { category: "general" as const, severity: "critical" });
    expect(rollbarModule.rollbar.critical).toHaveBeenCalledTimes(1);

    logger.error("Warning", { category: "general" as const, severity: "warning", action: "warn" });
    expect(rollbarModule.rollbar.warning).toHaveBeenCalledTimes(1);

    logger.error("Info", { category: "general" as const, severity: "info", action: "info" });
    expect(rollbarModule.rollbar.info).toHaveBeenCalledTimes(1);
  });

  it("should include base context in error reports", () => {
    logger.error("Test error", { category: "nfc" as const, action: "test" });

    expect(rollbar.error).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        platform: "ios",
        category: "nfc",
        action: "test"
      })
    );
  });
});
