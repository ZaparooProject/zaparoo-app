import { beforeEach, describe, expect, it, vi } from "vitest";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import {
  normalizeDeviceKey,
  SecureCredentialStore,
} from "@/lib/crypto/credentials";
import type { StoredCredentials } from "@/lib/crypto/credentials";

// SecureStorage is auto-mocked from __mocks__/@aparajita/capacitor-secure-storage.ts
// (registered globally in src/test-setup.ts).

const creds: StoredCredentials = {
  authToken: "550e8400-e29b-41d4-a716-446655440000",
  pairingKey: "a".repeat(64),
  clientId: "client-uuid-1234",
  pairedAt: 1700000000000,
};

describe("normalizeDeviceKey", () => {
  it("should lowercase host", () => {
    expect(normalizeDeviceKey("MyDevice.local")).toBe("mydevice.local");
  });

  it("should strip default port 7497", () => {
    expect(normalizeDeviceKey("192.168.1.50:7497")).toBe("192.168.1.50");
  });

  it("should keep non-default port", () => {
    expect(normalizeDeviceKey("192.168.1.50:8080")).toBe("192.168.1.50:8080");
  });

  it("should strip ws:// scheme", () => {
    expect(normalizeDeviceKey("ws://192.168.1.50:7497")).toBe("192.168.1.50");
  });

  it("should strip trailing path", () => {
    expect(normalizeDeviceKey("ws://192.168.1.50:7497/api/v0.1")).toBe(
      "192.168.1.50",
    );
  });

  it("should treat same address variants as equal", () => {
    const base = normalizeDeviceKey("192.168.1.50");
    expect(normalizeDeviceKey("192.168.1.50:7497")).toBe(base);
    expect(normalizeDeviceKey("ws://192.168.1.50:7497/api/v0.1")).toBe(base);
  });
});

describe("SecureCredentialStore", () => {
  let store: SecureCredentialStore;

  beforeEach(async () => {
    store = new SecureCredentialStore();
    await SecureStorage.clear();
  });

  it("should return credentials after set and get", async () => {
    await store.set("192.168.1.50", creds);
    const result = await store.get("192.168.1.50");
    expect(result).toEqual(creds);
  });

  it("should return null for non-existent key", async () => {
    expect(await store.get("unknown-device")).toBeNull();
  });

  it("should remove key on delete", async () => {
    await store.set("192.168.1.50", creds);
    await store.delete("192.168.1.50");
    expect(await store.get("192.168.1.50")).toBeNull();
  });

  it("should list all stored credentials", async () => {
    const creds2: StoredCredentials = { ...creds, clientId: "other-client" };
    await store.set("device1", creds);
    await store.set("device2", creds2);
    const list = await store.list();
    expect(list).toHaveLength(2);
    const keys = list.map((e) => e.deviceKey).sort();
    expect(keys).toEqual(["device1", "device2"]);
  });

  it("should overwrite existing credentials on set", async () => {
    await store.set("192.168.1.50", creds);
    const updated = { ...creds, clientId: "new-client" };
    await store.set("192.168.1.50", updated);
    const result = await store.get("192.168.1.50");
    expect(result?.clientId).toBe("new-client");
  });

  it("should await setKeyPrefix before set/get when called immediately after construction", async () => {
    // The constructor kicks off setKeyPrefix asynchronously; without awaiting
    // initPromise inside set/get, an immediate set could race the prefix
    // assignment in the mock and read/write under the wrong prefix.
    const fresh = new SecureCredentialStore();
    await fresh.set("immediate-key", creds);
    const result = await fresh.get("immediate-key");
    expect(result).toEqual(creds);
  });

  it("should serialize delete and set on the same key in submission order", async () => {
    // Without per-key serialization, a slow delete fired before a fast set
    // could resolve last and wipe the just-written credentials. The store
    // must enqueue same-key ops so set runs only after delete resolves.
    const events: string[] = [];

    vi.mocked(SecureStorage.remove).mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 30));
      events.push("remove-resolved");
      return true;
    });
    vi.mocked(SecureStorage.set).mockImplementationOnce(async () => {
      events.push("set-invoked");
    });

    const fresh = new SecureCredentialStore();
    const deletePromise = fresh.delete("race-key");
    const setPromise = fresh.set("race-key", creds);
    await Promise.all([deletePromise, setPromise]);
    expect(events).toEqual(["remove-resolved", "set-invoked"]);
  });
});
