import { useCallback, useRef, useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { v4 as uuidv4 } from "uuid";
import {
  credentialKeyForRecord,
  credentialStore,
  normalizeDeviceKey,
} from "@/lib/crypto/credentials";
import {
  parseDeviceEndpoint,
  replaceDeviceEndpointHost,
  type DeviceEndpointScheme,
  type ParsedDeviceEndpoint,
} from "@/lib/devices/endpoint";
import { logger } from "@/lib/logger";

export const DEVICE_REGISTRY_KEY = "deviceRegistryV2";
const LEGACY_ADDRESS_KEY = "deviceAddress";
const LEGACY_HISTORY_KEY = "deviceHistory";
const SCHEMA_VERSION = 2;

export type DeviceEndpointSource = "manual" | "mdns";

export interface DeviceEndpoint {
  endpointId: string;
  scheme: DeviceEndpointScheme;
  host: string;
  port: number;
  source: DeviceEndpointSource;
  lastSeenAt?: number;
  /**
   * Addresses the last mDNS advertisement for this endpoint resolved to.
   *
   * The endpoint keeps its `.local` hostname as the canonical identity — that
   * is what survives the device changing IP — but iOS WebSockets do not
   * reliably resolve `.local` themselves, so the socket dials one of these
   * instead when they are known.
   */
  resolvedAddresses?: string[];
}

export interface DeviceRecord {
  recordId: string;
  discoveryId?: string;
  endpoints: DeviceEndpoint[];
  preferredEndpointId: string;
  /**
   * A pre-V2 credential key this record may still hold its pairing under.
   *
   * Credentials used to be keyed by address, which is why this exists at all:
   * every record created from an address the user had already used needs one
   * lookup at the old key before the canonical `record:<id>` key exists. It is
   * cleared by `markConnected` the moment the peer authenticates with it, so a
   * record carries it at most until its first encrypted connection.
   */
  legacyCredentialKey?: string;
  name?: string;
  nameIsCustom?: boolean;
  platform?: string;
  version?: string;
  lastConnectedAt?: number;
}

export interface DeviceRegistryV2 {
  schemaVersion: 2;
  activeRecordId: string | null;
  records: Record<string, DeviceRecord>;
}

export interface DeviceRegistrySnapshot extends DeviceRegistryV2 {
  hydrated: boolean;
  hydrationError: string | null;
}

interface LegacyHistoryEntry {
  address: string;
  name?: string;
  nameIsCustom?: boolean;
  platform?: string;
  version?: string;
  lastConnectedAt?: number;
}

export interface DiscoveredDeviceRegistration {
  discoveryId?: string;
  hostname?: string;
  addresses: string[];
  port: number;
  name?: string;
  platform?: string;
  version?: string;
}

/** Metadata learned from the device itself, never from the user. */
export interface DiscoveredDeviceMetadata {
  name?: string;
  platform?: string;
  version?: string;
}

function emptySnapshot(): DeviceRegistrySnapshot {
  return {
    schemaVersion: SCHEMA_VERSION,
    activeRecordId: null,
    records: {},
    hydrated: false,
    hydrationError: null,
  };
}

function normalizeDiscoveryId(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * Set equality, not sequence equality. Both sides are deduped, so matching
 * lengths plus containment is enough. An mDNS re-announcement is free to list
 * the same addresses in a different order, and treating that as a change would
 * rewrite the record and republish the registry for nothing.
 */
function sameAddressSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;
  const existing = new Set(left);
  return right.every((address) => existing.has(address));
}

function endpointFromParsed(
  endpoint: ParsedDeviceEndpoint,
  source: DeviceEndpointSource,
  details: Pick<DeviceEndpoint, "lastSeenAt" | "resolvedAddresses"> = {},
): DeviceEndpoint {
  return {
    endpointId: endpoint.endpointId,
    scheme: endpoint.scheme,
    host: endpoint.host,
    port: endpoint.port,
    source,
    ...(details.lastSeenAt !== undefined
      ? { lastSeenAt: details.lastSeenAt }
      : {}),
    ...(details.resolvedAddresses
      ? { resolvedAddresses: unique(details.resolvedAddresses) }
      : {}),
  };
}

/**
 * The endpoint a record connects through, falling back to the first one when
 * `preferredEndpointId` no longer names an endpoint the record holds.
 *
 * Both public accessors go through here so they can never disagree about which
 * endpoint is preferred — resolving it twice once dropped `resolvedAddresses`
 * in exactly the case the fallback exists for.
 */
function preferredEndpointFor(
  record: DeviceRecord | null | undefined,
): DeviceEndpoint | null {
  if (!record) return null;
  return (
    record.endpoints.find(
      (endpoint) => endpoint.endpointId === record.preferredEndpointId,
    ) ??
    record.endpoints[0] ??
    null
  );
}

export function parsedEndpointForRecord(
  record: DeviceRecord | null | undefined,
): ParsedDeviceEndpoint | null {
  const preferred = preferredEndpointFor(record);
  if (!preferred) return null;
  const result = parseDeviceEndpoint(preferred.endpointId);
  return result.ok ? result.endpoint : null;
}

/**
 * The endpoint to actually dial: the preferred one, with its host swapped for
 * a resolved address when mDNS supplied one.
 *
 * The record keeps the `.local` hostname — that is the identity that survives
 * a DHCP move — while the socket gets an address iOS can reach without doing
 * its own multicast resolution.
 */
export function resolvedEndpointForRecord(
  record: DeviceRecord | null | undefined,
): ParsedDeviceEndpoint | null {
  const preferred = preferredEndpointFor(record);
  const parsed = parsedEndpointForRecord(record);
  if (!parsed || !preferred) return parsed;
  const resolvedAddress = preferred.resolvedAddresses?.[0];
  return resolvedAddress
    ? replaceDeviceEndpointHost(parsed, resolvedAddress)
    : parsed;
}

/** The active record's display address, or `""` before hydration. */
export function activeAddressOf(snapshot: DeviceRegistrySnapshot): string {
  const record = snapshot.activeRecordId
    ? snapshot.records[snapshot.activeRecordId]
    : null;
  return parsedEndpointForRecord(record)?.address ?? "";
}

function validEndpoint(value: unknown): value is DeviceEndpoint {
  if (typeof value !== "object" || value === null) return false;
  const endpoint = value as Partial<DeviceEndpoint>;
  if (
    typeof endpoint.endpointId !== "string" ||
    (endpoint.scheme !== "ws" && endpoint.scheme !== "wss") ||
    typeof endpoint.host !== "string" ||
    typeof endpoint.port !== "number" ||
    (endpoint.source !== "manual" && endpoint.source !== "mdns")
  ) {
    return false;
  }
  const parsed = parseDeviceEndpoint(endpoint.endpointId);
  return (
    parsed.ok &&
    parsed.endpoint.scheme === endpoint.scheme &&
    parsed.endpoint.host === endpoint.host &&
    parsed.endpoint.port === endpoint.port &&
    (endpoint.resolvedAddresses === undefined ||
      (Array.isArray(endpoint.resolvedAddresses) &&
        endpoint.resolvedAddresses.every(
          (address) => typeof address === "string",
        )))
  );
}

function validRecord(key: string, value: unknown): value is DeviceRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<DeviceRecord>;
  return (
    record.recordId === key &&
    Array.isArray(record.endpoints) &&
    record.endpoints.length > 0 &&
    record.endpoints.every(validEndpoint) &&
    typeof record.preferredEndpointId === "string" &&
    record.endpoints.some(
      (endpoint) => endpoint.endpointId === record.preferredEndpointId,
    ) &&
    (record.legacyCredentialKey === undefined ||
      typeof record.legacyCredentialKey === "string")
  );
}

