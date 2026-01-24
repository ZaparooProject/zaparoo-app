/**
 * Unit tests for onlineApi
 *
 * Tests the online API client including:
 * - getSubscriptionStatus function
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock axios before importing the module
const mockGet = vi.fn();
vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({
      get: mockGet,
      interceptors: {
        request: {
          use: vi.fn(),
        },
        response: {
          use: vi.fn(),
        },
      },
    })),
  },
}));

// Mock Firebase Authentication
vi.mock("@capacitor-firebase/authentication", () => ({
  FirebaseAuthentication: {
    getIdToken: vi.fn().mockResolvedValue({ token: "mock-token" }),
  },
}));

describe("onlineApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("getSubscriptionStatus", () => {
    it("should return subscription status from the API", async () => {
      mockGet.mockResolvedValue({
        data: { is_premium: true },
      });

      const { getSubscriptionStatus } = await import("../../../lib/onlineApi");
      const result = await getSubscriptionStatus();

      expect(mockGet).toHaveBeenCalledWith("/account/subscription");
      expect(result).toEqual({ is_premium: true });
    });

    it("should return is_premium false when user has no subscription", async () => {
      mockGet.mockResolvedValue({
        data: { is_premium: false },
      });

      const { getSubscriptionStatus } = await import("../../../lib/onlineApi");
      const result = await getSubscriptionStatus();

      expect(mockGet).toHaveBeenCalledWith("/account/subscription");
      expect(result).toEqual({ is_premium: false });
    });

    it("should throw error when API call fails", async () => {
      const apiError = new Error("Network error");
      mockGet.mockRejectedValue(apiError);

      const { getSubscriptionStatus } = await import("../../../lib/onlineApi");

      await expect(getSubscriptionStatus()).rejects.toThrow("Network error");
    });

    it("should throw error when API returns 401 unauthorized", async () => {
      const authError = new Error("Request failed with status code 401");
      mockGet.mockRejectedValue(authError);

      const { getSubscriptionStatus } = await import("../../../lib/onlineApi");

      await expect(getSubscriptionStatus()).rejects.toThrow(
        "Request failed with status code 401",
      );
    });
  });

  describe("onlineApi client", () => {
    it("should export the axios client instance", async () => {
      const { onlineApi } = await import("../../../lib/onlineApi");

      expect(onlineApi).toBeDefined();
      expect(onlineApi.get).toBeDefined();
    });
  });
});
