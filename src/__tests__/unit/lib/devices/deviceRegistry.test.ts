/**
 * Unit Tests: device registry
 *
 * The migration block matters more than the rest put together: it runs exactly
 * once per install, it is the only thing standing between an upgrading user and
 * having to re-pair every device, and there is no second chance if it is wrong.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import {
  __resetDeviceRegistryForTests,
  activeAddressOf,
  DEVICE_REGISTRY_KEY,
  deviceRegistry,
  parseDeviceRegistry,
  parsedEndpointForRecord,
  resolvedEndpointForRecord,
  resolvedEndpointsForRecord,
  type DeviceRecord,
} from "@/lib/devices/deviceRegistry";
import {
  credentialKeyForRecord,
  credentialStore,
  normalizeDeviceKey,
  type StoredCredentials,
} from "@/lib/crypto/credentials";

const creds: StoredCredentials = {
  authToken: "token-abc",
  pairingKey: "a".repeat(64),
  clientId: "client-uuid-1234",
  pairedAt: 1700000000000,
};

/** The registry blob as it actually sits in storage. */
async function storedRegistry() {
  const stored = await Preferences.get({ key: DEVICE_REGISTRY_KEY });
  return stored.value ? parseDeviceRegistry(JSON.parse(stored.value)) : null;
}

function records(): DeviceRecord[] {
  return Object.values(deviceRegistry.getSnapshot().records);
}

/** Re-read a record from the live snapshot rather than trusting a stale copy. */
function recordById(recordId: string): DeviceRecord | undefined {
  return deviceRegistry.getSnapshot().records[recordId];
}

beforeEach(async () => {
  __resetDeviceRegistryForTests();
  localStorage.clear();
  await Preferences.clear();
  vi.clearAllMocks();
  // Native is the case that matters: the web build seeds itself from the page
  // origin, which would otherwise add a record to every test below.
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
});

afterEach(() => {
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
});