/**
 * Returns null only when the stored blob is structurally unusable. Individual
 * records that no longer validate are dropped so one bad record cannot cost the
 * user every other device.
 */
export function parseDeviceRegistry(value: unknown): DeviceRegistryV2 | null {
  if (typeof value !== "object" || value === null) return null;
  const registry = value as Partial<DeviceRegistryV2>;
  if (
    registry.schemaVersion !== SCHEMA_VERSION ||
    (registry.activeRecordId !== null &&
      typeof registry.activeRecordId !== "string") ||
    typeof registry.records !== "object" ||
    registry.records === null
  ) {
    return null;
  }

  const records: Record<string, DeviceRecord> = {};
  const dropped: string[] = [];
  for (const [key, record] of Object.entries(registry.records)) {
    if (validRecord(key, record)) {
      records[key] = record;
    } else {
      dropped.push(key);
    }
  }

  if (dropped.length > 0) {
    logger.error(
      "Dropped unreadable device records",
      new Error(`Dropped ${dropped.length} device record(s)`),
      {
        category: "storage",
        action: "parseDeviceRegistry",
        severity: "warning",
      },
    );
  }

  const activeRecordId =
    registry.activeRecordId !== null &&
    records[registry.activeRecordId] !== undefined
      ? registry.activeRecordId
      : null;

  return { schemaVersion: SCHEMA_VERSION, activeRecordId, records };
}

