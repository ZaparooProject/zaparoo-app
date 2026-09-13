import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CoreAPI,
  CoreApiError,
  MalformedCoreResponseError,
  getRunErrorCategory,
  isExpectedMediaDatabaseError,
  isExpectedRunError,
  isIndexResponse,
  isMediaOperationConflictError,
  isMissingMediaDatabaseSetupError,
  isUnsupportedCoreApiError,
  isUnindexedMediaError,
  isUnsupportedMediaApiError,
} from "@/lib/coreApi";
import { logger } from "@/lib/logger";
import { Method, Notification } from "@/lib/models.ts";

// Mock Capacitor
vi.mock("@capacitor/core");

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

  it("should only match canonical message-based unsupported-method errors", () => {
    expect(isUnsupportedCoreApiError("Method not found: media.tags")).toBe(
      true,
    );
    expect(isUnsupportedCoreApiError("JSON-RPC error: Method not found")).toBe(
      true,
    );
    expect(
      isUnsupportedCoreApiError(
        "Request failed because method not found in cached metadata",
      ),
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

  it.each([
    "scraping is in progress",
    "scraping already in progress",
    "media indexing is in progress",
    "indexing already in progress",
    "database optimization in progress",
    "selective indexing cannot be performed while database optimization is running",
  ])("should classify media operation conflict: %s", (message) => {
    const error = new Error(message);

    expect(isMediaOperationConflictError(error)).toBe(true);
    expect(isExpectedMediaDatabaseError(error)).toBe(true);
  });

  it("should classify insufficient disk space for indexing as expected", () => {
    expect(
      isExpectedMediaDatabaseError(
        new CoreApiError(
          "insufficient disk space for indexing: 42 MB free, need at least 500 MB",
          1,
        ),
      ),
    ).toBe(true);
  });

  it.each([
    "media not found: SNES/Games/Mario.sfc",
    "media not found: mediaId 42",
    "system not found: PC",
  ])("should classify %j as unindexed media", (message) => {
    expect(isUnindexedMediaError(new CoreApiError(message, 1))).toBe(true);
  });

  it("should not classify other media failures as unindexed media", () => {
    expect(
      isUnindexedMediaError(new CoreApiError("failed to resolve system", 1)),
    ).toBe(false);
  });

  it("should accept current Core index status fields", () => {
    expect(
      isIndexResponse({
        exists: true,
        indexing: true,
        optimizing: false,
        paused: false,
        throttled: true,
        missingMedia: 3,
      }),
    ).toBe(true);
  });
});

describe("run error classification", () => {
  it.each([
    "busy",
    "media_not_found",
    "disabled",
    "invalid_script",
    "blocked",
    "playtime_limit",
    "cancelled",
    "unavailable",
  ])("should treat the %s run category as expected", (category) => {
    const error = new CoreApiError("any message", 1, { category });

    expect(getRunErrorCategory(error)).toBe(category);
    expect(isExpectedRunError(error)).toBe(true);
  });

  it.each(["execution_failed", "timeout", "some_future_category"])(
    "should keep the %s run category reportable",
    (category) => {
      const error = new CoreApiError("any message", 1, { category });

      expect(getRunErrorCategory(error)).toBe(category);
      expect(isExpectedRunError(error)).toBe(false);
    },
  );

  it.each([
    ["ZapScript is invalid", "invalid_script"],
    ["ZapScript execution is disabled", "disabled"],
    ["ZapScript execution was blocked", "blocked"],
    ["media not found", "media_not_found"],
    ["a script is already running", "busy"],
    ["another launch is in progress", "busy"],
    ["playtime limit reached", "playtime_limit"],
    [
      "zapscript exceeds maximum length: 9000 bytes (max 8192)",
      "invalid_script",
    ],
    ["ZapScript execution failed", "execution_failed"],
  ])(
    "should classify uncategorized Core message %j as %s",
    (message, category) => {
      expect(getRunErrorCategory(new CoreApiError(message, 1))).toBe(category);
    },
  );

  it("should not classify errors that did not come from Core", () => {
    expect(getRunErrorCategory(new Error("media not found"))).toBeNull();
    expect(isExpectedRunError(new Error("ZapScript is invalid"))).toBe(false);
  });

  it("should not classify unknown uncategorized Core errors", () => {
    const error = new CoreApiError("database is locked", 1);

    expect(getRunErrorCategory(error)).toBeNull();
    expect(isExpectedRunError(error)).toBe(false);
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
  });

  afterEach(() => {
    vi.useRealTimers();
    // Clear any pending promises/timeouts
    vi.clearAllTimers();
    vi.restoreAllMocks();
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

  it.each([
    ["inbox", () => CoreAPI.inbox()],
    ["readers", () => CoreAPI.readers()],
    ["playtime", () => CoreAPI.playtime()],
    ["settings.playtime.limits", () => CoreAPI.playtimeLimits()],
  ] as const)(
    "should not report unsupported %s responses as errors",
    async (method, apiCall) => {
      const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
      const promise = apiCall();
      const request = JSON.parse(mockSend.mock.calls[0][0]);
      expect(request.method).toBe(method);

      await CoreAPI.processReceived({
        data: JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32601, message: "Method not found" },
        }),
      } as MessageEvent);

      await expect(promise).rejects.toThrow("Method not found");
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    },
  );

  it("should report unexpected inbox failures as errors", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const promise = CoreAPI.inbox();
    const request = JSON.parse(mockSend.mock.calls[0][0]);

    await CoreAPI.processReceived({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32000, message: "database is locked" },
      }),
    } as MessageEvent);

    await expect(promise).rejects.toThrow("database is locked");
    expect(errorSpy).toHaveBeenCalledWith(
      "Inbox API call failed:",
      expect.any(Error),
      expect.objectContaining({ action: "inbox.fetch", severity: "error" }),
    );
  });

  it("should treat unsupported readers as no remote writer without reporting", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    const promise = CoreAPI.hasWriteCapableReader();
    const request = JSON.parse(mockSend.mock.calls[0][0]);

    await CoreAPI.processReceived({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32601, message: "Method not found" },
      }),
    } as MessageEvent);

    await expect(promise).resolves.toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("should default missing media search result tags from older Cores", async () => {
    const searchPromise = CoreAPI.mediaSearch({ query: "mario", systems: [] });
    const request = JSON.parse(mockSend.mock.calls[0][0]);

    CoreAPI.processReceived({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          results: [
            {
              system: { id: "SNES", name: "Super Nintendo" },
              name: "Super Mario World",
              path: "/games/snes/Super Mario World.sfc",
            },
            {
              system: { id: "NES", name: "Nintendo" },
              name: "Super Mario Bros.",
              path: "/games/nes/Super Mario Bros.nes",
              tags: null,
            },
            {
              system: { id: "SNES", name: "Super Nintendo" },
              name: "Super Mario Kart",
              path: "/games/snes/Super Mario Kart.sfc",
              tags: [{ type: "genre", tag: "racing" }],
            },
          ],
          total: 3,
        },
      }),
    } as MessageEvent).catch(() => undefined);

    const response = await searchPromise;
    expect(response.results.map((result) => result.tags)).toEqual([
      [],
      [],
      [{ type: "genre", tag: "racing" }],
    ]);
    expect(response.total).toBe(3);
  });

  it("should default a null media search result list to empty", async () => {
    const searchPromise = CoreAPI.mediaSearch({ query: "none", systems: [] });
    const request = JSON.parse(mockSend.mock.calls[0][0]);

    CoreAPI.processReceived({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result: { results: null, total: 0 },
      }),
    } as MessageEvent).catch(() => undefined);

    await expect(searchPromise).resolves.toEqual({ results: [], total: 0 });
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
});