describe("migrating pre-V2 devices", () => {
  it("should import history and the active address into records", async () => {
    await Preferences.set({ key: "deviceAddress", value: "steamdeck.local" });
    await Preferences.set({
      key: "deviceHistory",
      value: JSON.stringify([
        {
          address: "steamdeck.local",
          name: "Deck",
          nameIsCustom: true,
          platform: "linux",
          version: "2.5.0",
          lastConnectedAt: 123,
        },
        { address: "10.0.0.50:8080", name: "Basement" },
      ]),
    });

    await deviceRegistry.hydrate();

    expect(deviceRegistry.getSnapshot().hydrated).toBe(true);
    expect(records()).toHaveLength(2);
    expect(deviceRegistry.activeEndpoint()?.address).toBe("steamdeck.local");
    expect(deviceRegistry.activeRecord()).toMatchObject({
      name: "Deck",
      nameIsCustom: true,
      platform: "linux",
      version: "2.5.0",
      lastConnectedAt: 123,
      legacyCredentialKey: "steamdeck.local",
    });
    expect(
      records().find((record) => record.name === "Basement"),
    ).toMatchObject({ legacyCredentialKey: "10.0.0.50:8080" });
  });

  it("should keep an imported pairing readable under its new record", async () => {
    await credentialStore.set(normalizeDeviceKey("steamdeck.local"), creds);
    await Preferences.set({ key: "deviceAddress", value: "steamdeck.local" });
    await Preferences.set({
      key: "deviceHistory",
      value: JSON.stringify([{ address: "steamdeck.local" }]),
    });

    await deviceRegistry.hydrate();

    const record = deviceRegistry.activeRecord()!;
    await expect(
      credentialStore.getForRecord(record.recordId, record.legacyCredentialKey),
    ).resolves.toEqual({
      credentials: creds,
      legacyKeyUsed: "steamdeck.local",
    });
  });

  it("should import an IPv6 device under the key it was paired with", async () => {
    // Pre-V2 stored the bare form; the registry canonicalises to brackets, so
    // the credential key has to stay in the old shape or the pairing is lost.
    await credentialStore.set("::1", creds);
    await Preferences.set({ key: "deviceAddress", value: "::1" });

    await deviceRegistry.hydrate();

    const record = deviceRegistry.activeRecord()!;
    expect(deviceRegistry.activeEndpoint()?.address).toBe("[::1]");
    expect(record.legacyCredentialKey).toBe("::1");
    await expect(
      credentialStore.getForRecord(record.recordId, record.legacyCredentialKey),
    ).resolves.toMatchObject({ credentials: creds });
  });

  it("should read the active address from localStorage when Preferences has none", async () => {
    localStorage.setItem("deviceAddress", "10.0.0.206");

    await deviceRegistry.hydrate();

    expect(deviceRegistry.activeEndpoint()?.address).toBe("10.0.0.206");
  });

  it("should delete the legacy keys once they are imported", async () => {
    localStorage.setItem("deviceAddress", "steamdeck.local");
    await Preferences.set({ key: "deviceAddress", value: "steamdeck.local" });
    await Preferences.set({
      key: "deviceHistory",
      value: JSON.stringify([{ address: "steamdeck.local", name: "Deck" }]),
    });

    await deviceRegistry.hydrate();

    expect(localStorage.getItem("deviceAddress")).toBeNull();
    expect((await Preferences.get({ key: "deviceAddress" })).value).toBeNull();
    expect((await Preferences.get({ key: "deviceHistory" })).value).toBeNull();
    // The imported state survives the cleanup.
    expect(deviceRegistry.activeEndpoint()?.address).toBe("steamdeck.local");
    expect((await storedRegistry())?.records).toBeDefined();
  });

  it("should keep the entries that parse when others are corrupt", async () => {
    await Preferences.set({ key: "deviceAddress", value: "10.0.0.206" });
    await Preferences.set({
      key: "deviceHistory",
      value: JSON.stringify([
        { address: "10.0.0.206", name: "Good" },
        { address: "999.999.999.999" },
        { name: "no address at all" },
        null,
        "not an object",
      ]),
    });

    await deviceRegistry.hydrate();

    expect(records()).toHaveLength(1);
    expect(deviceRegistry.getSnapshot()).toMatchObject({
      hydrated: true,
      hydrationError: null,
    });
    expect(deviceRegistry.activeRecord()).toMatchObject({ name: "Good" });
  });

  it("should survive a deviceHistory that is not valid JSON", async () => {
    await Preferences.set({ key: "deviceAddress", value: "10.0.0.206" });
    await Preferences.set({ key: "deviceHistory", value: "{not json" });

    await deviceRegistry.hydrate();

    expect(deviceRegistry.getSnapshot().hydrationError).toBeNull();
    expect(deviceRegistry.activeEndpoint()?.address).toBe("10.0.0.206");
  });

  it("should create a record for an active address missing from history", async () => {
    await Preferences.set({ key: "deviceAddress", value: "10.0.0.206" });
    await Preferences.set({
      key: "deviceHistory",
      value: JSON.stringify([{ address: "10.0.0.1" }]),
    });

    await deviceRegistry.hydrate();

    expect(records()).toHaveLength(2);
    expect(deviceRegistry.activeEndpoint()?.address).toBe("10.0.0.206");
  });

  it("should merge duplicate history entries for one address", async () => {
    await Preferences.set({
      key: "deviceHistory",
      value: JSON.stringify([
        { address: "10.0.0.206", name: "Deck" },
        { address: "ws://10.0.0.206:7497/api/v0.1", platform: "linux" },
      ]),
    });

    await deviceRegistry.hydrate();

    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({ name: "Deck", platform: "linux" });
  });

  it("should leave the active record unset when there was no active address", async () => {
    await Preferences.set({
      key: "deviceHistory",
      value: JSON.stringify([{ address: "10.0.0.206" }]),
    });

    await deviceRegistry.hydrate();

    expect(records()).toHaveLength(1);
    expect(deviceRegistry.getSnapshot().activeRecordId).toBeNull();
  });

  it("should not re-import once the legacy keys are gone", async () => {
    await Preferences.set({ key: "deviceAddress", value: "steamdeck.local" });
    await Preferences.set({
      key: "deviceHistory",
      value: JSON.stringify([{ address: "steamdeck.local", name: "Deck" }]),
    });
    await deviceRegistry.hydrate();
    const firstRecordId = deviceRegistry.getSnapshot().activeRecordId;
    expect(firstRecordId).not.toBeNull();

    __resetDeviceRegistryForTests();
    await deviceRegistry.hydrate();

    const resumed = deviceRegistry.getSnapshot();
    expect(resumed.activeRecordId).toBe(firstRecordId);
    expect(Object.keys(resumed.records)).toEqual([firstRecordId]);
  });

  it("should not touch storage on a first run with nothing to migrate", async () => {
    await deviceRegistry.hydrate();

    expect(Preferences.remove).not.toHaveBeenCalled();
    expect(records()).toHaveLength(0);
  });
});