function legacyHistoryEntries(value: string | null): LegacyHistoryEntry[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is LegacyHistoryEntry =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as LegacyHistoryEntry).address === "string",
    );
  } catch {
    return [];
  }
}

function createRecord(
  endpoint: ParsedDeviceEndpoint,
  source: DeviceEndpointSource,
  meta: Partial<LegacyHistoryEntry> = {},
  legacyCredentialKey = normalizeDeviceKey(endpoint.address),
): DeviceRecord {
  return {
    recordId: uuidv4(),
    endpoints: [endpointFromParsed(endpoint, source)],
    preferredEndpointId: endpoint.endpointId,
    ...(legacyCredentialKey ? { legacyCredentialKey } : {}),
    ...(meta.name ? { name: meta.name } : {}),
    ...(meta.nameIsCustom !== undefined
      ? { nameIsCustom: meta.nameIsCustom }
      : {}),
    ...(meta.platform ? { platform: meta.platform } : {}),
    ...(meta.version ? { version: meta.version } : {}),
    ...(meta.lastConnectedAt !== undefined
      ? { lastConnectedAt: meta.lastConnectedAt }
      : {}),
  };
}

/**
 * Build the V2 registry from the pre-V2 `deviceAddress` + `deviceHistory` keys.
 *
 * Runs exactly once per install: `hydrate` persists the result and deletes both
 * legacy keys, so nothing here is reachable on any later launch. Each history
 * entry becomes one record carrying the address-derived credential key it was
 * paired under, which is what lets the upgrade keep existing pairings.
 */
function importLegacyRegistry(
  legacyAddress: string | null,
  historyValue: string | null,
): DeviceRegistryV2 {
  const records: Record<string, DeviceRecord> = {};
  const endpointToRecord = new Map<string, string>();

  for (const entry of legacyHistoryEntries(historyValue)) {
    const parsed = parseDeviceEndpoint(entry.address);
    if (!parsed.ok) continue;

    const existingId = endpointToRecord.get(parsed.endpoint.endpointId);
    if (existingId) {
      const existing = records[existingId];
      if (!existing) continue;
      // Duplicate addresses in the legacy list are a merge, not a second
      // device: later entries fill in metadata the first one lacked.
      records[existingId] = {
        ...existing,
        ...(entry.name ? { name: entry.name } : {}),
        ...(entry.nameIsCustom !== undefined
          ? { nameIsCustom: entry.nameIsCustom }
          : {}),
        ...(entry.platform ? { platform: entry.platform } : {}),
        ...(entry.version ? { version: entry.version } : {}),
        ...(entry.lastConnectedAt !== undefined
          ? { lastConnectedAt: entry.lastConnectedAt }
          : {}),
      };
      continue;
    }

    // The credential key is derived from the address exactly as the pre-V2 code
    // derived it, so imported keys match what is actually in secure storage.
    const record = createRecord(
      parsed.endpoint,
      "manual",
      entry,
      normalizeDeviceKey(entry.address),
    );
    records[record.recordId] = record;
    endpointToRecord.set(parsed.endpoint.endpointId, record.recordId);
  }

  let activeRecordId: string | null = null;
  const parsedActive = parseDeviceEndpoint(legacyAddress ?? "");
  if (parsedActive.ok) {
    activeRecordId =
      endpointToRecord.get(parsedActive.endpoint.endpointId) ?? null;
    if (!activeRecordId) {
      // Connected to a device that was never written to history.
      const record = createRecord(
        parsedActive.endpoint,
        "manual",
        {},
        normalizeDeviceKey(legacyAddress ?? ""),
      );
      records[record.recordId] = record;
      activeRecordId = record.recordId;
    }
  }

  return { schemaVersion: SCHEMA_VERSION, activeRecordId, records };
}

