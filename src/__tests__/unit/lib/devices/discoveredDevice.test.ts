import { describe, expect, it } from "vitest";
import type { DiscoveredDevice } from "@/hooks/useNetworkScan";
import {
  discoveredDeviceMatchesRecord,
  discoveredDeviceToRegistration,
  displayDiscoveredDeviceAddress,
} from "@/lib/devices/discoveredDevice";
import type { DeviceRecord } from "@/lib/devices/deviceRegistry";

function discovered(
  overrides: Partial<DiscoveredDevice> = {},
): DiscoveredDevice {
  return {
    name: "Living Room",
    address: "192.168.1.50",
    addresses: ["192.168.1.50"],
    hostname: "living-room.local.",
    port: 7497,
    deviceId: "core-1",
    platform: "linux",
    version: "2.17.0",
    ...overrides,
  };
}

function record(overrides: Partial<DeviceRecord> = {}): DeviceRecord {
  return {
    recordId: "record-1",
    discoveryId: "core-1",
    endpoints: [
      {
        endpointId: "ws://living-room.local:7497",
        scheme: "ws",
        host: "living-room.local",
        port: 7497,
        source: "mdns",
        resolvedAddresses: ["192.168.1.50"],
      },
    ],
    preferredEndpointId: "ws://living-room.local:7497",
    ...overrides,
  };
}

describe("discovered device helpers", () => {
  it("builds a registry selection from a discovery result", () => {
    expect(discoveredDeviceToRegistration(discovered())).toEqual({
      discoveryId: "core-1",
      hostname: "living-room.local.",
      addresses: ["192.168.1.50"],
      port: 7497,
      name: "Living Room",
      platform: "linux",
      version: "2.17.0",
    });
  });

  it("displays the stable hostname and port", () => {
    expect(displayDiscoveredDeviceAddress(discovered())).toBe(
      "living-room.local",
    );
  });

  it("matches by stable ID, hostname, or advertised address", () => {
    expect(discoveredDeviceMatchesRecord(discovered(), record())).toBe(true);
    expect(
      discoveredDeviceMatchesRecord(
        discovered({ deviceId: undefined }),
        record({ discoveryId: undefined }),
      ),
    ).toBe(true);
    expect(
      discoveredDeviceMatchesRecord(
        discovered({ deviceId: undefined, hostname: undefined }),
        record({
          discoveryId: undefined,
          endpoints: [
            {
              endpointId: "ws://192.168.1.50:7497",
              scheme: "ws",
              host: "192.168.1.50",
              port: 7497,
              source: "manual",
            },
          ],
          preferredEndpointId: "ws://192.168.1.50:7497",
        }),
      ),
    ).toBe(true);
  });

  it("does not merge conflicting IDs or endpoints on another port", () => {
    expect(
      discoveredDeviceMatchesRecord(
        discovered({ deviceId: "other-core" }),
        record(),
      ),
    ).toBe(false);
    expect(
      discoveredDeviceMatchesRecord(
        discovered({ deviceId: undefined, hostname: undefined, port: 8500 }),
        record({ discoveryId: undefined }),
      ),
    ).toBe(false);
  });
});