describe("seeding a browser session", () => {
  it("should adopt the page origin when nothing is stored", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    await deviceRegistry.hydrate();

    expect(deviceRegistry.activeEndpoint()?.host).toBe(location.hostname);
    expect(records()).toHaveLength(1);
  });

  it("should prefer imported devices over the page origin", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    await Preferences.set({ key: "deviceAddress", value: "10.0.0.206" });

    await deviceRegistry.hydrate();

    expect(records()).toHaveLength(1);
    expect(deviceRegistry.activeEndpoint()?.address).toBe("10.0.0.206");
  });
});

describe("reading a stored registry", () => {
  it("should refuse to overwrite an unreadable stored registry", async () => {
    await Preferences.set({
      key: DEVICE_REGISTRY_KEY,
      value: JSON.stringify({ schemaVersion: 2, records: "broken" }),
    });
    vi.clearAllMocks();

    await deviceRegistry.hydrate();

    expect(deviceRegistry.getSnapshot()).toMatchObject({
      hydrated: false,
      hydrationError: "registry_unreadable",
    });
    expect(Preferences.set).not.toHaveBeenCalled();
    expect(Preferences.remove).not.toHaveBeenCalled();
  });

  it("should stay unhydrated when storage cannot be read", async () => {
    vi.mocked(Preferences.get).mockRejectedValueOnce(
      new Error("storage offline"),
    );

    await deviceRegistry.hydrate();

    expect(deviceRegistry.getSnapshot()).toMatchObject({
      hydrated: false,
      hydrationError: "hydrate_failed",
    });
  });

  it("should refuse to persist devices while the read is failing", async () => {
    vi.mocked(Preferences.get).mockRejectedValueOnce(
      new Error("storage offline"),
    );

    await expect(deviceRegistry.selectAddress("10.0.0.206")).rejects.toThrow(
      /refusing to overwrite/i,
    );

    expect(Preferences.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ key: DEVICE_REGISTRY_KEY }),
    );
  });

  it("should recover once storage reads succeed again", async () => {
    vi.mocked(Preferences.get).mockRejectedValueOnce(
      new Error("storage offline"),
    );
    await deviceRegistry.hydrate();
    expect(deviceRegistry.getSnapshot().hydrated).toBe(false);

    const record = await deviceRegistry.selectAddress("10.0.0.206");

    expect(record).not.toBeNull();
    expect(deviceRegistry.getSnapshot().hydrated).toBe(true);
    expect(deviceRegistry.activeEndpoint()?.address).toBe("10.0.0.206");
  });

  it("should keep readable records when one stored record is unreadable", async () => {
    const kept = await deviceRegistry.selectAddress("10.0.0.206");
    const dropped = await deviceRegistry.selectAddress("10.0.0.207");
    const stored = await Preferences.get({ key: DEVICE_REGISTRY_KEY });
    const registry = JSON.parse(stored.value!) as {
      activeRecordId: string;
      records: Record<string, { endpoints: unknown[] }>;
    };
    expect(registry.activeRecordId).toBe(dropped!.recordId);
    registry.records[dropped!.recordId] = {
      ...registry.records[dropped!.recordId]!,
      endpoints: [],
    };
    await Preferences.set({
      key: DEVICE_REGISTRY_KEY,
      value: JSON.stringify(registry),
    });

    __resetDeviceRegistryForTests();
    await deviceRegistry.hydrate();

    const snapshot = deviceRegistry.getSnapshot();
    expect(snapshot.hydrated).toBe(true);
    expect(Object.keys(snapshot.records)).toEqual([kept!.recordId]);
    expect(snapshot.activeRecordId).toBeNull();
  });

  it("should reject a registry written by a newer schema", () => {
    expect(parseDeviceRegistry({ schemaVersion: 3, records: {} })).toBeNull();
  });
});

describe("selecting a device by address", () => {
  it("should reuse the record for an equivalent endpoint", async () => {
    const first = await deviceRegistry.selectAddress("HTTP://STEAMDECK.local");
    const second = await deviceRegistry.selectAddress(
      "ws://steamdeck.local:7497/api/v0.1",
    );

    expect(second?.recordId).toBe(first?.recordId);
    expect(records()).toHaveLength(1);
  });

  it("should keep a non-default port on the selected endpoint", async () => {
    await deviceRegistry.selectAddress("192.168.1.100:8080");

    expect(deviceRegistry.activeEndpoint()?.address).toBe("192.168.1.100:8080");
  });

  it("should key a new record on the address the user typed", async () => {
    const record = await deviceRegistry.selectAddress("STEAMDECK.local:7497");

    expect(record?.legacyCredentialKey).toBe("steamdeck.local");
  });

  it("should ignore an address it cannot parse", async () => {
    expect(await deviceRegistry.selectAddress("not a host")).toBeNull();
    expect(records()).toHaveLength(0);
  });

  it("should clear the active selection without discarding the record", async () => {
    const record = await deviceRegistry.selectAddress("192.168.1.100");

    await deviceRegistry.setActiveRecord(null);

    const snapshot = deviceRegistry.getSnapshot();
    expect(snapshot.activeRecordId).toBeNull();
    expect(snapshot.records[record!.recordId]).toBeDefined();
  });
});

