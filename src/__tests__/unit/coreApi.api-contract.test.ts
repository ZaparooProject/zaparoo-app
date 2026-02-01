import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CoreAPI } from "../../lib/coreApi";
import { LaunchRequest, HistoryResponseEntry } from "../../lib/models";

/**
 * Helper to simulate API response for CoreAPI tests.
 */
function simulateResponse(
  mockSend: ReturnType<typeof vi.fn>,
  result: unknown,
  callIndex: number = 0,
) {
  queueMicrotask(() => {
    if (mockSend.mock.calls[callIndex]) {
      const request = JSON.parse(mockSend.mock.calls[callIndex]![0]);
      const response = {
        jsonrpc: "2.0",
        id: request.id,
        result,
      };
      CoreAPI.processReceived({
        data: JSON.stringify(response),
      } as MessageEvent);
    }
  });
}

const mockSend = vi.fn();

describe("CoreAPI API Contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CoreAPI.setSend(mockSend);
    // Mock WebSocket connection as connected so requests are sent immediately
    CoreAPI.setWsInstance({ isConnected: true, send: mockSend } as any);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  describe("API Method Parameters and Return Types", () => {
    it("run method should send correct JSON-RPC format", () => {
      // Test parameter validation without async complexity
      CoreAPI.run({ text: "**launch.system:snes" }).catch(() => {});

      expect(mockSend).toHaveBeenCalledWith(
        expect.stringContaining('"method":"run"'),
      );

      const sentData = JSON.parse(mockSend.mock.calls[0]![0]);
      expect(sentData.params).toEqual({ text: "**launch.system:snes" });
    });

    it("mediaGenerate should send correct JSON-RPC format", () => {
      CoreAPI.mediaGenerate({ systems: ["snes"] }).catch(() => {});

      expect(mockSend).toHaveBeenCalledWith(
        expect.stringContaining('"method":"media.generate"'),
      );

      const sentData = JSON.parse(mockSend.mock.calls[0]![0]);
      expect(sentData.params).toEqual({ systems: ["snes"] });
    });

    it("settings should send correct JSON-RPC format", () => {
      CoreAPI.settings().catch(() => {});

      expect(mockSend).toHaveBeenCalledWith(
        expect.stringContaining('"method":"settings"'),
      );

      const sentData = JSON.parse(mockSend.mock.calls[0]![0]);
      expect(sentData.method).toBe("settings");
    });
  });

  describe("Error Handling", () => {
    it("should handle timeout errors", async () => {
      vi.useFakeTimers();

      const promise = CoreAPI.version();

      // Fast-forward time to trigger timeout
      vi.advanceTimersByTime(30000);

      await expect(promise).rejects.toThrow("Request timeout");

      // Clean up any remaining timers
      vi.clearAllTimers();
      vi.useRealTimers();
    });
  });

  describe("Notification Processing", () => {
    it("should process notifications correctly", async () => {
      const notificationData = {
        jsonrpc: "2.0",
        method: "tokens.added",
        params: {
          type: "nfc",
          uid: "12345",
          text: "test",
          data: "abcdef",
          scanTime: "2024-09-24T17:49:42.938167429+08:00",
        },
      };

      const messageEvent = new MessageEvent("message", {
        data: JSON.stringify(notificationData),
      });

      const result = await CoreAPI.processReceived(messageEvent);

      expect(result).toEqual({
        method: "tokens.added",
        params: notificationData.params,
      });
    });
  });

  describe("Run Parameter Flexibility", () => {
    it("should allow launching with only text parameter", () => {
      const textOnlyRequest: LaunchRequest = {
        text: "**launch.system:snes",
      };

      CoreAPI.run(textOnlyRequest).catch(() => {});

      expect(mockSend).toHaveBeenCalledOnce();
      const sentData = JSON.parse(mockSend.mock.calls[0]![0]);
      expect(sentData.params).toEqual({
        text: "**launch.system:snes",
      });
    });

    it("should allow launching with type parameter from zaparoo-core API", () => {
      const requestWithType: LaunchRequest = {
        type: "nfc",
        text: "**launch.system:snes",
      };

      CoreAPI.run(requestWithType).catch(() => {});

      expect(mockSend).toHaveBeenCalledOnce();
      const sentData = JSON.parse(mockSend.mock.calls[0]![0]);
      expect(sentData.params).toEqual({
        type: "nfc",
        text: "**launch.system:snes",
      });
    });
  });

  describe("History API Response", () => {
    it("should handle history response with complete data fields", async () => {
      const historyResponse = {
        entries: [
          {
            time: "2024-09-24T17:49:42.938167429+08:00",
            type: "nfc",
            uid: "abc123",
            text: "**launch.system:snes",
            data: "04a1b2c3",
            success: true,
          },
        ],
      };

      const resultPromise = CoreAPI.history();
      simulateResponse(mockSend, historyResponse);

      const result = await resultPromise;
      const entry: HistoryResponseEntry = result.entries[0]!;

      expect(entry.type).toBe("nfc");
      expect(entry.data).toBe("04a1b2c3");
      expect(entry.time).toBe("2024-09-24T17:49:42.938167429+08:00");
      expect(entry.uid).toBe("abc123");
      expect(entry.text).toBe("**launch.system:snes");
      expect(entry.success).toBe(true);
    });
  });

  describe("Additional Method JSON-RPC Format", () => {
    it("mappingsReload should send correct JSON-RPC format", () => {
      CoreAPI.mappingsReload().catch(() => {});

      expect(mockSend).toHaveBeenCalledOnce();
      const sentData = JSON.parse(mockSend.mock.calls[0]![0]);
      expect(sentData.jsonrpc).toBe("2.0");
      expect(sentData.method).toBe("mappings.reload");
      expect(sentData.id).toBeDefined();
    });

    it("mediaActiveUpdate should send correct JSON-RPC format", () => {
      const params = {
        systemId: "test-system",
        mediaPath: "/path/to/media",
        mediaName: "Test Media",
      };

      CoreAPI.mediaActiveUpdate(params).catch(() => {});

      expect(mockSend).toHaveBeenCalledOnce();
      expect(mockSend).toHaveBeenCalledWith(
        expect.stringContaining('"method":"media.active.update"'),
      );
    });
  });
});
