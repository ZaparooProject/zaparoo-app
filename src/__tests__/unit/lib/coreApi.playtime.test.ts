/**
 * Unit tests for CoreAPI playtime methods and utility functions
 *
 * Tests the playtime-related API methods and other utility functions
 * that were missing coverage.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CoreAPI } from "@/lib/coreApi";

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
}));

describe("CoreAPI playtime methods", () => {
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSend = vi.fn();
    CoreAPI.setSend(
      mockSend as (msg: Parameters<WebSocket["send"]>[0]) => void,
    );
    CoreAPI.setWsInstance({ isConnected: true, send: mockSend } as any);
    vi.clearAllMocks();
  });

  describe("playtime()", () => {
    it("should send playtime request with correct JSON-RPC format", () => {
      CoreAPI.playtime().catch(() => {
        // Ignore timeout errors
      });

      expect(mockSend).toHaveBeenCalledOnce();
      const sentData = JSON.parse(mockSend.mock.calls[0]![0] as string);
      expect(sentData.jsonrpc).toBe("2.0");
      expect(sentData.method).toBe("playtime");
      expect(sentData.id).toBeDefined();
      expect(sentData.timestamp).toBeDefined();
    });

    it("should reject on timeout", async () => {
      vi.useFakeTimers();
      const promise = CoreAPI.playtime();
      vi.advanceTimersByTime(30000);
      await expect(promise).rejects.toThrow("Request timeout");
      vi.clearAllTimers();
      vi.useRealTimers();
    });
  });

  describe("playtimeLimits()", () => {
    it("should send settings.playtime.limits request with correct JSON-RPC format", () => {
      CoreAPI.playtimeLimits().catch(() => {
        // Ignore timeout errors
      });

      expect(mockSend).toHaveBeenCalledOnce();
      const sentData = JSON.parse(mockSend.mock.calls[0]![0] as string);
      expect(sentData.jsonrpc).toBe("2.0");
      expect(sentData.method).toBe("settings.playtime.limits");
      expect(sentData.id).toBeDefined();
    });
  });

  describe("playtimeLimitsUpdate()", () => {
    it("should send settings.playtime.limits.update request with params", () => {
      const params = {
        enabled: true,
        dailyLimit: "3h",
        sessionLimit: "1h30m",
      };

      CoreAPI.playtimeLimitsUpdate(params).catch(() => {
        // Ignore timeout errors
      });

      expect(mockSend).toHaveBeenCalledOnce();
      const sentData = JSON.parse(mockSend.mock.calls[0]![0] as string);
      expect(sentData.jsonrpc).toBe("2.0");
      expect(sentData.method).toBe("settings.playtime.limits.update");
      expect(sentData.params).toEqual(params);
    });

    it("should send only provided params", () => {
      CoreAPI.playtimeLimitsUpdate({ enabled: false }).catch(() => {
        // Ignore timeout errors
      });

      const sentData = JSON.parse(mockSend.mock.calls[0]![0] as string);
      expect(sentData.params).toEqual({ enabled: false });
    });
  });
});

describe("CoreAPI utility methods", () => {
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSend = vi.fn();
    CoreAPI.setSend(
      mockSend as (msg: Parameters<WebSocket["send"]>[0]) => void,
    );
    CoreAPI.setWsInstance({ isConnected: true, send: mockSend } as any);
    vi.clearAllMocks();
  });

  describe("hasWriteCapableReader()", () => {
    it("should send readers request", () => {
      CoreAPI.hasWriteCapableReader().catch(() => {
        // Ignore errors - we just want to test it sends the request
      });

      expect(mockSend).toHaveBeenCalledOnce();
      const sentData = JSON.parse(mockSend.mock.calls[0]![0] as string);
      expect(sentData.method).toBe("readers");
    });
  });

  describe("launchersRefresh()", () => {
    it("should send launchers.refresh request with correct JSON-RPC format", () => {
      CoreAPI.launchersRefresh().catch(() => {
        // Ignore timeout errors
      });

      expect(mockSend).toHaveBeenCalledOnce();
      const sentData = JSON.parse(mockSend.mock.calls[0]![0] as string);
      expect(sentData.jsonrpc).toBe("2.0");
      expect(sentData.method).toBe("launchers.refresh");
      expect(sentData.id).toBeDefined();
    });
  });

  describe("settingsLogsDownload()", () => {
    it("should send settings.logs.download request with correct JSON-RPC format", () => {
      CoreAPI.settingsLogsDownload().catch(() => {
        // Ignore timeout errors
      });

      expect(mockSend).toHaveBeenCalledOnce();
      const sentData = JSON.parse(mockSend.mock.calls[0]![0] as string);
      expect(sentData.jsonrpc).toBe("2.0");
      expect(sentData.method).toBe("settings.logs.download");
      expect(sentData.id).toBeDefined();
    });
  });

  describe("isConnected()", () => {
    it("should return true when transport is connected", () => {
      CoreAPI.setWsInstance({ isConnected: true, send: mockSend } as any);
      expect(CoreAPI.isConnected()).toBe(true);
    });

    it("should return false when transport is not connected", () => {
      CoreAPI.setWsInstance({ isConnected: false, send: mockSend } as any);
      expect(CoreAPI.isConnected()).toBe(false);
    });

    it("should return false when transport is null", () => {
      CoreAPI.reset();
      expect(CoreAPI.isConnected()).toBe(false);
    });
  });
});