describe("the active address every screen displays", () => {
  const address = () => activeAddressOf(deviceRegistry.getSnapshot());

  it("should be empty before the registry hydrates", () => {
    expect(address()).toBe("");
  });

  it("should be the active record's address", async () => {
    await deviceRegistry.selectAddress("192.168.1.100");

    expect(address()).toBe("192.168.1.100");
  });

  it("should keep a port the user typed", async () => {
    await deviceRegistry.selectAddress("192.168.1.100:8080");

    expect(address()).toBe("192.168.1.100:8080");
  });

  it("should follow the active record when the user switches devices", async () => {
    await deviceRegistry.selectAddress("192.168.1.10");
    const second = await deviceRegistry.selectAddress("192.168.1.11");

    await deviceRegistry.setActiveRecord(second!.recordId);

    expect(address()).toBe("192.168.1.11");
  });

  it("should be empty when no record is active", async () => {
    await deviceRegistry.selectAddress("192.168.1.100");

    await deviceRegistry.setActiveRecord(null);

    expect(address()).toBe("");
  });
});

describe("forgetting a device", () => {
  it("should drop the record, its selection, and its pairing", async () => {
    const kept = await deviceRegistry.selectAddress("10.0.0.1");
    const target = await deviceRegistry.selectAddress("10.0.0.2");
    await credentialStore.set(credentialKeyForRecord(target!.recordId), creds);
    await credentialStore.set("10.0.0.2", creds);

    const removed = await deviceRegistry.removeRecord(target!.recordId);

    expect(removed?.recordId).toBe(target!.recordId);
    const snapshot = deviceRegistry.getSnapshot();
    expect(snapshot.activeRecordId).toBeNull();
    expect(Object.keys(snapshot.records)).toEqual([kept!.recordId]);
    await expect(
      credentialStore.get(credentialKeyForRecord(target!.recordId)),
    ).resolves.toBeNull();
    await expect(credentialStore.get("10.0.0.2")).resolves.toBeNull();
  });

  it("should keep a legacy pairing another record still claims", async () => {
    const typed = await deviceRegistry.selectAddress("10.0.0.206");
    const discovered = await deviceRegistry.selectDiscovered({
      discoveryId: "device-a",
      hostname: "steamdeck.local",
      addresses: ["10.0.0.206"],
      port: 7497,
    });
    expect(discovered?.legacyCredentialKey).toBe("10.0.0.206");
    await credentialStore.set("10.0.0.206", creds);

    await deviceRegistry.removeRecord(discovered!.recordId);

    // `typed` is still paired under that key and was not the record forgotten.
    expect(deviceRegistry.getSnapshot().records[typed!.recordId]).toBeDefined();
    await expect(credentialStore.get("10.0.0.206")).resolves.toEqual(creds);
  });

  it("should ignore removal of an unknown record", async () => {
    await deviceRegistry.selectAddress("10.0.0.1");
    vi.clearAllMocks();

    expect(await deviceRegistry.removeRecord("no-such-record")).toBeNull();
    expect(Preferences.set).not.toHaveBeenCalled();
  });
});

