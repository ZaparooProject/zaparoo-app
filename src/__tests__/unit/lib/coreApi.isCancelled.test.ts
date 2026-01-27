/**
 * Tests for isCancelled type guard.
 *
 * This helper function is critical for preventing crashes when API requests
 * are cancelled (stale, aborted, or connection reset). Without proper checking,
 * accessing properties on a cancelled response (e.g., response.database) would
 * cause "Cannot read properties of undefined" errors.
 *
 * Regression test for: App crash "Cannot read properties of undefined (reading 'indexing')"
 * when reconnecting after a stale connection.
 */

import { describe, it, expect } from "vitest";
import { isCancelled, type CancelledResponse } from "../../../lib/coreApi";
import type { MediaResponse, TokensResponse } from "../../../lib/models";

describe("isCancelled", () => {
  describe("type guard behavior", () => {
    it("should return true for cancelled response object", () => {
      const cancelled: CancelledResponse = { cancelled: true };
      expect(isCancelled(cancelled)).toBe(true);
    });

    it("should return false for valid MediaResponse", () => {
      const response: MediaResponse = {
        database: {
          exists: true,
          indexing: false,
          optimizing: false,
          totalSteps: 0,
          currentStep: 0,
          currentStepDisplay: "",
          totalFiles: 0,
        },
        active: [],
      };
      expect(isCancelled(response)).toBe(false);
    });

    it("should return false for valid TokensResponse", () => {
      const response: TokensResponse = {
        active: [],
        last: { type: "nfc", uid: "abc123", text: "", data: "", scanTime: "" },
      };
      expect(isCancelled(response)).toBe(false);
    });

    it("should return false for null", () => {
      expect(isCancelled(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isCancelled(undefined)).toBe(false);
    });

    it("should return false for empty object", () => {
      expect(isCancelled({})).toBe(false);
    });

    it("should return false for object with cancelled: false", () => {
      expect(isCancelled({ cancelled: false })).toBe(false);
    });

    it("should return false for primitive values", () => {
      expect(isCancelled("cancelled")).toBe(false);
      expect(isCancelled(123)).toBe(false);
      expect(isCancelled(true)).toBe(false);
    });
  });

  describe("regression: prevents crash when accessing properties on cancelled response", () => {
    /**
     * This test simulates the exact scenario that caused the crash:
     * 1. CoreAPI.media() returns { cancelled: true } instead of MediaResponse
     * 2. Code tries to access response.database.indexing
     * 3. Without isCancelled check, this throws "Cannot read properties of undefined"
     */
    it("should allow safe handling of cancelled media response", () => {
      // Simulate what CoreAPI.media() returns when cancelled
      const response: MediaResponse | CancelledResponse = { cancelled: true };

      // This is the pattern that should be used in ConnectionProvider
      let handledAsCancelled = false;
      if (isCancelled(response)) {
        // Cancelled - do nothing, don't crash
        handledAsCancelled = true;
      }

      expect(handledAsCancelled).toBe(true);
    });

    it("should allow safe handling of cancelled tokens response", () => {
      const response: TokensResponse | CancelledResponse = { cancelled: true };

      let handledAsCancelled = false;
      if (isCancelled(response)) {
        handledAsCancelled = true;
      }

      expect(handledAsCancelled).toBe(true);
    });

    it("should correctly narrow type for valid response", () => {
      const response: MediaResponse | CancelledResponse = {
        database: {
          exists: true,
          indexing: true,
          optimizing: false,
          totalSteps: 10,
          currentStep: 5,
          currentStepDisplay: "Scanning files...",
          totalFiles: 1000,
        },
        active: [],
      };

      let indexingValue: boolean | null = null;
      if (!isCancelled(response)) {
        // TypeScript knows this is MediaResponse, access is safe
        indexingValue = response.database.indexing;
      }

      expect(indexingValue).toBe(true);
    });

    it("should demonstrate what happens WITHOUT the isCancelled check (the bug)", () => {
      // This test documents the bug that was fixed
      // DO NOT access properties without checking isCancelled first!
      const cancelledResponse = { cancelled: true } as unknown;

      // WRONG: This would crash with "Cannot read properties of undefined"
      // const indexing = (cancelledResponse as MediaResponse).database.indexing;

      // Instead, we check first:
      expect(() => {
        // Casting to simulate runtime behavior where we don't know the type
        const response = cancelledResponse as MediaResponse | CancelledResponse;
        if (!isCancelled(response)) {
          // This won't execute for cancelled responses
          return response.database.indexing;
        }
        return undefined;
      }).not.toThrow();
    });
  });
});
