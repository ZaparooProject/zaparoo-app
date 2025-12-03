/**
 * Unit tests for useProAccessCheck hook
 *
 * Tests the RevenueCat Pro access validation including:
 * - Web platform skip behavior
 * - Active entitlement detection
 * - Error handling with cached value preservation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useProAccessCheck } from "../../../hooks/useProAccessCheck";

// Create hoisted mocks
const { mockGetPlatform, mockGetCustomerInfo, mockLogger } = vi.hoisted(() => ({
  mockGetPlatform: vi.fn().mockReturnValue("ios"),
  mockGetCustomerInfo: vi.fn(),
  mockLogger: {
    log: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: mockGetPlatform,
  },
}));

// Mock RevenueCat
vi.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases: {
    getCustomerInfo: mockGetCustomerInfo,
  },
}));

// Mock logger
vi.mock("../../../lib/logger", () => ({
  logger: mockLogger,
}));

// Mock preferences store
const mockSetLauncherAccess = vi.fn();
const mockSetProAccessHydrated = vi.fn();

vi.mock("../../../lib/preferencesStore", () => ({
  usePreferencesStore: vi.fn((selector: (state: unknown) => unknown) => {
    const state = {
      setLauncherAccess: mockSetLauncherAccess,
      setProAccessHydrated: mockSetProAccessHydrated,
    };
    return selector(state);
  }),
}));

describe("useProAccessCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default to iOS platform
    mockGetPlatform.mockReturnValue("ios");

    // Default to successful response with no entitlement
    mockGetCustomerInfo.mockResolvedValue({
      customerInfo: {
        entitlements: {
          active: {},
        },
      },
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("web platform", () => {
    it("should skip RevenueCat check on web platform", async () => {
      mockGetPlatform.mockReturnValue("web");

      renderHook(() => useProAccessCheck());

      await waitFor(() => {
        expect(mockSetProAccessHydrated).toHaveBeenCalledWith(true);
      });

      // Should log skipping message
      expect(mockLogger.log).toHaveBeenCalledWith(
        "Web platform, skipping Pro access check",
      );

      // Should NOT call RevenueCat
      expect(mockGetCustomerInfo).not.toHaveBeenCalled();

      // Should NOT set launcher access (keeps cached value)
      expect(mockSetLauncherAccess).not.toHaveBeenCalled();
    });
  });

  describe("native platform - iOS", () => {
    it("should set launcherAccess to true when entitlement is active", async () => {
      mockGetPlatform.mockReturnValue("ios");
      mockGetCustomerInfo.mockResolvedValue({
        customerInfo: {
          entitlements: {
            active: {
              tapto_launcher: { isActive: true },
            },
          },
        },
      });

      renderHook(() => useProAccessCheck());

      await waitFor(() => {
        expect(mockSetLauncherAccess).toHaveBeenCalledWith(true);
      });

      expect(mockSetProAccessHydrated).toHaveBeenCalledWith(true);
    });

    it("should set launcherAccess to false when entitlement is not active", async () => {
      mockGetPlatform.mockReturnValue("ios");
      mockGetCustomerInfo.mockResolvedValue({
        customerInfo: {
          entitlements: {
            active: {},
          },
        },
      });

      renderHook(() => useProAccessCheck());

      await waitFor(() => {
        expect(mockSetLauncherAccess).toHaveBeenCalledWith(false);
      });

      expect(mockSetProAccessHydrated).toHaveBeenCalledWith(true);
    });
  });

  describe("native platform - Android", () => {
    it("should check RevenueCat on Android platform", async () => {
      mockGetPlatform.mockReturnValue("android");
      mockGetCustomerInfo.mockResolvedValue({
        customerInfo: {
          entitlements: {
            active: {
              tapto_launcher: { isActive: true },
            },
          },
        },
      });

      renderHook(() => useProAccessCheck());

      await waitFor(() => {
        expect(mockGetCustomerInfo).toHaveBeenCalled();
      });

      expect(mockSetLauncherAccess).toHaveBeenCalledWith(true);
      expect(mockSetProAccessHydrated).toHaveBeenCalledWith(true);
    });
  });

  describe("error handling", () => {
    it("should mark as hydrated on RevenueCat error", async () => {
      mockGetPlatform.mockReturnValue("ios");
      mockGetCustomerInfo.mockRejectedValue(new Error("Network error"));

      renderHook(() => useProAccessCheck());

      await waitFor(() => {
        expect(mockSetProAccessHydrated).toHaveBeenCalledWith(true);
      });

      // Should log the error
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to check Pro access:",
        expect.any(Error),
        expect.objectContaining({
          category: "purchase",
          action: "proAccessCheck",
        }),
      );
    });

    it("should NOT set launcherAccess on error (keeps cached value)", async () => {
      mockGetPlatform.mockReturnValue("ios");
      mockGetCustomerInfo.mockRejectedValue(new Error("Network error"));

      renderHook(() => useProAccessCheck());

      await waitFor(() => {
        expect(mockSetProAccessHydrated).toHaveBeenCalledWith(true);
      });

      // Should NOT call setLauncherAccess (preserves cached value)
      expect(mockSetLauncherAccess).not.toHaveBeenCalled();
    });
  });

  describe("entitlement checking", () => {
    it("should check specifically for tapto_launcher entitlement", async () => {
      mockGetPlatform.mockReturnValue("ios");
      // Has some other entitlement but not tapto_launcher
      mockGetCustomerInfo.mockResolvedValue({
        customerInfo: {
          entitlements: {
            active: {
              some_other_entitlement: { isActive: true },
            },
          },
        },
      });

      renderHook(() => useProAccessCheck());

      await waitFor(() => {
        expect(mockSetLauncherAccess).toHaveBeenCalledWith(false);
      });
    });

    it("should handle undefined entitlements by going to error path", async () => {
      mockGetPlatform.mockReturnValue("ios");
      // When active is undefined, accessing active.tapto_launcher throws
      mockGetCustomerInfo.mockResolvedValue({
        customerInfo: {
          entitlements: {
            active: undefined,
          },
        },
      });

      renderHook(() => useProAccessCheck());

      // This will throw when accessing undefined.tapto_launcher
      // and go to the error handler, which marks as hydrated
      await waitFor(() => {
        expect(mockSetProAccessHydrated).toHaveBeenCalledWith(true);
      });

      // Error path doesn't set launcherAccess (preserves cached value)
      expect(mockSetLauncherAccess).not.toHaveBeenCalled();
    });
  });
});