describe("selecting a discovered device", () => {
  const announcement = {
    discoveryId: "core-id",
    hostname: "steamdeck.local",
    addresses: ["10.0.0.206"],
    port: 7497,
    name: "Deck",
    platform: "linux",
  };

  it("should connect by hostname but key credentials on the announced address", async () => {
    const record = await deviceRegistry.selectDiscovered(announcement);

    expect(record).toMatchObject({
      discoveryId: "core-id",
      name: "Deck",
      platform: "linux",
      // Pre-V2 saved a scanned device by IP even when it advertised a hostname.
      legacyCredentialKey: "10.0.0.206",
    });
    expect(deviceRegistry.activeEndpoint()?.address).toBe("steamdeck.local");
  });

  it("should follow a device that changed address, matching on discovery ID", async () => {
    const first = await deviceRegistry.selectDiscovered(announcement);
    const second = await deviceRegistry.selectDiscovered({
      ...announcement,
      discoveryId: "CORE-ID",
      hostname: "deck-new.local",
      addresses: ["10.0.0.207"],
      name: "Deck Renamed",
    });

    expect(second?.recordId).toBe(first?.recordId);
    expect(records()).toHaveLength(1);
    expect(second).toMatchObject({ name: "Deck Renamed" });
    expect(second?.endpoints).toHaveLength(2);
    expect(deviceRegistry.activeEndpoint()?.address).toBe("deck-new.local");
  });

  it("should not merge discovered devices solely by shared endpoint", async () => {
    const first = await deviceRegistry.selectDiscovered({
      ...announcement,
      discoveryId: "device-a",
    });
    const second = await deviceRegistry.selectDiscovered({
      ...announcement,
      discoveryId: "device-b",
    });

    expect(second?.recordId).not.toBe(first?.recordId);
    expect(records()).toHaveLength(2);
  });

  it("should not rewrite the record when the same announcement repeats", async () => {
    await deviceRegistry.selectDiscovered(announcement);
    vi.clearAllMocks();

    await deviceRegistry.selectDiscovered(announcement);

    expect(Preferences.set).not.toHaveBeenCalled();
    expect(records()).toHaveLength(1);
  });

  it("should keep a custom name when a later announcement carries a new one", async () => {
    const discovered = await deviceRegistry.selectDiscovered(announcement);
    await deviceRegistry.setCustomName(discovered!.recordId, "Living Room");

    const rediscovered = await deviceRegistry.selectDiscovered({
      ...announcement,
      name: "Deck Renamed",
      version: "2.5.0",
    });

    expect(rediscovered).toMatchObject({
      name: "Living Room",
      nameIsCustom: true,
      version: "2.5.0",
    });
  });

  it("should adopt the announced name again once the custom name is cleared", async () => {
    const discovered = await deviceRegistry.selectDiscovered(announcement);
    await deviceRegistry.setCustomName(discovered!.recordId, "Living Room");

    await deviceRegistry.setCustomName(discovered!.recordId, "  ");
    const rediscovered = await deviceRegistry.selectDiscovered(announcement);

    expect(rediscovered).toMatchObject({ name: "Deck", nameIsCustom: false });
  });

  it("should fall back to an announced address when there is no hostname", async () => {
    const record = await deviceRegistry.selectDiscovered({
      addresses: ["10.0.0.206"],
      port: 8080,
    });

    expect(record).not.toBeNull();
    expect(deviceRegistry.activeEndpoint()?.address).toBe("10.0.0.206:8080");
  });

  it("should ignore an announcement with nowhere to connect", async () => {
    expect(
      await deviceRegistry.selectDiscovered({ addresses: [], port: 7497 }),
    ).toBeNull();
  });

  it("should rewrite the record when the announced addresses change", async () => {
    await deviceRegistry.selectDiscovered(announcement);
    vi.clearAllMocks();

    const moved = await deviceRegistry.selectDiscovered({
      ...announcement,
      addresses: ["10.0.0.219"],
    });

    expect(Preferences.set).toHaveBeenCalled();
    expect(resolvedEndpointForRecord(moved)?.host).toBe("10.0.0.219");
  });
});