/**
 * The pre-V2 active address wrote through to raw localStorage as well as to
 * Preferences, so read both before concluding there was no active device.
 */
function legacyLocalAddress(): string | null {
  try {
    return globalThis.localStorage?.getItem(LEGACY_ADDRESS_KEY) ?? null;
  } catch {
    return null;
  }
}

/**
 * The address a browser session should adopt when it has no stored devices.
 *
 * The web build is served *by* Core, so the page origin is the device. Seeding
 * it as a real record at hydrate — rather than falling back to the hostname at
 * every read site — is what lets everything downstream assume a record exists.
 */
function webFallbackRegistry(): DeviceRegistryV2 | null {
  if (Capacitor.isNativePlatform()) return null;
  const parsed = parseDeviceEndpoint(globalThis.location?.hostname ?? "");
  if (!parsed.ok) return null;
  const record = createRecord(parsed.endpoint, "manual");
  return {
    schemaVersion: SCHEMA_VERSION,
    activeRecordId: record.recordId,
    records: { [record.recordId]: record },
  };
}

class DeviceRegistryRepository {
  private snapshot = emptySnapshot();
  private readonly listeners = new Set<() => void>();
  private hydrationPromise: Promise<void> | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  getSnapshot = (): DeviceRegistrySnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(next: DeviceRegistrySnapshot): void {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }

  private persist(registry: DeviceRegistryV2): Promise<void> {
    const serialized = JSON.stringify(registry);
    const write = async () => {
      await Preferences.set({ key: DEVICE_REGISTRY_KEY, value: serialized });
    };
    const next = this.writeChain.then(write, write);
    this.writeChain = next.catch((error) => {
      logger.error("Failed to persist device registry", error, {
        category: "storage",
        action: "persistDeviceRegistry",
        severity: "error",
      });
    });
    return next;
  }

  /**
   * Drop the pre-V2 keys once their contents are safely in the registry blob.
   * This is what makes the legacy read genuinely one-shot — while these survive,
   * a registry that ever had to be rebuilt would re-import addresses the user
   * has since deleted.
   *
   * Never throws: the import already succeeded by this point, and failing to
   * tidy up is not a reason to declare hydration failed.
   */
  private async clearLegacyState(): Promise<void> {
    try {
      globalThis.localStorage?.removeItem(LEGACY_ADDRESS_KEY);
      globalThis.localStorage?.removeItem(LEGACY_HISTORY_KEY);
    } catch {
      // Storage access can be unavailable in private browser contexts.
    }

    try {
      await Promise.all([
        Preferences.remove({ key: LEGACY_ADDRESS_KEY }),
        Preferences.remove({ key: LEGACY_HISTORY_KEY }),
      ]);
    } catch (error) {
      logger.error("Failed to clear legacy device keys", error, {
        category: "storage",
        action: "clearLegacyDeviceState",
        severity: "warning",
      });
    }
  }

  private commit(
    update: (registry: DeviceRegistryV2) => DeviceRegistryV2,
  ): Promise<void> {
    if (!this.snapshot.hydrated) {
      const error = new Error(
        "Device registry was never read successfully; refusing to overwrite stored devices",
      );
      logger.error("Refused device registry write before hydration", error, {
        category: "storage",
        action: "commitDeviceRegistry",
        severity: "error",
      });
      return Promise.reject(error);
    }

    const next = update({
      schemaVersion: SCHEMA_VERSION,
      activeRecordId: this.snapshot.activeRecordId,
      records: this.snapshot.records,
    });
    this.publish({ ...next, hydrated: true, hydrationError: null });
    return this.persist(next);
  }

