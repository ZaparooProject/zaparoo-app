/**
 * Unit tests for useNetworkScan hook.
 *
 * Tests mDNS service discovery for Zaparoo Core devices.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "../../../test-utils";

// Track watch callbacks for manual triggering
let watchCallback:
  | ((result: {
      action: "added" | "removed" | "resolved";
      service: {
        name: string;
        port: number;
        ipv4Addresses: string[];
        ipv6Addresses: string[];
        txtRecord?: Record<string, string>;
      };
    }) => void)
  | null = null;

// Mock hoisted to ensure it's available before imports
const {
  mockIsNativePlatform,
  mockWatch,
  mockUnwatch,
  mockLoggerError,
  mockLoggerDebug,
} = vi.hoisted(() => ({
  mockIsNativePlatform: vi.fn().mockReturnValue(true),
  mockWatch: vi.fn().mockImplementation((_options, callback) => {
    watchCallback = callback;
    return Promise.resolve("watch-id");
  }),
  mockUnwatch: vi.fn().mockResolvedValue(undefined),
  mockLoggerError: vi.fn(),
  mockLoggerDebug: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: mockIsNativePlatform,
  },
}));

vi.mock("capacitor-zeroconf", () => ({
  ZeroConf: {
    watch: mockWatch,
    unwatch: mockUnwatch,
  },
}));

vi.mock("../../../lib/logger", () => ({
  logger: {
    error: mockLoggerError,
    debug: mockLoggerDebug,
  },
}));

// Reset device cache between tests by re-importing the module
// This is necessary because the module has a global deviceCache variable
beforeEach(async () => {
  // Reset all mocks
  vi.clearAllMocks();
  watchCallback = null;
  mockIsNativePlatform.mockReturnValue(true);
  mockWatch.mockImplementation((_options, callback) => {
    watchCallback = callback;
    return Promise.resolve("watch-id");
  });
  mockUnwatch.mockResolvedValue(undefined);

  // Reset device cache by re-importing
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useNetworkScan", () => {
  describe("initial state", () => {
    it("should return initial state with empty devices", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      expect(result.current.devices).toEqual([]);
      expect(result.current.isScanning).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.startScan).toBeDefined();
      expect(result.current.stopScan).toBeDefined();
    });
  });

  describe("startScan", () => {
    it("should set isScanning to true when starting scan", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      await act(async () => {
        await result.current.startScan();
      });

      expect(result.current.isScanning).toBe(true);
    });

    it("should call ZeroConf.watch with correct service type", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      await act(async () => {
        await result.current.startScan();
      });

      expect(mockWatch).toHaveBeenCalledWith(
        {
          type: "_zaparoo._tcp.",
          domain: "local.",
        },
        expect.any(Function),
      );
    });

    it("should set error when not on native platform", async () => {
      mockIsNativePlatform.mockReturnValue(false);
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      await act(async () => {
        await result.current.startScan();
      });

      expect(result.current.error).toBe(
        "Network scanning is only available on mobile devices",
      );
      expect(result.current.isScanning).toBe(false);
      expect(mockWatch).not.toHaveBeenCalled();
    });

    it("should handle watch failure", async () => {
      mockWatch.mockRejectedValueOnce(new Error("Watch failed"));
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      await act(async () => {
        await result.current.startScan();
      });

      expect(result.current.error).toBe("Failed to scan network");
      expect(result.current.isScanning).toBe(false);
      expect(mockLoggerError).toHaveBeenCalledWith(
        "Failed to start network scan",
        expect.any(Error),
        expect.objectContaining({
          category: "connection",
          action: "networkScan",
        }),
      );
    });

    it("should clear error when starting new scan", async () => {
      mockIsNativePlatform.mockReturnValue(false);
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      // First scan fails (not on native)
      await act(async () => {
        await result.current.startScan();
      });
      expect(result.current.error).not.toBeNull();

      // Now simulate native platform
      mockIsNativePlatform.mockReturnValue(true);

      // Second scan should clear error
      await act(async () => {
        await result.current.startScan();
      });
      expect(result.current.error).toBeNull();
    });
  });

  describe("stopScan", () => {
    it("should set isScanning to false", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      await act(async () => {
        await result.current.startScan();
      });
      expect(result.current.isScanning).toBe(true);

      act(() => {
        result.current.stopScan();
      });
      expect(result.current.isScanning).toBe(false);
    });

    it("should call ZeroConf.unwatch when was scanning", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      await act(async () => {
        await result.current.startScan();
      });

      act(() => {
        result.current.stopScan();
      });

      expect(mockUnwatch).toHaveBeenCalledWith({
        type: "_zaparoo._tcp.",
        domain: "local.",
      });
    });

    it("should not call unwatch when not scanning", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      act(() => {
        result.current.stopScan();
      });

      expect(mockUnwatch).not.toHaveBeenCalled();
    });

    it("should handle unwatch error gracefully", async () => {
      mockUnwatch.mockRejectedValueOnce(new Error("Unwatch failed"));
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      await act(async () => {
        await result.current.startScan();
      });

      // Should not throw
      act(() => {
        result.current.stopScan();
      });

      await waitFor(() => {
        expect(mockLoggerDebug).toHaveBeenCalledWith(
          "Error stopping zeroconf watch",
          expect.any(Error),
        );
      });
    });
  });

  describe("device discovery", () => {
    it("should add device when resolved event received", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      await act(async () => {
        await result.current.startScan();
      });

      act(() => {
        watchCallback?.({
          action: "resolved",
          service: {
            name: "test-device",
            port: 7497,
            ipv4Addresses: ["192.168.1.100"],
            ipv6Addresses: [],
            txtRecord: {
              id: "device-123",
              version: "1.0.0",
              platform: "linux",
            },
          },
        });
      });

      expect(result.current.devices).toHaveLength(1);
      expect(result.current.devices[0]).toEqual({
        name: "test-device",
        address: "192.168.1.100",
        port: 7497,
        deviceId: "device-123",
        version: "1.0.0",
        platform: "linux",
      });
    });

    it("should use IPv6 address when no IPv4 available", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      await act(async () => {
        await result.current.startScan();
      });

      act(() => {
        watchCallback?.({
          action: "resolved",
          service: {
            name: "ipv6-device",
            port: 7497,
            ipv4Addresses: [],
            ipv6Addresses: ["fe80::1"],
          },
        });
      });

      expect(result.current.devices).toHaveLength(1);
      const device = result.current.devices[0];
      expect(device?.address).toBe("fe80::1");
    });

    it("should ignore service without IP address", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      await act(async () => {
        await result.current.startScan();
      });

      act(() => {
        watchCallback?.({
          action: "resolved",
          service: {
            name: "no-ip-device",
            port: 7497,
            ipv4Addresses: [],
            ipv6Addresses: [],
          },
        });
      });

      expect(result.current.devices).toHaveLength(0);
    });

    it("should avoid duplicate devices by address", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      await act(async () => {
        await result.current.startScan();
      });

      // Add same device twice
      act(() => {
        watchCallback?.({
          action: "resolved",
          service: {
            name: "device-1",
            port: 7497,
            ipv4Addresses: ["192.168.1.100"],
            ipv6Addresses: [],
          },
        });
      });

      act(() => {
        watchCallback?.({
          action: "resolved",
          service: {
            name: "device-1-copy",
            port: 7497,
            ipv4Addresses: ["192.168.1.100"],
            ipv6Addresses: [],
          },
        });
      });

      expect(result.current.devices).toHaveLength(1);
      const device = result.current.devices[0];
      expect(device?.name).toBe("device-1");
    });

    it("should remove device on removed event", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      await act(async () => {
        await result.current.startScan();
      });

      // Add device
      act(() => {
        watchCallback?.({
          action: "resolved",
          service: {
            name: "test-device",
            port: 7497,
            ipv4Addresses: ["192.168.1.100"],
            ipv6Addresses: [],
          },
        });
      });

      expect(result.current.devices).toHaveLength(1);

      // Remove device
      act(() => {
        watchCallback?.({
          action: "removed",
          service: {
            name: "test-device",
            port: 7497,
            ipv4Addresses: ["192.168.1.100"],
            ipv6Addresses: [],
          },
        });
      });

      expect(result.current.devices).toHaveLength(0);
    });

    it("should handle removed event with IPv6 address", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      await act(async () => {
        await result.current.startScan();
      });

      // Add device with IPv6
      act(() => {
        watchCallback?.({
          action: "resolved",
          service: {
            name: "ipv6-device",
            port: 7497,
            ipv4Addresses: [],
            ipv6Addresses: ["fe80::1"],
          },
        });
      });

      expect(result.current.devices).toHaveLength(1);

      // Remove device
      act(() => {
        watchCallback?.({
          action: "removed",
          service: {
            name: "ipv6-device",
            port: 7497,
            ipv4Addresses: [],
            ipv6Addresses: ["fe80::1"],
          },
        });
      });

      expect(result.current.devices).toHaveLength(0);
    });

    it("should ignore removed event with no address", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      await act(async () => {
        await result.current.startScan();
      });

      // Add device
      act(() => {
        watchCallback?.({
          action: "resolved",
          service: {
            name: "test-device",
            port: 7497,
            ipv4Addresses: ["192.168.1.100"],
            ipv6Addresses: [],
          },
        });
      });

      // Try to remove with no address
      act(() => {
        watchCallback?.({
          action: "removed",
          service: {
            name: "test-device",
            port: 7497,
            ipv4Addresses: [],
            ipv6Addresses: [],
          },
        });
      });

      // Device should still be there
      expect(result.current.devices).toHaveLength(1);
    });

    it("should handle device with no txtRecord", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      await act(async () => {
        await result.current.startScan();
      });

      act(() => {
        watchCallback?.({
          action: "resolved",
          service: {
            name: "basic-device",
            port: 7497,
            ipv4Addresses: ["192.168.1.100"],
            ipv6Addresses: [],
            // No txtRecord
          },
        });
      });

      expect(result.current.devices).toHaveLength(1);
      expect(result.current.devices[0]).toEqual({
        name: "basic-device",
        address: "192.168.1.100",
        port: 7497,
        // No deviceId, version, platform
      });
    });
  });

  describe("cleanup", () => {
    it("should stop scan on unmount", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result, unmount } = renderHook(() => hook());

      await act(async () => {
        await result.current.startScan();
      });

      expect(result.current.isScanning).toBe(true);

      unmount();

      expect(mockUnwatch).toHaveBeenCalled();
    });
  });

  describe("restarting scan", () => {
    it("should stop existing scan before starting new one", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      // Start first scan
      await act(async () => {
        await result.current.startScan();
      });

      // Start second scan
      await act(async () => {
        await result.current.startScan();
      });

      // unwatch should have been called for the first scan
      expect(mockUnwatch).toHaveBeenCalledTimes(1);
      // watch should have been called twice
      expect(mockWatch).toHaveBeenCalledTimes(2);
    });
  });
});