// iOS WebSockets don't reliably resolve `.local` themselves, so the socket
// dials a resolved address while the record keeps the hostname that survives
// the device moving.
describe("resolving an mDNS hostname to an address", () => {
  const announcement = {
    discoveryId: "core-id",
    hostname: "steamdeck.local",
    addresses: ["10.0.0.206", "fe80::1"],
    port: 7497,
  };

  it("should dial the resolved address while displaying the hostname", async () => {
    const record = await deviceRegistry.selectDiscovered(announcement);

    expect(parsedEndpointForRecord(record)?.address).toBe("steamdeck.local");
    expect(resolvedEndpointForRecord(record)?.host).toBe("10.0.0.206");
    expect(resolvedEndpointForRecord(record)?.wsUrl).toBe(
      "ws://10.0.0.206:7497/api/v0.1",
    );
  });

  it("should expose every resolved address as a connection candidate", async () => {
    const record = await deviceRegistry.selectDiscovered(announcement);

    expect(
      resolvedEndpointsForRecord(record).map((endpoint) => endpoint.host),
    ).toEqual(["10.0.0.206", "fe80::1", "steamdeck.local"]);
  });

  it("should keep the endpoint's port and scheme when swapping the host", async () => {
    const record = await deviceRegistry.selectDiscovered({
      ...announcement,
      port: 8080,
    });

    expect(resolvedEndpointForRecord(record)?.wsUrl).toBe(
      "ws://10.0.0.206:8080/api/v0.1",
    );
  });

  it("should dial the hostname when nothing has resolved it", async () => {
    const record = await deviceRegistry.selectAddress("steamdeck.local");

    expect(resolvedEndpointForRecord(record)?.host).toBe("steamdeck.local");
  });

  it("should attach resolution to a record the user typed by hand", async () => {
    const typed = await deviceRegistry.selectAddress("steamdeck.local");

    await deviceRegistry.noteResolvedAddresses(typed!.recordId, ["10.0.0.206"]);

    expect(resolvedEndpointForRecord(recordById(typed!.recordId))?.host).toBe(
      "10.0.0.206",
    );
  });

  it("should upgrade an exact manual hostname selected from mDNS", async () => {
    const typed = await deviceRegistry.selectAddress("steamdeck.local");

    const discovered = await deviceRegistry.selectDiscovered(announcement);

    expect(discovered?.recordId).toBe(typed?.recordId);
    expect(records()).toHaveLength(1);
    expect(discovered?.endpoints).toEqual([
      expect.objectContaining({
        endpointId: "ws://steamdeck.local:7497",
        source: "mdns",
        resolvedAddresses: ["10.0.0.206", "fe80::1"],
      }),
    ]);
  });

  it("should retain a known discovery id when an exact hostname omits it", async () => {
    const typed = await deviceRegistry.selectAddress("steamdeck.local");
    deviceRegistry.installForTests({
      schemaVersion: 2,
      activeRecordId: typed!.recordId,
      records: {
        [typed!.recordId]: { ...typed!, discoveryId: "core-a" },
      },
    });

    const discovered = await deviceRegistry.selectDiscovered({
      ...announcement,
      discoveryId: undefined,
    });

    expect(discovered?.recordId).toBe(typed?.recordId);
    expect(discovered?.discoveryId).toBe("core-a");
    expect(records()).toHaveLength(1);
  });

  it("should not reuse an exact hostname with a conflicting discovery id", async () => {
    const typed = await deviceRegistry.selectAddress("steamdeck.local");
    deviceRegistry.installForTests({
      schemaVersion: 2,
      activeRecordId: typed!.recordId,
      records: {
        [typed!.recordId]: { ...typed!, discoveryId: "core-a" },
      },
    });

    const discovered = await deviceRegistry.selectDiscovered({
      ...announcement,
      discoveryId: "core-b",
    });

    expect(discovered?.recordId).not.toBe(typed?.recordId);
    expect(records()).toHaveLength(2);
  });

  // A background browse runs behind a live connection, so it must never create
  // a record or move the user off the one they selected.
  it("should not create or activate a record it does not already know", async () => {
    const typed = await deviceRegistry.selectAddress("steamdeck.local");

    await deviceRegistry.noteResolvedAddresses("no-such-record", [
      "10.0.0.206",
    ]);

    expect(records()).toHaveLength(1);
    expect(deviceRegistry.getSnapshot().activeRecordId).toBe(typed!.recordId);
  });

  it("should not write when the resolution is unchanged", async () => {
    const typed = await deviceRegistry.selectAddress("steamdeck.local");
    await deviceRegistry.noteResolvedAddresses(typed!.recordId, ["10.0.0.206"]);
    vi.clearAllMocks();

    await deviceRegistry.noteResolvedAddresses(typed!.recordId, ["10.0.0.206"]);

    expect(Preferences.set).not.toHaveBeenCalled();
  });

  it("should ignore an announcement that resolved to nothing", async () => {
    const typed = await deviceRegistry.selectAddress("steamdeck.local");
    await deviceRegistry.noteResolvedAddresses(typed!.recordId, ["10.0.0.206"]);

    await deviceRegistry.noteResolvedAddresses(typed!.recordId, []);

    expect(resolvedEndpointForRecord(recordById(typed!.recordId))?.host).toBe(
      "10.0.0.206",
    );
  });

  it("should follow the device to its new address", async () => {
    const typed = await deviceRegistry.selectAddress("steamdeck.local");
    await deviceRegistry.noteResolvedAddresses(typed!.recordId, ["10.0.0.206"]);

    await deviceRegistry.noteResolvedAddresses(typed!.recordId, ["10.0.0.219"]);

    expect(resolvedEndpointForRecord(recordById(typed!.recordId))?.host).toBe(
      "10.0.0.219",
    );
  });

  it("should survive a reload", async () => {
    const discovered = await deviceRegistry.selectDiscovered(announcement);
    __resetDeviceRegistryForTests();
    await deviceRegistry.hydrate();

    expect(
      resolvedEndpointForRecord(recordById(discovered!.recordId))?.host,
    ).toBe("10.0.0.206");
  });
});