  hydrate(): Promise<void> {
    if (this.snapshot.hydrated) return Promise.resolve();
    if (this.hydrationPromise) return this.hydrationPromise;

    this.hydrationPromise = (async () => {
      try {
        const [registryValue, legacyAddress, legacyHistory] = await Promise.all(
          [
            Preferences.get({ key: DEVICE_REGISTRY_KEY }),
            Preferences.get({ key: LEGACY_ADDRESS_KEY }),
            Preferences.get({ key: LEGACY_HISTORY_KEY }),
          ],
        );

        let registry: DeviceRegistryV2 | null = null;
        if (registryValue.value) {
          try {
            registry = parseDeviceRegistry(JSON.parse(registryValue.value));
          } catch {
            registry = null;
          }

          if (!registry) {
            // A stored blob we cannot read is not the same as a first run.
            // Re-importing legacy state here would overwrite whatever is
            // actually on disk, so surface it and leave the blob untouched.
            logger.error(
              "Stored device registry is unreadable",
              new Error("Unreadable device registry"),
              {
                category: "storage",
                action: "hydrateDeviceRegistry",
                severity: "error",
              },
            );
            this.publish({
              ...emptySnapshot(),
              hydrated: false,
              hydrationError: "registry_unreadable",
            });
            return;
          }
        }

        if (!registry) {
          const imported = importLegacyRegistry(
            legacyAddress.value ?? legacyLocalAddress(),
            legacyHistory.value,
          );
          registry =
            Object.keys(imported.records).length > 0
              ? imported
              : (webFallbackRegistry() ?? imported);
          await this.persist(registry);
        }

        if (
          legacyAddress.value !== null ||
          legacyHistory.value !== null ||
          legacyLocalAddress() !== null
        ) {
          await this.clearLegacyState();
        }

        this.publish({ ...registry, hydrated: true, hydrationError: null });
      } catch (error) {
        logger.error("Failed to hydrate device registry", error, {
          category: "storage",
          action: "hydrateDeviceRegistry",
          severity: "error",
        });
        // Stay unhydrated so the next mutator retries the read. Marking a
        // failed read as hydrated would let commit() persist an empty registry
        // over the stored one.
        this.publish({
          ...emptySnapshot(),
          hydrated: false,
          hydrationError: "hydrate_failed",
        });
      }
    })().finally(() => {
      this.hydrationPromise = null;
    });

    return this.hydrationPromise;
  }

  activeRecord(): DeviceRecord | null {
    return this.snapshot.activeRecordId
      ? (this.snapshot.records[this.snapshot.activeRecordId] ?? null)
      : null;
  }

  activeEndpoint(): ParsedDeviceEndpoint | null {
    return parsedEndpointForRecord(this.activeRecord());
  }

  /** Make the record at `address` active, creating it if it is new. */
  async selectAddress(address: string): Promise<DeviceRecord | null> {
    await this.hydrate();
    const parsed = parseDeviceEndpoint(address);
    if (!parsed.ok) return null;

    const existing = Object.values(this.snapshot.records).find((record) =>
      record.endpoints.some(
        (endpoint) => endpoint.endpointId === parsed.endpoint.endpointId,
      ),
    );
    const record =
      existing ??
      createRecord(
        parsed.endpoint,
        "manual",
        {},
        // Keyed off the address the user actually typed, not the canonical
        // form, so a pairing stored by an older build is still found.
        normalizeDeviceKey(address),
      );

    await this.commit((registry) => ({
      ...registry,
      activeRecordId: record.recordId,
      records: existing
        ? registry.records
        : { ...registry.records, [record.recordId]: record },
    }));
    return record;
  }

