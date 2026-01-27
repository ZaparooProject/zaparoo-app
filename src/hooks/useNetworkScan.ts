import { useState, useCallback, useRef, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { ZeroConf, ZeroConfService } from "capacitor-zeroconf";
import { logger } from "@/lib/logger";

const ZAPAROO_SERVICE_TYPE = "_zaparoo._tcp.";
const ZAPAROO_SERVICE_DOMAIN = "local.";

// Session cache for discovered devices (persists across hook instances until app restart)
let deviceCache: DiscoveredDevice[] = [];

export interface DiscoveredDevice {
  /** Instance name (usually hostname) */
  name: string;
  /** IP address to connect to */
  address: string;
  /** Port number */
  port: number;
  /** Device ID from TXT record */
  deviceId?: string;
  /** Zaparoo Core version from TXT record */
  version?: string;
  /** Platform name from TXT record */
  platform?: string;
}

interface UseNetworkScanResult {
  /** List of discovered devices */
  devices: DiscoveredDevice[];
  /** Whether scanning is in progress */
  isScanning: boolean;
  /** Error message if scan failed */
  error: string | null;
  /** Start scanning for devices */
  startScan: () => Promise<void>;
  /** Stop scanning (returns immediately, cleanup happens in background) */
  stopScan: () => void;
}

/**
 * Parse TXT record from mDNS service into key-value pairs.
 * TXT records come as { key: "value" } from the plugin.
 */
function parseTxtRecord(txtRecord: Record<string, string> | undefined): {
  deviceId?: string;
  version?: string;
  platform?: string;
} {
  if (!txtRecord) return {};

  return {
    deviceId: txtRecord["id"],
    version: txtRecord["version"],
    platform: txtRecord["platform"],
  };
}

/**
 * Convert a ZeroConfService to our DiscoveredDevice format.
 * Returns null if the service doesn't have a valid IP address.
 */
function serviceToDevice(service: ZeroConfService): DiscoveredDevice | null {
  // Get the first IPv4 address, fall back to IPv6
  const address = service.ipv4Addresses?.[0] || service.ipv6Addresses?.[0];

  if (!address) {
    return null;
  }

  const txtData = parseTxtRecord(service.txtRecord);

  return {
    name: service.name,
    address,
    port: service.port,
    ...txtData,
  };
}

/**
 * Hook for scanning the local network for Zaparoo Core devices using mDNS.
 * Only works on native platforms (iOS/Android).
 *
 * Usage:
 * ```tsx
 * const { devices, isScanning, error, startScan, stopScan } = useNetworkScan();
 *
 * // Start scanning when modal opens
 * useEffect(() => {
 *   if (isOpen) startScan();
 *   return () => { stopScan(); };
 * }, [isOpen]);
 * ```
 */
export function useNetworkScan(): UseNetworkScanResult {
  // Initialize with cached devices for instant display
  const [devices, setDevices] = useState<DiscoveredDevice[]>(deviceCache);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isScanningRef = useRef(false);

  const stopScan = useCallback(() => {
    // Update UI state immediately
    const wasScanning = isScanningRef.current;
    isScanningRef.current = false;
    setIsScanning(false);

    // Stop watching if we were scanning
    if (wasScanning) {
      // Use unwatch() instead of close() - it's much faster because it only
      // removes the service listener without tearing down JmDNS.
      // Note: Due to a bug in capacitor-zeroconf, the BrowserManager is reused
      // and subsequent watch() calls won't re-discover already-cached devices.
      // This is acceptable since we maintain a session cache.
      ZeroConf.unwatch({
        type: ZAPAROO_SERVICE_TYPE,
        domain: ZAPAROO_SERVICE_DOMAIN,
      }).catch((e) => {
        logger.debug("Error stopping zeroconf watch", e);
      });
    }
  }, []);

  const startScan = useCallback(async () => {
    // Only works on native platforms
    if (!Capacitor.isNativePlatform()) {
      setError("Network scanning is only available on mobile devices");
      return;
    }

    // Stop any existing scan
    stopScan();

    // Keep cached devices (due to plugin bug, already-discovered devices
    // won't be re-announced, so we rely on the cache)
    setDevices(deviceCache);
    setError(null);
    setIsScanning(true);
    isScanningRef.current = true;

    try {
      // Start watching for Zaparoo services with callback
      // Note: This plugin uses the callback parameter, not addListener events
      await ZeroConf.watch(
        {
          type: ZAPAROO_SERVICE_TYPE,
          domain: ZAPAROO_SERVICE_DOMAIN,
        },
        (result) => {
          if (result.action === "resolved") {
            const device = serviceToDevice(result.service);
            if (device) {
              setDevices((prev) => {
                // Avoid duplicates by address
                if (prev.some((d) => d.address === device.address)) {
                  return prev;
                }
                const updated = [...prev, device];
                // Update session cache
                deviceCache = updated;
                return updated;
              });
            }
          } else if (result.action === "removed") {
            // Remove device if it goes away
            const address =
              result.service.ipv4Addresses?.[0] ||
              result.service.ipv6Addresses?.[0];
            if (address) {
              setDevices((prev) => {
                const updated = prev.filter((d) => d.address !== address);
                // Update session cache
                deviceCache = updated;
                return updated;
              });
            }
          }
        },
      );

      // Scan continuously until stopScan() is called (no auto-timeout)
    } catch (e) {
      logger.error("Failed to start network scan", e, {
        category: "connection",
        action: "networkScan",
        severity: "warning",
      });
      setError("Failed to scan network");
      setIsScanning(false);
      isScanningRef.current = false;
    }
  }, [stopScan]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScan();
    };
  }, [stopScan]);

  return {
    devices,
    isScanning,
    error,
    startScan,
    stopScan,
  };
}
