import { useState, useCallback, useRef, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import {
  ZeroConf,
  type ZeroConfService,
  type ZeroConfWatchResult,
} from "capacitor-zeroconf";
import { logger } from "@/lib/logger";

const ZAPAROO_SERVICE_TYPE = "_zaparoo._tcp.";
const ZAPAROO_SERVICE_DOMAIN = "local.";

// Session cache for discovered devices (persists across hook instances until app restart)
let deviceCache: DiscoveredDevice[] = [];
const deviceListeners = new Set<(devices: DiscoveredDevice[]) => void>();

// There is one ZeroConf watch for the whole app, shared by however many callers
// want discovery at once — the scan modal and the connection provider both do.
// Owners are counted rather than toggled so the modal closing cannot stop a
// browse the connection provider still needs.
const scanOwners = new Set<symbol>();
let watchPromise: Promise<void> | null = null;
let unwatchPromise: Promise<void> | null = null;
let isWatching = false;

/**
 * Reset the device cache. Used for testing to prevent cache pollution between tests.
 * @internal
 */
export function __resetDeviceCache(): void {
  deviceCache = [];
  deviceListeners.clear();
  scanOwners.clear();
  watchPromise = null;
  unwatchPromise = null;
  isWatching = false;
}

export interface DiscoveredDevice {
  /** Instance name (usually hostname) */
  name: string;
  /** Preferred resolved IP address */
  address: string;
  /** Every resolved IP address the service advertised */
  addresses: string[];
  /** mDNS hostname shared across the device's network interfaces */
  hostname?: string;
  /** Port number */
  port: number;
  /** Device ID from TXT record */
  deviceId?: string;
  /** Zaparoo Core version from TXT record */
  version?: string;
  /** Platform name from TXT record */
  platform?: string;
}

interface DeviceIdentity {
  address?: string;
  hostname?: string;
  deviceId?: string;
}

function normalizeIdentityValue(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}

function normalizeHostname(hostname: string | undefined): string | undefined {
  return normalizeIdentityValue(hostname?.replace(/\.+$/, ""));
}

export function getDiscoveredDeviceIdentity(device: DiscoveredDevice): string {
  const deviceId = normalizeIdentityValue(device.deviceId);
  if (deviceId) return `id:${deviceId}`;

  const hostname = normalizeHostname(device.hostname);
  if (hostname) return `hostname:${hostname}`;

  return `address:${normalizeIdentityValue(device.address)}`;
}

function isSameDiscoveredDevice(
  left: DeviceIdentity,
  right: DeviceIdentity,
): boolean {
  const leftDeviceId = normalizeIdentityValue(left.deviceId);
  const rightDeviceId = normalizeIdentityValue(right.deviceId);
  if (leftDeviceId && rightDeviceId) {
    return leftDeviceId === rightDeviceId;
  }

  const leftHostname = normalizeHostname(left.hostname);
  const rightHostname = normalizeHostname(right.hostname);
  if (leftHostname && rightHostname) {
    return leftHostname === rightHostname;
  }

  const leftAddress = normalizeIdentityValue(left.address);
  const rightAddress = normalizeIdentityValue(right.address);
  return Boolean(leftAddress && leftAddress === rightAddress);
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
/**
 * IPv4 before IPv6, deliberately: callers take `[0]` as the address to dial,
 * and IPv4 is the one that works on every network the app is likely to meet.
 */
function serviceAddresses(service: ZeroConfService): string[] {
  return [
    ...new Set([
      ...(service.ipv4Addresses ?? []),
      ...(service.ipv6Addresses ?? []),
    ]),
  ];
}

function serviceToIdentity(service: ZeroConfService): DeviceIdentity {
  const address = serviceAddresses(service)[0];
  const hostname = normalizeHostname(service.hostname);
  const deviceId = normalizeIdentityValue(service.txtRecord?.["id"]);

  return {
    ...(address ? { address } : {}),
    ...(hostname ? { hostname } : {}),
    ...(deviceId ? { deviceId } : {}),
  };
}

function serviceToDevice(service: ZeroConfService): DiscoveredDevice | null {
  const identity = serviceToIdentity(service);
  if (!identity.address) {
    return null;
  }

  const txtData = parseTxtRecord(service.txtRecord);

  return {
    name: service.name,
    address: identity.address,
    addresses: serviceAddresses(service),
    ...(identity.hostname ? { hostname: identity.hostname } : {}),
    port: service.port,
    ...txtData,
  };
}

/**
 * Fold a re-announcement into the cached device.
 *
 * If the address already in use is still advertised, this is an additive
 * announcement from a multi-homed device: union the sets and do not move, so a
 * partial announcement cannot flip `address` and tear down a live connection.
 * If it is no longer advertised the device genuinely moved, so take the new set
 * wholesale rather than keeping addresses that no longer answer.
 */
function mergeDiscoveredDevice(
  existing: DiscoveredDevice,
  incoming: DiscoveredDevice,
): DiscoveredDevice {
  const stillAdvertised = incoming.addresses.includes(existing.address);
  const addresses = stillAdvertised
    ? [...new Set([...existing.addresses, ...incoming.addresses])]
    : incoming.addresses;

  return {
    ...existing,
    ...incoming,
    addresses,
    address: stillAdvertised ? existing.address : incoming.address,
  };
}

function publishDevices(devices: DiscoveredDevice[]): void {
  deviceCache = devices;
  deviceListeners.forEach((listener) => listener(devices));
}

function handleDiscoveryResult(result: ZeroConfWatchResult): void {
  if (result.action === "resolved") {
    const device = serviceToDevice(result.service);
    if (!device) return;

    const existingIndex = deviceCache.findIndex((existing) =>
      isSameDiscoveredDevice(existing, device),
    );
    const existing = deviceCache[existingIndex];
    const updated = [...deviceCache];
    if (existing === undefined) {
      updated.push(device);
    } else {
      updated[existingIndex] = mergeDiscoveredDevice(existing, device);
    }
    publishDevices(updated);
    return;
  }

  if (result.action === "removed") {
    const removedIdentity = serviceToIdentity(result.service);
    if (
      !removedIdentity.deviceId &&
      !removedIdentity.hostname &&
      !removedIdentity.address
    ) {
      return;
    }

    const updated = deviceCache.filter(
      (device) => !isSameDiscoveredDevice(device, removedIdentity),
    );
    if (updated.length !== deviceCache.length) {
      publishDevices(updated);
    }
  }
}

/**
 * Register `owner` as needing discovery, starting the shared watch if it is not
 * already running.
 *
 * A teardown in flight is awaited first: `unwatch` and `watch` against the same
 * service type race inside the plugin, and losing that race leaves the watch
 * believing it is running with no listener attached.
 */
async function acquireNetworkScan(owner: symbol): Promise<void> {
  scanOwners.add(owner);

  if (unwatchPromise) {
    await unwatchPromise;
  }
  // Released while we waited, or someone else already started the watch.
  if (!scanOwners.has(owner) || isWatching) return;

  if (!watchPromise) {
    watchPromise = ZeroConf.watch(
      {
        type: ZAPAROO_SERVICE_TYPE,
        domain: ZAPAROO_SERVICE_DOMAIN,
      },
      handleDiscoveryResult,
    )
      .then(() => {
        isWatching = true;
      })
      .finally(() => {
        watchPromise = null;
      });
  }

  await watchPromise;
}

/** Drop `owner`'s claim, stopping the shared watch once nobody holds one. */
function releaseNetworkScan(owner: symbol): void {
  scanOwners.delete(owner);
  if (scanOwners.size > 0 || unwatchPromise) return;

  const stopPromise = (async () => {
    if (watchPromise) {
      try {
        await watchPromise;
      } catch {
        // The watch never started, so there is nothing to unwatch.
        return;
      }
    }
    // A new owner may have arrived while the watch was still starting.
    if (scanOwners.size > 0 || !isWatching) return;

    isWatching = false;
    try {
      // unwatch() rather than close(): it only removes the service listener,
      // where close() tears down JmDNS and makes the next scan much slower.
      await ZeroConf.unwatch({
        type: ZAPAROO_SERVICE_TYPE,
        domain: ZAPAROO_SERVICE_DOMAIN,
      });
    } catch (e) {
      logger.debug("Error stopping zeroconf watch", e);
    }
  })();

  unwatchPromise = stopPromise;
  void stopPromise.finally(() => {
    if (unwatchPromise === stopPromise) {
      unwatchPromise = null;
    }
  });
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
  const scanOwnerRef = useRef(Symbol("network-scan"));

  const stopScan = useCallback(() => {
    isScanningRef.current = false;
    setIsScanning(false);
    releaseNetworkScan(scanOwnerRef.current);
  }, []);

  const startScan = useCallback(async () => {
    // Only works on native platforms
    if (!Capacitor.isNativePlatform()) {
      setError("Network scanning is only available on mobile devices");
      return;
    }

    // Keep cached devices (due to a plugin bug, already-discovered devices
    // aren't re-announced to a second watch, so we rely on the cache)
    setDevices(deviceCache);
    setError(null);
    setIsScanning(true);
    isScanningRef.current = true;

    try {
      // Scans continuously until stopScan() is called (no auto-timeout)
      await acquireNetworkScan(scanOwnerRef.current);
    } catch (e) {
      releaseNetworkScan(scanOwnerRef.current);
      // stopScan() already ran, so this failure belongs to a scan the caller
      // has abandoned — reporting it would surface an error for a scan the
      // user is no longer waiting on.
      if (!isScanningRef.current) return;

      logger.error("Failed to start network scan", e, {
        category: "connection",
        action: "networkScan",
        severity: "warning",
      });
      setError("Failed to scan network");
      setIsScanning(false);
      isScanningRef.current = false;
    }
  }, []);

  useEffect(() => {
    const handleDevicesChanged = (updated: DiscoveredDevice[]) => {
      setDevices(updated);
    };
    deviceListeners.add(handleDevicesChanged);

    return () => {
      deviceListeners.delete(handleDevicesChanged);
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