  /** Make the record for an mDNS announcement active, creating it if it is new. */
  async selectDiscovered(
    device: DiscoveredDeviceRegistration,
  ): Promise<DeviceRecord | null> {
    await this.hydrate();
    const hostname = device.hostname?.replace(/\.+$/, "").toLowerCase();
    const connectionHost = hostname || device.addresses[0];
    if (!connectionHost) return null;
    const parsed = parseDeviceEndpoint(
      `${connectionHost.includes(":") ? `[${connectionHost}]` : connectionHost}:${device.port}`,
    );
    if (!parsed.ok) return null;

    // A service name identifies a device; an address does not. When the
    // announcement carries one, it is the only thing matched on — falling back
    // to the address would hand a device that inherited a DHCP lease the
    // previous occupant's record, and with it that record's credentials. Only
    // an announcement with no service name at all may match on its address, and
    // then only against records that are themselves unidentified.
    const discoveryId = normalizeDiscoveryId(device.discoveryId);
    const existing = discoveryId
      ? Object.values(this.snapshot.records).find(
          (record) => record.discoveryId === discoveryId,
        )
      : Object.values(this.snapshot.records).find(
          (record) =>
            record.discoveryId === undefined &&
            record.endpoints.some(
              (endpoint) =>
                endpoint.source === "mdns" &&
                endpoint.endpointId === parsed.endpoint.endpointId,
            ),
        );

    const resolvedAddresses = unique(device.addresses);
    const existingEndpoint = existing?.endpoints.find(
      (endpoint) => endpoint.endpointId === parsed.endpoint.endpointId,
    );

    // Compare against what the commit below would actually write: a custom name
    // is never overwritten and empty metadata is never applied, so testing
    // fields the commit refuses to change would make this permanently false and
    // rewrite the record on every mDNS announcement.
    const unchanged =
      existing !== undefined &&
      existing.discoveryId === discoveryId &&
      existing.preferredEndpointId === parsed.endpoint.endpointId &&
      existingEndpoint?.source === "mdns" &&
      sameAddressSet(
        existingEndpoint.resolvedAddresses ?? [],
        resolvedAddresses,
      ) &&
      (!device.name ||
        existing.nameIsCustom === true ||
        existing.name === device.name) &&
      (!device.platform || existing.platform === device.platform) &&
      (!device.version || existing.version === device.version);
    if (unchanged) {
      if (this.snapshot.activeRecordId !== existing.recordId) {
        await this.setActiveRecord(existing.recordId);
      }
      return existing;
    }

    const discoveredEndpoint = endpointFromParsed(parsed.endpoint, "mdns", {
      lastSeenAt: Date.now(),
      resolvedAddresses,
    });
    const base =
      existing ??
      // Before the registry, picking a device from a scan saved it by IP even
      // when it advertised a hostname. A new record connects by hostname, so
      // the advertised address is where any existing pairing still lives.
      createRecord(
        parsed.endpoint,
        "mdns",
        {},
        device.addresses[0]
          ? normalizeDeviceKey(`${device.addresses[0]}:${device.port}`)
          : normalizeDeviceKey(parsed.endpoint.address),
      );
    const record: DeviceRecord = {
      ...base,
      ...(discoveryId ? { discoveryId } : {}),
      endpoints: [
        ...base.endpoints.filter(
          (endpoint) => endpoint.endpointId !== discoveredEndpoint.endpointId,
        ),
        discoveredEndpoint,
      ],
      preferredEndpointId: discoveredEndpoint.endpointId,
      ...(device.name && !base.nameIsCustom ? { name: device.name } : {}),
      ...(device.platform ? { platform: device.platform } : {}),
      ...(device.version ? { version: device.version } : {}),
    };

    await this.commit((registry) => ({
      ...registry,
      activeRecordId: record.recordId,
      records: { ...registry.records, [record.recordId]: record },
    }));
    return record;
  }

