import type { DiscoveredDevice } from "@/hooks/useNetworkScan";
import type {
  DeviceRecord,
  DiscoveredDeviceRegistration,
} from "@/lib/devices/deviceRegistry";
import { formatDeviceEndpoint, isValidHost } from "@/lib/devices/endpoint";

function normalized(value: string | undefined): string | undefined {
  const result = value?.trim().toLowerCase().replace(/\.+$/, "");
  return result || undefined;
}

export function discoveredDeviceToRegistration(
  device: DiscoveredDevice,
): DiscoveredDeviceRegistration {
  return {
    discoveryId: device.deviceId,
    hostname: device.hostname,
    addresses: device.addresses,
    port: device.port,
    name: device.name,
    platform: device.platform,
    version: device.version,
  };
}

/** Prefer the stable DNS-SD hostname, falling back to the resolved address. */
export function displayDiscoveredDeviceAddress(
  device: DiscoveredDevice,
): string {
  const host = normalized(device.hostname) || device.address;
  if (!isValidHost(host)) return device.address;
  return formatDeviceEndpoint(host, device.port).address;
}

/**
 * Match a discovery result to a saved record without merging conflicting
 * stable device IDs. Host and address matching keep older IP-based records from
 * appearing twice beside the same discovered Core.
 */
export function discoveredDeviceMatchesRecord(
  device: DiscoveredDevice,
  record: DeviceRecord,
): boolean {
  const deviceId = normalized(device.deviceId);
  const recordId = normalized(record.discoveryId);
  if (deviceId && recordId) return deviceId === recordId;

  const hostname = normalized(device.hostname);
  const addresses = new Set(device.addresses.map(normalized).filter(Boolean));
  addresses.add(normalized(device.address));

  return record.endpoints.some((endpoint) => {
    if (endpoint.port !== device.port) return false;
    const host = normalized(endpoint.host);
    if (hostname && host === hostname) return true;
    if (host && addresses.has(host)) return true;
    return endpoint.resolvedAddresses?.some((address) =>
      addresses.has(normalized(address)),
    );
  });
}
