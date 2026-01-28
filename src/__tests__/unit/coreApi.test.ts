import { describe, it, expect, beforeEach, vi, Mock } from "vitest";
import { CoreAPI } from "../../lib/coreApi";
import type { HistoryResponseEntry, SearchParams } from "../../lib/models";

describe("CoreAPI Type Improvements", () => {
  let mockSend: Mock;

  beforeEach(() => {
    mockSend = vi.fn();
    CoreAPI.setSend(mockSend);
    // Mock WebSocket connection as connected so requests are sent immediately
    CoreAPI.setWsInstance({ isConnected: true, send: mockSend } as any);
  });

  describe("History API Response", () => {
    it("should handle history response with complete data fields including type and data", async () => {
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

      setTimeout(() => {
        const request = JSON.parse(mockSend.mock.calls[0]![0]);
        const response = {
          jsonrpc: "2.0",
          id: request.id,
          result: historyResponse,
        };
        CoreAPI.processReceived({
          data: JSON.stringify(response),
        } as MessageEvent);
      }, 0);

      const result = await CoreAPI.history();

      // This should compile if the HistoryResponseEntry interface has type and data fields
      const entry: HistoryResponseEntry = result.entries[0]!;

      // Test that these required fields exist in the API response
      // According to Zaparoo Core API spec, history entries should have type and data
      expect(entry.type).toBe("nfc");
      expect(entry.data).toBe("04a1b2c3");
      expect(entry.time).toBe("2024-09-24T17:49:42.938167429+08:00");
      expect(entry.uid).toBe("abc123");
      expect(entry.text).toBe("**launch.system:snes");
      expect(entry.success).toBe(true);

      // Test that HistoryResponseEntry properly types all fields from Core API spec
      // This should cause TypeScript errors if type and data are missing from interface
      const typeField: string = entry.type;
      const dataField: string = entry.data;

      expect(typeField).toBe("nfc");
      expect(dataField).toBe("04a1b2c3");
    });
  });

  describe("Search API Parameters", () => {
    it("should support maxResults parameter in SearchParams", async () => {
      const searchParams: SearchParams & { maxResults?: number } = {
        query: "mario",
        systems: ["snes"],
        maxResults: 50, // This should be supported according to Core API
      };

      setTimeout(() => {
        const request = JSON.parse(mockSend.mock.calls[0]![0]);
        expect(request.params.maxResults).toBe(50);
        const response = {
          jsonrpc: "2.0",
          id: request.id,
          result: { results: [], total: 0 },
        };
        CoreAPI.processReceived({
          data: JSON.stringify(response),
        } as MessageEvent);
      }, 0);

      await CoreAPI.mediaSearch(searchParams);
    });
  });
});