  /**
   * Record a successful connection, and absorb the duplicate record that a
   * proven credential key identifies.
   *
   * `provenLegacyKey` is only ever supplied after the peer has authenticated
   * with the credentials stored under it, which is the one unforgeable signal
   * that two records are the same physical device. Matching on a shared address
   * instead would be wrong: DHCP hands leases around, so the device answering at
   * an address today need not be the one that answered yesterday.
   *
   * `migrationSettled` is the caller's report that no pre-V2 key can still hold
   * this record's pairing — either it was promoted to the canonical key, or
   * there was never anything under it. Only then is the pointer dropped.
   */
  async markConnected(
    recordId: string,
    options: { provenLegacyKey?: string; migrationSettled?: boolean } = {},
  ): Promise<void> {
    await this.hydrate();
    const target = this.snapshot.records[recordId];
    if (!target) return;

    const provenKey = options.provenLegacyKey;
    const absorbed = provenKey
      ? Object.values(this.snapshot.records).filter(
          (record) =>
            record.recordId !== recordId &&
            record.legacyCredentialKey === provenKey,
        )
      : [];

    const endpoints = new Map(
      target.endpoints.map((endpoint) => [endpoint.endpointId, endpoint]),
    );
    for (const source of absorbed) {
      for (const endpoint of source.endpoints) {
        if (!endpoints.has(endpoint.endpointId)) {
          endpoints.set(endpoint.endpointId, endpoint);
        }
      }
    }

    const donor = absorbed[0];
    const merged: DeviceRecord = {
      ...target,
      endpoints: [...endpoints.values()],
      lastConnectedAt: Date.now(),
      name: target.name ?? donor?.name,
      nameIsCustom: target.nameIsCustom ?? donor?.nameIsCustom,
      platform: target.platform ?? donor?.platform,
      version: target.version ?? donor?.version,
    };
    if (options.migrationSettled) {
      delete merged.legacyCredentialKey;
    }

    await this.commit((registry) => {
      const records = { ...registry.records, [recordId]: merged };
      for (const source of absorbed) delete records[source.recordId];
      return { ...registry, activeRecordId: recordId, records };
    });
  }

  /**
   * Apply metadata the device reported about itself. Never touches a name the
   * user chose, and treats blank values as "no information" rather than as an
   * instruction to clear a good one.
   */
  async applyDiscoveredMetadata(
    recordId: string,
    metadata: DiscoveredDeviceMetadata,
  ): Promise<void> {
    await this.hydrate();
    const record = this.snapshot.records[recordId];
    if (!record) return;

    const next: DeviceRecord = {
      ...record,
      ...(metadata.name && !record.nameIsCustom ? { name: metadata.name } : {}),
      ...(metadata.platform ? { platform: metadata.platform } : {}),
      ...(metadata.version ? { version: metadata.version } : {}),
    };
    if (
      next.name === record.name &&
      next.platform === record.platform &&
      next.version === record.version
    ) {
      return;
    }

    await this.commit((registry) => ({
      ...registry,
      records: { ...registry.records, [recordId]: next },
    }));
  }

  /**
   * Record the addresses an mDNS advertisement resolved this record's preferred
   * endpoint to, so the socket can dial one instead of a `.local` hostname.
   *
   * Deliberately narrower than `selectDiscovered`: this only annotates the
   * record the caller names, where `selectDiscovered` matches an announcement
   * against the whole registry and may create a record or switch the active
   * one. A background browse running behind a live connection must never do
   * either of those things.
   */
  async noteResolvedAddresses(
    recordId: string,
    addresses: readonly string[],
  ): Promise<void> {
    await this.hydrate();
    const record = this.snapshot.records[recordId];
    const preferred = preferredEndpointFor(record);
    if (!record || !preferred) return;

    const resolved = unique(addresses.filter((address) => address.length > 0));
    if (
      resolved.length === 0 ||
      sameAddressSet(preferred.resolvedAddresses ?? [], resolved)
    ) {
      // mDNS re-announces constantly; only a genuine change is worth a write.
      return;
    }

    const next: DeviceRecord = {
      ...record,
      endpoints: record.endpoints.map((endpoint) =>
        endpoint.endpointId === preferred.endpointId
          ? { ...endpoint, resolvedAddresses: resolved }
          : endpoint,
      ),
    };

    await this.commit((registry) => ({
      ...registry,
      records: { ...registry.records, [recordId]: next },
    }));
  }

