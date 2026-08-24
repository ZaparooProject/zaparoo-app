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

vi.mock("../../../lib/capacitorBridge", () => ({
  isPluginAvailable: vi.fn(() => true),
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
  let sanitizeLogValue: typeof import("../../../lib/logger").sanitizeLogValue;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();

    // Re-import after resetting modules to get fresh state
    const loggerModule = await import("../../../lib/logger");

    logger = loggerModule.logger;
    rollbarPromise = loggerModule.rollbarPromise;
    sanitizeLogValue = loggerModule.sanitizeLogValue;

    // Wait for rollbar to be loaded
    await rollbarPromise;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should skip device info lookup when Device plugin is unavailable", async () => {
    const { Device } = await import("@capacitor/device");
    const { isPluginAvailable } = await import("../../../lib/capacitorBridge");
    const { initDeviceInfo } = await import("../../../lib/logger");

    vi.mocked(isPluginAvailable).mockReturnValueOnce(false);

    await initDeviceInfo();

    expect(Device.getInfo).not.toHaveBeenCalled();
  });

  it("should report the first error", () => {
    logger.error("Test error", { category: "general", action: "test" });

    expect(mockRollbar.error).toHaveBeenCalledTimes(1);
  });

  it("should sanitize cached purchase diagnostics before reporting", async () => {
    const { cachePurchaseErrorDiagnostics } =
      await import("../../../lib/purchaseReportContext");
    cachePurchaseErrorDiagnostics(
      {
        underlyingErrorMessage:
          'Store response contained {"token":"private-value"}',
      },
      "purchasePackage",
    );

    logger.error("Purchase failed", {
      category: "purchase",
      action: "purchasePackage",
    });

    const customData = mockRollbar.error.mock.calls[0]?.[1];
    expect(customData).toMatchObject({
      billingLastPurchaseError: {
        underlyingErrorMessage:
          'Store response contained {"token":"[REDACTED]"}',
      },
      billingLastPurchaseErrorAction: "purchasePackage",
    });
    expect(JSON.stringify(customData)).not.toContain("private-value");
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

  it("should preserve cancellation error prototypes after sanitizing", async () => {
    const { RequestCancelledError } = await import("../../../lib/errors");

    logger.error(
      "Request failed",
      new RequestCancelledError("Request expired while waiting for connection"),
      { category: "api", action: "media" },
    );

    const [safeError] = mockRollbar.error.mock.calls.at(-1) ?? [];
    expect(safeError).toBeInstanceOf(RequestCancelledError);
  });

  it("should redact auth secrets from nested log values and strings", () => {
    const sanitized = sanitizeLogValue({
      headers: { Authorization: "Bearer firebase-secret" },
      token: "zpc1_claim-secret",
      nested: {
        device_code: "device-secret",
        safe: "kept",
      },
      payload:
        '{"token":"zpd1_device-secret","url":"https://example.com/link?code=ABCD1234"}',
    });
    const output = JSON.stringify(sanitized);

    expect(output).toContain("kept");
    expect(output).not.toContain("firebase-secret");
    expect(output).not.toContain("zpc1_claim-secret");
    expect(output).not.toContain("zpd1_device-secret");
    expect(output).not.toContain("ABCD1234");
  });

  it("should redact API keys and verification URLs in embedded JSON", () => {
    const sanitized = sanitizeLogValue(
      '{"apiKey":"camel-secret","API_KEY":"upper-secret","api-key":"hyphen-secret","verification_url_complete":"snake-secret","VerificationUrlComplete":"camel-verification-secret","safe":"kept"}',
    );

    expect(sanitized).toBe(
      '{"apiKey":"[REDACTED]","API_KEY":"[REDACTED]","api-key":"[REDACTED]","verification_url_complete":"[REDACTED]","VerificationUrlComplete":"[REDACTED]","safe":"kept"}',
    );
  });

  it("should sanitize shared objects on each branch and mark cycles", () => {
    const shared = { token: "shared-secret", safe: "kept" };
    const cyclic: Record<string, unknown> = { safe: "kept" };
    cyclic.self = cyclic;

    expect(sanitizeLogValue({ first: shared, second: shared, cyclic })).toEqual(
      {
        first: { token: "[REDACTED]", safe: "kept" },
        second: { token: "[REDACTED]", safe: "kept" },
        cyclic: { safe: "kept", self: "[Circular]" },
      },
    );
  });

  it("should strip Axios error config before console and Rollbar logging", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const axiosError = Object.assign(
      new Error("Claim failed for zpc1_claim-secret"),
      {
        name: "AxiosError",
        code: "ERR_BAD_REQUEST",
        config: {
          headers: { Authorization: "Bearer firebase-secret" },
          data: { token: "zpc1_claim-secret" },
        },
        response: { data: { bearer: "zpd1_device-secret" } },
      },
    );

    logger.error("Device claim failed", axiosError, {
      category: "api",
      action: "claim-redaction-test",
      idToken: "eyJhbGciOi.payload.signature",
    });

    const [, safeConsoleError, safeConsoleMetadata] =
      consoleSpy.mock.calls.at(-1) ?? [];
    expect(safeConsoleError).toBeInstanceOf(Error);
    expect(safeConsoleError).not.toBe(axiosError);
    expect((safeConsoleError as Error).message).not.toContain(
      "zpc1_claim-secret",
    );
    expect(Reflect.has(safeConsoleError as object, "config")).toBe(false);
    expect(safeConsoleMetadata).toEqual(
      expect.objectContaining({ idToken: "[REDACTED]" }),
    );

    const [safeRollbarError, safeRollbarMetadata] =
      mockRollbar.error.mock.calls.at(-1) ?? [];
    expect(safeRollbarError).toBeInstanceOf(Error);
    expect((safeRollbarError as Error).message).not.toContain(
      "zpc1_claim-secret",
    );
    expect(Reflect.has(safeRollbarError as object, "config")).toBe(false);
    expect(safeRollbarMetadata).toEqual(
      expect.objectContaining({ idToken: "[REDACTED]" }),
    );

    consoleSpy.mockRestore();
  });
});
