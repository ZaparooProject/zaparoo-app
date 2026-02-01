/**
 * Unit tests for onlineApi
 *
 * Tests the online API client including:
 * - getSubscriptionStatus function
 * - getRequirements function
 * - updateRequirements function
 * - deleteAccount function
 * - cancelAccountDeletion function
 * - Response interceptor for requirements_not_met errors
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock axios before importing the module
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();

// Capture interceptor callbacks for testing
let responseInterceptorSuccess: ((response: unknown) => unknown) | null = null;
let responseInterceptorError: ((error: unknown) => Promise<never>) | null =
  null;

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({
      get: mockGet,
      post: mockPost,
      delete: mockDelete,
      interceptors: {
        request: {
          use: vi.fn(),
        },
        response: {
          use: vi.fn(
            (
              successFn: (response: unknown) => unknown,
              errorFn: (error: unknown) => Promise<never>,
            ) => {
              // Capture the first (non-dev) interceptor callbacks
              if (!responseInterceptorSuccess) {
                responseInterceptorSuccess = successFn;
                responseInterceptorError = errorFn;
              }
            },
          ),
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

// Mock useRequirementsStore
const mockTrigger = vi.fn();
vi.mock("@/hooks/useRequirementsModal", () => ({
  useRequirementsStore: {
    getState: () => ({
      trigger: mockTrigger,
    }),
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

  describe("deleteAccount", () => {
    it("should send DELETE request with confirmation", async () => {
      mockDelete.mockResolvedValue({
        data: {
          message: "Account scheduled for deletion",
          deletion_scheduled_at: "2024-01-15T00:00:00Z",
        },
      });

      const { deleteAccount } = await import("../../../lib/onlineApi");
      const result = await deleteAccount("DELETE MY ACCOUNT");

      expect(mockDelete).toHaveBeenCalledWith("/account", {
        data: { confirmation: "DELETE MY ACCOUNT" },
      });
      expect(result.message).toBe("Account scheduled for deletion");
    });

    it("should return deletion response on success", async () => {
      const deletionDate = "2024-01-15T00:00:00Z";
      mockDelete.mockResolvedValue({
        data: {
          message: "Account deletion scheduled",
          scheduled_deletion_at: deletionDate,
          can_cancel_until: "2024-01-22T00:00:00Z",
        },
      });

      const { deleteAccount } = await import("../../../lib/onlineApi");
      const result = await deleteAccount("DELETE MY ACCOUNT");

      expect(result.scheduled_deletion_at).toBe(deletionDate);
    });

    it("should throw error on network failure", async () => {
      const networkError = new Error("Network error");
      mockDelete.mockRejectedValue(networkError);

      const { deleteAccount } = await import("../../../lib/onlineApi");

      await expect(deleteAccount("DELETE MY ACCOUNT")).rejects.toThrow(
        "Network error",
      );
    });

    it("should throw error on API error response", async () => {
      const apiError = new Error("Request failed with status code 400");
      mockDelete.mockRejectedValue(apiError);

      const { deleteAccount } = await import("../../../lib/onlineApi");

      await expect(deleteAccount("WRONG CONFIRMATION")).rejects.toThrow(
        "Request failed with status code 400",
      );
    });
  });

  describe("cancelAccountDeletion", () => {
    it("should send POST request to cancel deletion", async () => {
      mockPost.mockResolvedValue({
        data: { message: "Account deletion cancelled" },
      });

      const { cancelAccountDeletion } = await import("../../../lib/onlineApi");
      const result = await cancelAccountDeletion();

      expect(mockPost).toHaveBeenCalledWith("/account/cancel-deletion");
      expect(result.message).toBe("Account deletion cancelled");
    });

    it("should return success message on cancellation", async () => {
      mockPost.mockResolvedValue({
        data: { message: "Deletion cancelled successfully" },
      });

      const { cancelAccountDeletion } = await import("../../../lib/onlineApi");
      const result = await cancelAccountDeletion();

      expect(result).toEqual({ message: "Deletion cancelled successfully" });
    });

    it("should throw error on network failure", async () => {
      const networkError = new Error("Network error");
      mockPost.mockRejectedValue(networkError);

      const { cancelAccountDeletion } = await import("../../../lib/onlineApi");

      await expect(cancelAccountDeletion()).rejects.toThrow("Network error");
    });

    it("should throw error when no pending deletion exists", async () => {
      const apiError = new Error("Request failed with status code 404");
      mockPost.mockRejectedValue(apiError);

      const { cancelAccountDeletion } = await import("../../../lib/onlineApi");

      await expect(cancelAccountDeletion()).rejects.toThrow(
        "Request failed with status code 404",
      );
    });
  });

  describe("response interceptor", () => {
    beforeEach(async () => {
      // Import the module to trigger interceptor registration
      await import("../../../lib/onlineApi");
    });

    it("should trigger requirements modal when error code is requirements_not_met", async () => {
      const mockRequirements = [
        { type: "tos_acceptance", message: "Please accept terms of service" },
        { type: "age_verification", message: "Please verify your age" },
      ];

      const mockError = {
        response: {
          data: {
            error: {
              code: "requirements_not_met",
              requirements: mockRequirements,
            },
          },
        },
      };

      // Call the interceptor error handler
      expect(responseInterceptorError).not.toBeNull();
      await expect(responseInterceptorError!(mockError)).rejects.toBe(
        mockError,
      );

      expect(mockTrigger).toHaveBeenCalledWith(mockRequirements);
    });

    it("should not trigger requirements modal for other errors", async () => {
      const mockError = {
        response: {
          data: {
            error: {
              code: "unauthorized",
              message: "Invalid token",
            },
          },
        },
      };

      expect(responseInterceptorError).not.toBeNull();
      await expect(responseInterceptorError!(mockError)).rejects.toBe(
        mockError,
      );

      expect(mockTrigger).not.toHaveBeenCalled();
    });

    it("should not trigger requirements modal when requirements array is empty", async () => {
      const mockError = {
        response: {
          data: {
            error: {
              code: "requirements_not_met",
              requirements: [],
            },
          },
        },
      };

      expect(responseInterceptorError).not.toBeNull();
      await expect(responseInterceptorError!(mockError)).rejects.toBe(
        mockError,
      );

      expect(mockTrigger).not.toHaveBeenCalled();
    });

    it("should still reject the promise after triggering requirements", async () => {
      const mockRequirements = [
        { type: "email_verification", message: "Please verify email" },
      ];

      const mockError = {
        response: {
          data: {
            error: {
              code: "requirements_not_met",
              requirements: mockRequirements,
            },
          },
        },
      };

      expect(responseInterceptorError).not.toBeNull();

      // The interceptor should both trigger the modal AND reject the promise
      await expect(responseInterceptorError!(mockError)).rejects.toBe(
        mockError,
      );

      // Verify the trigger was called
      expect(mockTrigger).toHaveBeenCalledTimes(1);
    });

    it("should pass through successful responses unchanged", () => {
      const mockResponse = { data: { success: true } };

      expect(responseInterceptorSuccess).not.toBeNull();
      const result = responseInterceptorSuccess!(mockResponse);

      expect(result).toBe(mockResponse);
    });

    it("should handle errors without response data gracefully", async () => {
      const mockError = {
        message: "Network Error",
        // No response property
      };

      expect(responseInterceptorError).not.toBeNull();
      await expect(responseInterceptorError!(mockError)).rejects.toBe(
        mockError,
      );

      expect(mockTrigger).not.toHaveBeenCalled();
    });
  });
});