describe("merging confirmed device aliases", () => {
  it("should preserve the target id and active source endpoint", async () => {
    const target = await deviceRegistry.selectAddress("mistuh.local");
    await deviceRegistry.setCustomName(target!.recordId, "My MiSTer");
    const source = await deviceRegistry.selectAddress("10.0.0.218");
    await deviceRegistry.applyDiscoveredMetadata(source!.recordId, {
      platform: "mister",
      version: "2.16.0",
    });

    const merged = await deviceRegistry.mergeRecords(
      target!.recordId,
      source!.recordId,
    );

    expect(records()).toHaveLength(1);
    expect(deviceRegistry.getSnapshot().activeRecordId).toBe(target!.recordId);
    expect(merged).toMatchObject({
      recordId: target!.recordId,
      preferredEndpointId: "ws://10.0.0.218:7497",
      name: "My MiSTer",
      nameIsCustom: true,
      platform: "mister",
      version: "2.16.0",
    });
    expect(merged.endpoints.map((endpoint) => endpoint.endpointId)).toEqual([
      "ws://mistuh.local:7497",
      "ws://10.0.0.218:7497",
    ]);
  });

  it("should retain mDNS resolution when endpoint ids collide", async () => {
    const target = await deviceRegistry.selectAddress("mistuh.local");
    const source = await deviceRegistry.selectAddress("10.0.0.218");
    const mdnsSource: DeviceRecord = {
      ...source!,
      endpoints: [
        {
          ...target!.endpoints[0]!,
          source: "mdns",
          resolvedAddresses: ["10.0.0.107", "10.0.0.218"],
        },
      ],
      preferredEndpointId: target!.preferredEndpointId,
    };
    deviceRegistry.installForTests({
      schemaVersion: 2,
      activeRecordId: target!.recordId,
      records: {
        [target!.recordId]: target!,
        [mdnsSource.recordId]: mdnsSource,
      },
    });

    const merged = await deviceRegistry.mergeRecords(
      target!.recordId,
      mdnsSource.recordId,
    );

    expect(merged.endpoints).toEqual([
      expect.objectContaining({
        endpointId: "ws://mistuh.local:7497",
        source: "mdns",
        resolvedAddresses: ["10.0.0.107", "10.0.0.218"],
      }),
    ]);
  });

  it("should move source credentials and remove their old record key", async () => {
    const target = await deviceRegistry.selectAddress("mistuh.local");
    const source = await deviceRegistry.selectAddress("10.0.0.218");
    await credentialStore.set(credentialKeyForRecord(source!.recordId), creds);

    await deviceRegistry.mergeRecords(target!.recordId, source!.recordId);

    await expect(
      credentialStore.get(credentialKeyForRecord(target!.recordId)),
    ).resolves.toEqual(creds);
    await expect(
      credentialStore.get(credentialKeyForRecord(source!.recordId)),
    ).resolves.toBeNull();
  });

  it("should reject records proven to have different discovery ids", async () => {
    const target = await deviceRegistry.selectAddress("mistuh.local");
    const source = await deviceRegistry.selectAddress("10.0.0.218");
    deviceRegistry.installForTests({
      schemaVersion: 2,
      activeRecordId: target!.recordId,
      records: {
        [target!.recordId]: { ...target!, discoveryId: "core-a" },
        [source!.recordId]: { ...source!, discoveryId: "core-b" },
      },
    });

    await expect(
      deviceRegistry.mergeRecords(target!.recordId, source!.recordId),
    ).rejects.toThrow("different discovery IDs");
    expect(records()).toHaveLength(2);
  });

  it("should leave both records when credential preparation fails", async () => {
    const target = await deviceRegistry.selectAddress("mistuh.local");
    const source = await deviceRegistry.selectAddress("10.0.0.218");
    vi.spyOn(credentialStore, "prepareRecordMerge").mockRejectedValueOnce(
      new Error("keychain locked"),
    );
    const beforeCommit = vi.fn();

    await expect(
      deviceRegistry.mergeRecords(target!.recordId, source!.recordId, {
        beforeCommit,
      }),
    ).rejects.toThrow("keychain locked");
    expect(beforeCommit).not.toHaveBeenCalled();
    expect(records()).toHaveLength(2);
  });
});

