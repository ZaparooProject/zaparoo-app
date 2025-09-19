import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CoreAPI } from "../../lib/coreApi";
import { Method, Notification } from "../../lib/models";

const mockSend = vi.fn();

describe("CoreAPI - Comprehensive API Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CoreAPI.setSend(mockSend);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  describe("Method Enum Validation", () => {
    it("should have all required API methods from Core API", () => {
      // Core API documented methods
      const expectedMethods = [
        "run",
        "stop",
        "tokens",
        "tokens.history",
        "media",
        "media.search",
        "media.generate",
        "media.active",
        "media.active.update",
        "systems",
        "settings",
        "settings.update",
        "settings.reload",
        "mappings",
        "mappings.new",
        "mappings.delete",
        "mappings.update",
        "mappings.reload",
        "readers.write",
        "readers.write.cancel",
        "version"
      ];

      expectedMethods.forEach(method => {
        expect(Object.values(Method)).toContain(method);
      });
    });

    it("should NOT have deprecated methods", () => {
      // These methods should be removed as they're deprecated
      const deprecatedMethods = [
        "launch", // deprecated, use "run" instead
        "media.index" // deprecated, use "media.generate" instead
      ];

      deprecatedMethods.forEach(method => {
        expect(Object.values(Method)).not.toContain(method);
      });
    });

    it("should NOT have unsupported methods", () => {
      // These methods should not exist as they're not in Core API
      const unsupportedMethods = [
        "clients",
        "run.script"
      ];

      unsupportedMethods.forEach(method => {
        expect(Object.values(Method)).not.toContain(method);
      });
    });
  });

  describe("CoreAPI Method Availability", () => {
    it("should have all public methods available", () => {
      const requiredMethods = [
        "version",
        "run",
        "stop",
        "tokens",
        "history", // tokens.history
        "media",
        "mediaSearch",
        "mediaGenerate",
        "mediaActive",
        "mediaActiveUpdate",
        "systems",
        "settings",
        "settingsUpdate",
        "settingsReload",
        "mappings",
        "newMapping",
        "updateMapping",
        "deleteMapping",
        "mappingsReload",
        "write", // readers.write
        "readersWriteCancel"
      ];

      requiredMethods.forEach(method => {
        expect(typeof (CoreAPI as any)[method]).toBe("function");
      });
    });

    it("should NOT have deprecated methods", () => {
      const deprecatedMethods = [
        "launch",
        "mediaIndex"
      ];

      deprecatedMethods.forEach(method => {
        expect((CoreAPI as any)[method]).toBeUndefined();
      });
    });
  });

  describe("API Method Parameters and Return Types", () => {
    it("run method should send correct JSON-RPC format", () => {
      // Test parameter validation without async complexity
      CoreAPI.run({ text: "**launch.system:snes" }).catch(() => {});

      expect(mockSend).toHaveBeenCalledWith(
        expect.stringContaining('"method":"run"')
      );

      const sentData = JSON.parse(mockSend.mock.calls[0][0]);
      expect(sentData.params).toEqual({ text: "**launch.system:snes" });
    });

    it("mediaGenerate should send correct JSON-RPC format", () => {
      CoreAPI.mediaGenerate({ systems: ["snes"] }).catch(() => {});

      expect(mockSend).toHaveBeenCalledWith(
        expect.stringContaining('"method":"media.generate"')
      );

      const sentData = JSON.parse(mockSend.mock.calls[0][0]);
      expect(sentData.params).toEqual({ systems: ["snes"] });
    });

    it("settings should send correct JSON-RPC format", () => {
      CoreAPI.settings().catch(() => {});

      expect(mockSend).toHaveBeenCalledWith(
        expect.stringContaining('"method":"settings"')
      );

      const sentData = JSON.parse(mockSend.mock.calls[0][0]);
      expect(sentData.method).toBe("settings");
    });
  });

  describe("Error Handling", () => {
    it("should handle timeout errors", async () => {
      const promise = CoreAPI.version();

      // Fast-forward time to trigger timeout
      vi.advanceTimersByTime(30000);

      await expect(promise).rejects.toThrow("Request timeout");
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
          scanTime: "2024-09-24T17:49:42.938167429+08:00"
        }
      };

      const messageEvent = new MessageEvent("message", {
        data: JSON.stringify(notificationData)
      });

      const result = await CoreAPI.processReceived(messageEvent);

      expect(result).toEqual({
        method: "tokens.added",
        params: notificationData.params
      });
    });
  });
});