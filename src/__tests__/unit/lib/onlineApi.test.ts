/**
 * Unit tests for onlineApi
 *
 * Tests the online API client including:
 * - getSubscriptionStatus function
 * - getRequirements function
 * - updateRequirements function
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock axios before importing the module
const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({
      get: mockGet,
      post: mockPost,
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

  describe("getRequirements", () => {
    it("should return requirements status from the API", async () => {
      mockGet.mockResolvedValue({
        data: {
          requirements: {
            email_verified: true,
            tos_accepted: true,
            privacy_accepted: true,
            age_verified: true,
          },
          required_versions: {
            tos: "1.0",
            privacy: "1.0",
          },
          accepted_versions: {
            tos: "1.0",
            privacy: "1.0",
          },
        },
      });

      const { getRequirements } = await import("../../../lib/onlineApi");
      const result = await getRequirements();

      expect(mockGet).toHaveBeenCalledWith("/account/requirements");
      expect(result.requirements.tos_accepted).toBe(true);
      expect(result.requirements.age_verified).toBe(true);
    });

    it("should throw error when API call fails", async () => {
      const apiError = new Error("Network error");
      mockGet.mockRejectedValue(apiError);

      const { getRequirements } = await import("../../../lib/onlineApi");

      await expect(getRequirements()).rejects.toThrow("Network error");
    });
  });

  describe("updateRequirements", () => {
    it("should post requirements update to the API", async () => {
      mockPost.mockResolvedValue({
        data: {
          requirements: {
            email_verified: false,
            tos_accepted: true,
            privacy_accepted: true,
            age_verified: true,
          },
        },
      });

      const { updateRequirements } = await import("../../../lib/onlineApi");
      const result = await updateRequirements({
        accept_tos: true,
        accept_privacy: true,
        age_verified: true,
      });

      expect(mockPost).toHaveBeenCalledWith("/account/requirements", {
        accept_tos: true,
        accept_privacy: true,
        age_verified: true,
      });
      expect(result.requirements.tos_accepted).toBe(true);
    });

    it("should support partial updates", async () => {
      mockPost.mockResolvedValue({
        data: {
          requirements: {
            email_verified: false,
            tos_accepted: true,
            privacy_accepted: true,
            age_verified: false,
          },
        },
      });

      const { updateRequirements } = await import("../../../lib/onlineApi");
      await updateRequirements({
        accept_tos: true,
        accept_privacy: true,
      });

      expect(mockPost).toHaveBeenCalledWith("/account/requirements", {
        accept_tos: true,
        accept_privacy: true,
      });
    });

    it("should throw error when API call fails", async () => {
      const apiError = new Error("Update failed");
      mockPost.mockRejectedValue(apiError);

      const { updateRequirements } = await import("../../../lib/onlineApi");

      await expect(updateRequirements({ accept_tos: true })).rejects.toThrow(
        "Update failed",
      );
    });
  });
});
