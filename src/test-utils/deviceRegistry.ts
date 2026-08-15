import { Preferences } from "@capacitor/preferences";
import {
  DEVICE_REGISTRY_KEY,
  deviceRegistry,
  parseDeviceRegistry,
  type DeviceEndpointSource,
  type DeviceRecord,
  type DeviceRegistryV2,
} from "@/lib/devices/deviceRegistry";
import { parseDeviceEndpoint } from "@/lib/devices/endpoint";

export interface DeviceRecordOptions extends Omit<
  Partial<DeviceRecord>,
  "endpoints" | "preferredEndpointId"
> {
  /** Address the record connects through, in any form the parser accepts. */
  address?: string;
  source?: DeviceEndpointSource;
}

let recordCounter = 0;

/**
 * A valid `DeviceRecord` built from an address, so tests don't have to hand-roll
 * endpoint IDs that `parseDeviceRegistry` would reject.
 */
export function mockDeviceRecord(
  options: DeviceRecordOptions = {},
): DeviceRecord {
  const {
    address = "192.168.1.100",
    source = "manual",
    ...overrides
  } = options;
  const parsed = parseDeviceEndpoint(address);
  if (!parsed.ok) {
    throw new Error(`mockDeviceRecord: unparseable address "${address}"`);
  }

  recordCounter += 1;
  return {
    recordId: `record-${recordCounter}`,
    endpoints: [
      {
        endpointId: parsed.endpoint.endpointId,
        scheme: parsed.endpoint.scheme,
        host: parsed.endpoint.host,
        port: parsed.endpoint.port,
        source,
      },
    ],
    preferredEndpointId: parsed.endpoint.endpointId,
    ...overrides,
  };
}

/**
 * Put records in storage and make the registry live with them.
 *
 * The blob is round-tripped through the real parser first, so a record shape the
 * app would drop on a real launch fails the test here instead of quietly working
 * only in test.
 */
export async function seedDeviceRegistry(
  records: DeviceRecord[],
  activeRecordId: string | null = records[0]?.recordId ?? null,
): Promise<void> {
  const registry: DeviceRegistryV2 = {
    schemaVersion: 2,
    activeRecordId,
    records: Object.fromEntries(
      records.map((record) => [record.recordId, record]),
    ),
  };
  const serialized = JSON.stringify(registry);

  const parsed = parseDeviceRegistry(JSON.parse(serialized));
  if (!parsed || Object.keys(parsed.records).length !== records.length) {
    throw new Error(
      "seedDeviceRegistry: the registry parser rejected a record",
    );
  }

  await Preferences.set({ key: DEVICE_REGISTRY_KEY, value: serialized });
  deviceRegistry.installForTests(parsed);
}

/** Seed a single record and make it active. Returns the record. */
export async function seedActiveDevice(
  options: DeviceRecordOptions = {},
): Promise<DeviceRecord> {
  const record = mockDeviceRecord(options);
  await seedDeviceRegistry([record], record.recordId);
  return record;
}