  /** Set or clear the user's own name for a record. Blank clears it. */
  async setCustomName(recordId: string, name: string): Promise<void> {
    await this.hydrate();
    const record = this.snapshot.records[recordId];
    if (!record) return;

    const trimmed = name.trim();
    const next: DeviceRecord = { ...record };
    if (trimmed) {
      next.name = trimmed;
      next.nameIsCustom = true;
    } else {
      delete next.name;
      next.nameIsCustom = false;
    }

    await this.commit((registry) => ({
      ...registry,
      records: { ...registry.records, [recordId]: next },
    }));
  }

  /**
   * Forget a device, taking its stored pairing with it.
   *
   * Deleting the credentials here rather than at the call site is deliberate:
   * the registry is the only thing that knows whether a surviving record still
   * claims the same pre-V2 key, and a record the user did not ask to forget must
   * not be silently unpaired.
   */
  async removeRecord(recordId: string): Promise<DeviceRecord | null> {
    await this.hydrate();
    const removed = this.snapshot.records[recordId] ?? null;
    if (!removed) return null;

    await this.commit((registry) => {
      const records = { ...registry.records };
      delete records[recordId];
      return {
        ...registry,
        activeRecordId:
          registry.activeRecordId === recordId ? null : registry.activeRecordId,
        records,
      };
    });

    const keys = [credentialKeyForRecord(recordId)];
    const legacyKey = removed.legacyCredentialKey;
    if (
      legacyKey &&
      !Object.values(this.snapshot.records).some(
        (record) => record.legacyCredentialKey === legacyKey,
      )
    ) {
      keys.push(legacyKey);
    }
    await Promise.all(keys.map((key) => credentialStore.delete(key)));

    return removed;
  }

  async setActiveRecord(recordId: string | null): Promise<void> {
    await this.hydrate();
    if (recordId !== null && !this.snapshot.records[recordId]) return;
    if (this.snapshot.activeRecordId === recordId) return;
    await this.commit((registry) => ({
      ...registry,
      activeRecordId: recordId,
    }));
  }

  resetForTests(): void {
    this.snapshot = emptySnapshot();
    this.hydrationPromise = null;
    this.writeChain = Promise.resolve();
    this.listeners.clear();
  }

  /**
   * Test-only: adopt a registry state as though storage had just been read.
   *
   * Listeners survive, so a test can install a different set of devices while
   * components are mounted and they will re-render exactly as they would after a
   * real write.
   */
  installForTests(registry: DeviceRegistryV2): void {
    this.hydrationPromise = null;
    this.publish({ ...registry, hydrated: true, hydrationError: null });
  }
}

export const deviceRegistry = new DeviceRegistryRepository();

/**
 * Subscribe to a slice of the registry.
 *
 * The selector runs *inside* the snapshot getter rather than on its result.
 * `publish` allocates a fresh snapshot on every commit, so selecting afterwards
 * gives useSyncExternalStore nothing to compare but snapshot identity — every
 * registry write would re-render every consumer, and `ConnectionProvider` holds
 * several subscriptions at the root of the tree. Selecting first lets React bail
 * out when the slice is unchanged, which is what a metadata-only write produces
 * for almost every consumer.
 *
 * The per-snapshot cache is not an optimization: React calls the getter more
 * than once per render and requires a stable result, so a selector that builds a
 * new value would otherwise never settle. It is held in a ref rather than a memo
 * closure because `react-hooks/immutability` forbids reassigning a closure
 * variable after render.
 */
export function useDeviceRegistry<T>(
  selector: (snapshot: DeviceRegistrySnapshot) => T,
): T {
  const cache = useRef<{
    snapshot: DeviceRegistrySnapshot;
    selector: (snapshot: DeviceRegistrySnapshot) => T;
    value: T;
  } | null>(null);

  const getSelection = useCallback((): T => {
    const snapshot = deviceRegistry.getSnapshot();
    const cached = cache.current;
    if (
      cached &&
      cached.snapshot === snapshot &&
      cached.selector === selector
    ) {
      return cached.value;
    }
    const value = selector(snapshot);
    cache.current = { snapshot, selector, value };
    return value;
  }, [selector]);

  return useSyncExternalStore(
    deviceRegistry.subscribe,
    getSelection,
    getSelection,
  );
}

export function __resetDeviceRegistryForTests(): void {
  deviceRegistry.resetForTests();
}
