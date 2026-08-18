import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CoreAPI, MalformedCoreResponseError } from "../../lib/coreApi";
import { Method } from "../../lib/models";

const mockSend = vi.fn();

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
}));

describe("CoreAPI Internals", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock WebSocket connection as connected so requests are sent immediately
    CoreAPI.setWsInstance({ isConnected: true, send: mockSend } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("setSend edge cases", () => {
    it("should not throw when setting invalid send function", () => {
      // Should not throw, just log error
      expect(() => CoreAPI.setSend(null as any)).not.toThrow();
    });

    it("should throw when send function errors during API call", async () => {
      // Set up a send function that throws
      CoreAPI.setSend(() => {
        throw new Error("Send failed");
      });

      // Test that calling an API method handles the send error
      await expect(CoreAPI.version()).rejects.toThrow(
        /Failed to send request.*Send failed/,
      );
    });
  });

  describe("processReceived error handling", () => {
    it("should reject invalid JSON-RPC version", async () => {
      const response = { jsonrpc: "1.0", id: "test-id", result: "test" };
      const messageEvent = new MessageEvent("message", {
        data: JSON.stringify(response),
      });

      await expect(CoreAPI.processReceived(messageEvent)).rejects.toThrow(
        "Not a valid JSON-RPC payload.",
      );
    });

    it("should classify malformed JSON as a recoverable Core response error", async () => {
      const messageEvent = new MessageEvent("message", {
        data: '{"jsonrpc":"2.0","result":',
      });

      await expect(
        CoreAPI.processReceived(messageEvent),
      ).rejects.toBeInstanceOf(MalformedCoreResponseError);
    });

    it("should process notifications and return method/params", async () => {
      const notification = {
        jsonrpc: "2.0",
        method: "test.notification",
        params: { test: "data" },
      };
      const messageEvent = new MessageEvent("message", {
        data: JSON.stringify(notification),
      });

      const result = await CoreAPI.processReceived(messageEvent);

      expect(result).toEqual({
        method: "test.notification",
        params: { test: "data" },
      });
    });

    it("should return null for unknown request IDs", async () => {
      const response = { jsonrpc: "2.0", id: "unknown-id", result: "test" };
      const messageEvent = new MessageEvent("message", {
        data: JSON.stringify(response),
      });

      const result = await CoreAPI.processReceived(messageEvent);

      expect(result).toBeNull();
    });
  });

  describe("API method error paths", () => {
    it("should propagate version method processing errors", async () => {
      // Mock call to return a response, but then make the response processing throw
      vi.spyOn(CoreAPI, "call").mockImplementation(() => {
        return Promise.resolve(null).then(() => {
          throw new Error("Response processing failed");
        });
      });

      await expect(CoreAPI.version()).rejects.toThrow(
        "Response processing failed",
      );
    });

    it("should propagate systems method call errors", async () => {
      // Mock call to reject
      vi.spyOn(CoreAPI, "call").mockRejectedValue(new Error("Network error"));

      await expect(CoreAPI.systems()).rejects.toThrow("Network error");
    });

    it("should request all systems and filter virtual launchables", async () => {
      const callSpy = vi.spyOn(CoreAPI, "call").mockResolvedValue({
        systems: [
          { id: "snes", name: "Super Nintendo", mediaCount: 12 },
          {
            id: "virtual:steam",
            name: "Steam",
            zapScript: "**launch.system:steam",
          },
        ],
      });

      await expect(CoreAPI.systems({ all: true })).resolves.toEqual({
        systems: [{ id: "snes", name: "Super Nintendo", mediaCount: 12 }],
      });
      expect(callSpy).toHaveBeenCalledWith(Method.Systems, { all: true });
    });

    it.each([
      {
        name: "systems",
        property: "systems",
        call: () => CoreAPI.systems(),
      },
      {
        name: "scrapers",
        property: "scrapers",
        call: () => CoreAPI.scrapers(),
      },
      {
        name: "mappings",
        property: "mappings",
        call: () => CoreAPI.mappings(),
      },
    ])(
      "should reject malformed $name array responses",
      async ({ name, property, call }) => {
        vi.spyOn(CoreAPI, "call").mockResolvedValue({});

        await expect(call()).rejects.toThrow(
          `Invalid ${name} response: ${property} must be an array`,
        );
      },
    );

    it.each([
      {
        name: "systems",
        call: () => CoreAPI.systems(),
      },
      {
        name: "scrapers",
        call: () => CoreAPI.scrapers(),
      },
      {
        name: "mappings",
        call: () => CoreAPI.mappings(),
      },
    ])(
      "should reject malformed $name array entries",
      async ({ name, call }) => {
        vi.spyOn(CoreAPI, "call").mockResolvedValue({ [name]: [null] });

        await expect(call()).rejects.toThrow(
          `Invalid ${name} response: ${name}[0] is invalid`,
        );
      },
    );

    it("should reject media responses without a valid database state", async () => {
      vi.spyOn(CoreAPI, "call").mockResolvedValue({ active: [] });

      await expect(CoreAPI.media()).rejects.toThrow(
        "Invalid media response: database must include valid index fields",
      );
    });

    it.each([
      {
        name: "systems",
        call: () => CoreAPI.systems(),
      },
      {
        name: "scrapers",
        call: () => CoreAPI.scrapers(),
      },
      {
        name: "mappings",
        call: () => CoreAPI.mappings(),
      },
    ])(
      "should reject cancelled $name requests as typed errors",
      async ({ call }) => {
        vi.spyOn(CoreAPI, "call").mockResolvedValue({ cancelled: true });

        await expect(call()).rejects.toMatchObject({
          name: "RequestCancelledError",
        });
      },
    );

    it("should preserve cancelled media responses for reconnect handling", async () => {
      vi.spyOn(CoreAPI, "call").mockResolvedValue({ cancelled: true });

      await expect(CoreAPI.media()).resolves.toEqual({ cancelled: true });
    });

    it("should reject invalid optional media index fields", async () => {
      vi.spyOn(CoreAPI, "call").mockResolvedValue({
        database: {
          exists: true,
          indexing: true,
          currentStepDisplay: {},
        },
        active: [],
      });

      await expect(CoreAPI.media()).rejects.toThrow(
        "Invalid media response: database must include valid index fields",
      );
    });

    it.each([
      { property: "active", value: [null] },
      { property: "playlists", value: [null] },
    ])(
      "should reject malformed media $property entries",
      async ({ property, value }) => {
        vi.spyOn(CoreAPI, "call").mockResolvedValue({
          database: { exists: true, indexing: false },
          active: [],
          [property]: value,
        });

        await expect(CoreAPI.media()).rejects.toThrow(
          `Invalid media response: ${property}[0] is invalid`,
        );
      },
    );

    it("should normalize omitted active media to an empty array", async () => {
      vi.spyOn(CoreAPI, "call").mockResolvedValue({
        database: { exists: true, indexing: false },
      });

      await expect(CoreAPI.media()).resolves.toEqual({
        database: { exists: true, indexing: false },
        active: [],
      });
    });

    it.each([null, ""])(
      "should normalize legacy primary media slot %j",
      async (slot) => {
        vi.spyOn(CoreAPI, "call").mockResolvedValue({
          database: { exists: true, indexing: false },
          active: [
            {
              systemId: "snes",
              systemName: "Super Nintendo",
              mediaName: "Super Mario World",
              mediaPath: "/games/smw.sfc",
              slot,
            },
          ],
        });

        await expect(CoreAPI.media()).resolves.toMatchObject({
          active: [{ slot: "primary" }],
        });
      },
    );

    it("should normalize legacy mappings without read-only metadata", async () => {
      vi.spyOn(CoreAPI, "call").mockResolvedValue({
        mappings: [
          {
            id: "1",
            added: "2026-08-18T00:00:00Z",
            label: "Legacy mapping",
            enabled: true,
            type: "uid",
            match: "exact",
            pattern: "AABB",
            override: "@snes/game",
          },
        ],
      });

      await expect(CoreAPI.mappings()).resolves.toMatchObject({
        mappings: [{ source: "database", readOnly: false }],
      });
    });

    it.each([
      ["id", "uid"],
      ["value", "text"],
    ] as const)(
      "should normalize Core mapping type %s to %s",
      async (wireType, appType) => {
        vi.spyOn(CoreAPI, "call").mockResolvedValue({
          mappings: [
            {
              id: "1",
              added: "2026-08-18T00:00:00Z",
              label: "Current mapping",
              enabled: true,
              type: wireType,
              match: "exact",
              pattern: "AABB",
              override: "@snes/game",
              source: "database",
              readOnly: false,
            },
          ],
        });

        await expect(CoreAPI.mappings()).resolves.toMatchObject({
          mappings: [{ type: appType }],
        });
      },
    );

    it("should propagate settings method errors", async () => {
      // Mock call to throw error
      vi.spyOn(CoreAPI, "call").mockImplementation(() => {
        throw new Error("Processing error");
      });

      await expect(CoreAPI.settings()).rejects.toThrow("Processing error");
    });
  });

  describe("Additional method coverage", () => {
    beforeEach(() => {
      // Mock successful calls
      vi.spyOn(CoreAPI, "call").mockResolvedValue({});
    });

    it("should call settingsUpdate without throwing", async () => {
      const params = { setting1: "value1" };
      await expect(
        CoreAPI.settingsUpdate(params as any),
      ).resolves.not.toThrow();
    });

    it("should call newMapping without throwing", async () => {
      const params = { mapping: "test" };
      await expect(CoreAPI.newMapping(params as any)).resolves.not.toThrow();
    });

    it("should call updateMapping without throwing", async () => {
      const params = { id: 1, mapping: "updated" };
      await expect(CoreAPI.updateMapping(params as any)).resolves.not.toThrow();
    });

    it("should call deleteMapping without throwing", async () => {
      const params = { id: 1 };
      await expect(CoreAPI.deleteMapping(params)).resolves.not.toThrow();
    });
  });

  describe("Queue and network error handling", () => {
    it("should reject queued requests when flush fails", async () => {
      // Set up a disconnected state to queue requests
      CoreAPI.setWsInstance({ isConnected: false, send: mockSend } as any);

      // Queue a request
      const requestPromise = CoreAPI.version();

      // Now connect and mock send to fail during flush
      mockSend.mockImplementation(() => {
        throw new Error("Flush send failed");
      });

      CoreAPI.setWsInstance({ isConnected: true, send: mockSend } as any);

      // The queued request should be rejected
      await expect(requestPromise).rejects.toThrow();
    });

    it("should reject API calls when network errors occur", async () => {
      // Simulate network error
      mockSend.mockImplementation(() => {
        const networkError = new Error("Network Error");
        networkError.name = "NetworkError";
        throw networkError;
      });

      await expect(CoreAPI.version()).rejects.toThrow("Failed to send request");
    });
  });
});
