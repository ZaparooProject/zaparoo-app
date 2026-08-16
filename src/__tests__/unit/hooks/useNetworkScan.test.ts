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
        hostname?: string;
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
            hostname: "test-device.local.",
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
        addresses: ["192.168.1.100"],
        hostname: "test-device.local",
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

    // The first address is the one the socket dials, and IPv6 link-local needs
    // a scope id the WebSocket URL has nowhere to put.
    it("should prefer IPv4 over IPv6 for the address it hands out", async () => {
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
            name: "dual-stack",
            port: 7497,
            ipv4Addresses: ["192.168.1.100"],
            ipv6Addresses: ["fe80::1"],
          },
        });
      });

      expect(result.current.devices[0]).toMatchObject({
        address: "192.168.1.100",
        addresses: ["192.168.1.100", "fe80::1"],
      });
    });

    it("should not repeat an address advertised on both stacks", async () => {
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
            name: "duplicated",
            port: 7497,
            ipv4Addresses: ["192.168.1.100"],
            ipv6Addresses: ["192.168.1.100"],
          },
        });
      });

      expect(result.current.devices[0]?.addresses).toEqual(["192.168.1.100"]);
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

    it("should update duplicate devices matched by address", async () => {
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
            name: "device-1-updated",
            port: 7497,
            ipv4Addresses: ["192.168.1.100"],
            ipv6Addresses: [],
          },
        });
      });

      expect(result.current.devices).toHaveLength(1);
      expect(result.current.devices[0]?.name).toBe("device-1-updated");
    });

    it("should replace address identity when hostname becomes available", async () => {
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
            name: "address-only",
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
            name: "hostname-added",
            hostname: "Zaparoo.local.",
            port: 7497,
            ipv4Addresses: ["192.168.1.100"],
            ipv6Addresses: [],
          },
        });
      });

      expect(result.current.devices).toHaveLength(1);
      expect(result.current.devices[0]).toMatchObject({
        name: "hostname-added",
        address: "192.168.1.100",
        hostname: "zaparoo.local",
      });
    });

    it("should update address for duplicate normalized hostname", async () => {
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
            name: "ethernet",
            hostname: "Zaparoo.local.",
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
            name: "wifi",
            hostname: "zaparoo.LOCAL",
            port: 7497,
            ipv4Addresses: ["192.168.1.101"],
            ipv6Addresses: [],
          },
        });
      });

      expect(result.current.devices).toHaveLength(1);
      expect(result.current.devices[0]).toMatchObject({
        name: "wifi",
        address: "192.168.1.101",
        hostname: "zaparoo.local",
      });
    });

    it("should update hostname identity when later result only has address", async () => {
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
            name: "hostname-first",
            hostname: "zaparoo.local.",
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
            name: "address-update",
            port: 9000,
            ipv4Addresses: ["192.168.1.100"],
            ipv6Addresses: [],
          },
        });
      });

      expect(result.current.devices).toHaveLength(1);
      expect(result.current.devices[0]).toMatchObject({
        name: "address-update",
        address: "192.168.1.100",
        hostname: "zaparoo.local",
        port: 9000,
      });
    });

    it("should match devices by device ID before hostname or address", async () => {
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
            name: "ethernet",
            hostname: "ethernet.local.",
            port: 7497,
            ipv4Addresses: ["192.168.1.100"],
            ipv6Addresses: [],
            txtRecord: { id: "DEVICE-123" },
          },
        });
      });

      act(() => {
        watchCallback?.({
          action: "resolved",
          service: {
            name: "wifi",
            hostname: "wifi.local.",
            port: 7497,
            ipv4Addresses: ["192.168.1.101"],
            ipv6Addresses: [],
            txtRecord: { id: "device-123" },
          },
        });
      });

      expect(result.current.devices).toHaveLength(1);
      expect(result.current.devices[0]).toMatchObject({
        name: "wifi",
        address: "192.168.1.101",
        hostname: "wifi.local",
        deviceId: "device-123",
      });
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

    it("should remove device by hostname when removed event has no address", async () => {
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
            hostname: "zaparoo.local.",
            port: 7497,
            ipv4Addresses: ["192.168.1.100"],
            ipv6Addresses: [],
          },
        });
      });

      act(() => {
        watchCallback?.({
          action: "removed",
          service: {
            name: "test-device",
            hostname: "ZAPAROO.LOCAL",
            port: 7497,
            ipv4Addresses: [],
            ipv6Addresses: [],
          },
        });
      });

      expect(result.current.devices).toHaveLength(0);
    });

    it("should ignore removed event with no identity", async () => {
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

      // Try to remove with no stable identity
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
        addresses: ["192.168.1.100"],
        port: 7497,
        // No deviceId, version, platform
      });
    });
  });

  // A multi-homed device announces one interface at a time, so a re-announcement
  // is usually a partial view rather than a correction.
  describe("re-announcements from a multi-homed device", () => {
    const announce = (
      ipv4Addresses: string[],
      hostname = "steamdeck.local.",
    ) => ({
      action: "resolved" as const,
      service: {
        name: "steamdeck",
        hostname,
        port: 7497,
        ipv4Addresses,
        ipv6Addresses: [],
        txtRecord: { id: "device-123" },
      },
    });

    it("should collect every interface it hears about", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      await act(async () => {
        await result.current.startScan();
      });

      act(() => {
        watchCallback?.(announce(["192.168.1.100"]));
      });
      act(() => {
        watchCallback?.(announce(["192.168.1.100", "10.0.0.5"]));
      });

      expect(result.current.devices).toHaveLength(1);
      expect(result.current.devices[0]?.addresses).toEqual([
        "192.168.1.100",
        "10.0.0.5",
      ]);
    });

    // Flipping `address` here would repoint a live socket at the other
    // interface for no reason.
    it("should keep the address in use while it is still advertised", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      await act(async () => {
        await result.current.startScan();
      });

      act(() => {
        watchCallback?.(announce(["192.168.1.100"]));
      });
      act(() => {
        watchCallback?.(announce(["10.0.0.5", "192.168.1.100"]));
      });

      expect(result.current.devices[0]?.address).toBe("192.168.1.100");
    });

    it("should follow the device when its address stops being advertised", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      await act(async () => {
        await result.current.startScan();
      });

      act(() => {
        watchCallback?.(announce(["192.168.1.100"]));
      });
      // The DHCP lease moved, so the old address is dropped rather than kept
      // around as an address that no longer answers.
      act(() => {
        watchCallback?.(announce(["10.0.0.5"]));
      });

      expect(result.current.devices[0]).toMatchObject({
        address: "10.0.0.5",
        addresses: ["10.0.0.5"],
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

  // There is one ZeroConf watch for the whole app. The connection provider
  // browses to resolve a `.local` hostname at the same time the scan modal
  // browses to list devices, so ownership is counted rather than toggled.
  describe("sharing one watch between callers", () => {
    it("should not restart the watch when the same caller scans again", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result } = renderHook(() => hook());

      await act(async () => {
        await result.current.startScan();
      });
      await act(async () => {
        await result.current.startScan();
      });

      expect(mockWatch).toHaveBeenCalledTimes(1);
      expect(mockUnwatch).not.toHaveBeenCalled();
    });

    it("should keep watching while a second caller is still scanning", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result: modalScan } = renderHook(() => hook());
      const { result: providerScan } = renderHook(() => hook());

      await act(async () => {
        await modalScan.current.startScan();
        await providerScan.current.startScan();
      });

      expect(mockWatch).toHaveBeenCalledTimes(1);

      await act(async () => {
        modalScan.current.stopScan();
      });

      expect(mockUnwatch).not.toHaveBeenCalled();
      expect(providerScan.current.isScanning).toBe(true);
    });

    it("should stop watching once the last caller stops", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result: modalScan } = renderHook(() => hook());
      const { result: providerScan } = renderHook(() => hook());

      await act(async () => {
        await modalScan.current.startScan();
        await providerScan.current.startScan();
      });

      await act(async () => {
        modalScan.current.stopScan();
        providerScan.current.stopScan();
      });

      await waitFor(() => {
        expect(mockUnwatch).toHaveBeenCalledTimes(1);
      });
    });

    it("should deliver discoveries to every scanning caller", async () => {
      const { useNetworkScan: hook } =
        await import("../../../hooks/useNetworkScan");
      const { result: modalScan } = renderHook(() => hook());
      const { result: providerScan } = renderHook(() => hook());

      await act(async () => {
        await modalScan.current.startScan();
        await providerScan.current.startScan();
      });

      act(() => {
        watchCallback?.({
          action: "resolved",
          service: {
            name: "test-device",
            hostname: "test-device.local",
            port: 7497,
            ipv4Addresses: ["192.168.1.100"],
            ipv6Addresses: [],
          },
        });
      });

      await waitFor(() => {
        expect(modalScan.current.devices).toHaveLength(1);
        expect(providerScan.current.devices).toHaveLength(1);
      });
    });
  });
});