describe("recording a successful connection", () => {
  it("should absorb the duplicate a proven credential key identifies", async () => {
    const migrated = await deviceRegistry.selectAddress("10.0.0.206");
    const discovered = await deviceRegistry.selectDiscovered({
      discoveryId: "device-a",
      hostname: "steamdeck.local",
      addresses: ["10.0.0.206"],
      port: 7497,
    });
    expect(records()).toHaveLength(2);

    await deviceRegistry.markConnected(discovered!.recordId, {
      provenLegacyKey: "10.0.0.206",
    });

    const snapshot = deviceRegistry.getSnapshot();
    expect(Object.keys(snapshot.records)).toEqual([discovered!.recordId]);
    expect(snapshot.activeRecordId).toBe(discovered!.recordId);
    expect(snapshot.records[discovered!.recordId]).toMatchObject({
      endpoints: expect.arrayContaining([
        expect.objectContaining({ host: "steamdeck.local" }),
        expect.objectContaining({ host: "10.0.0.206" }),
      ]),
    });
    expect(snapshot.records[migrated!.recordId]).toBeUndefined();
  });

  it("should leave both records alone when no key was proven", async () => {
    await deviceRegistry.selectAddress("10.0.0.206");
    const discovered = await deviceRegistry.selectDiscovered({
      discoveryId: "device-a",
      hostname: "steamdeck.local",
      addresses: ["10.0.0.206"],
      port: 7497,
    });

    await deviceRegistry.markConnected(discovered!.recordId);

    expect(records()).toHaveLength(2);
  });

  it("should drop the legacy key once the migration is settled", async () => {
    const record = await deviceRegistry.selectAddress("10.0.0.206");

    await deviceRegistry.markConnected(record!.recordId, {
      migrationSettled: true,
    });

    const updated = deviceRegistry.getSnapshot().records[record!.recordId];
    expect(updated?.legacyCredentialKey).toBeUndefined();
    expect(updated?.lastConnectedAt).toEqual(expect.any(Number));
  });

  it("should keep the legacy key while the migration is outstanding", async () => {
    const record = await deviceRegistry.selectAddress("10.0.0.206");

    await deviceRegistry.markConnected(record!.recordId);

    expect(
      deviceRegistry.getSnapshot().records[record!.recordId],
    ).toMatchObject({ legacyCredentialKey: "10.0.0.206" });
  });

  it("should ignore a connection for an unknown record", async () => {
    await deviceRegistry.selectAddress("10.0.0.206");
    vi.clearAllMocks();

    await deviceRegistry.markConnected("no-such-record");

    expect(Preferences.set).not.toHaveBeenCalled();
  });
});

describe("applying device-reported metadata", () => {
  it("should not overwrite a name the user chose", async () => {
    const record = await deviceRegistry.selectAddress("10.0.0.206");
    await deviceRegistry.setCustomName(record!.recordId, "Living Room");

    await deviceRegistry.applyDiscoveredMetadata(record!.recordId, {
      name: "Deck",
      platform: "linux",
    });

    expect(
      deviceRegistry.getSnapshot().records[record!.recordId],
    ).toMatchObject({ name: "Living Room", platform: "linux" });
  });

  it("should not write when the metadata says nothing new", async () => {
    const record = await deviceRegistry.selectAddress("10.0.0.206");
    await deviceRegistry.applyDiscoveredMetadata(record!.recordId, {
      name: "Deck",
    });
    vi.clearAllMocks();

    await deviceRegistry.applyDiscoveredMetadata(record!.recordId, {
      name: "Deck",
      platform: "",
    });

    expect(Preferences.set).not.toHaveBeenCalled();
  });
});

describe("persistence", () => {
  it("should serialize writes in mutation order", async () => {
    await deviceRegistry.hydrate();
    const writes: Array<{ value: string; resolve: () => void }> = [];
    vi.mocked(Preferences.set).mockImplementation(
      ({ value }: { key: string; value: string }) =>
        new Promise<void>((resolve) => {
          writes.push({ value, resolve });
        }),
    );

    const first = deviceRegistry.selectAddress("10.0.0.1");
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    const second = deviceRegistry.selectAddress("10.0.0.2");

    expect(writes).toHaveLength(1);
    writes[0]!.resolve();
    await vi.waitFor(() => expect(writes).toHaveLength(2));
    writes[1]!.resolve();
    await Promise.all([first, second]);

    const firstRegistry = parseDeviceRegistry(JSON.parse(writes[0]!.value));
    const secondRegistry = parseDeviceRegistry(JSON.parse(writes[1]!.value));
    expect(Object.values(firstRegistry?.records ?? {})).toHaveLength(1);
    expect(Object.values(secondRegistry?.records ?? {})).toHaveLength(2);
    expect(
      secondRegistry?.records[secondRegistry.activeRecordId ?? ""]?.endpoints[0]
        ?.host,
    ).toBe("10.0.0.2");
  });
});
