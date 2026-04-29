import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizeDeviceKey,
  SecureCredentialStore,
} from "@/lib/crypto/credentials";
import type { StoredCredentials } from "@/lib/crypto/credentials";

// Mock the plugin so tests don't require native binaries.
vi.mock("@aparajita/capacitor-secure-storage", () => {
  const store = new Map<string, unknown>();
  let prefix = "capacitor-storage_";
  return {
    SecureStorage: {
      setKeyPrefix: vi.fn(async (p: string) => {
        prefix = p;
      }),
      get: vi.fn(async (key: string) => store.get(`${prefix}${key}`) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        store.set(`${prefix}${key}`, value);
      }),
      remove: vi.fn(async (key: string) => {
        const had = store.has(`${prefix}${key}`);
        store.delete(`${prefix}${key}`);
        return had;
      }),
      keys: vi.fn(async () =>
        [...store.keys()]
          .filter((k) => k.startsWith(prefix))
          .map((k) => k.slice(prefix.length)),
      ),
      clear: vi.fn(async () => store.clear()),
    },
  };
});

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
    const { SecureStorage } =
      await import("@aparajita/capacitor-secure-storage");
    await SecureStorage.clear();
  });

  it("set then get returns the credentials", async () => {
    await store.set("192.168.1.50", creds);
    const result = await store.get("192.168.1.50");
    expect(result).toEqual(creds);
  });

  it("get returns null when key does not exist", async () => {
    expect(await store.get("unknown-device")).toBeNull();
  });

  it("delete removes the key", async () => {
    await store.set("192.168.1.50", creds);
    await store.delete("192.168.1.50");
    expect(await store.get("192.168.1.50")).toBeNull();
  });

  it("list returns all stored credentials", async () => {
    const creds2: StoredCredentials = { ...creds, clientId: "other-client" };
    await store.set("device1", creds);
    await store.set("device2", creds2);
    const list = await store.list();
    expect(list).toHaveLength(2);
    const keys = list.map((e) => e.deviceKey).sort();
    expect(keys).toEqual(["device1", "device2"]);
  });

  it("overwrites existing credentials on set", async () => {
    await store.set("192.168.1.50", creds);
    const updated = { ...creds, clientId: "new-client" };
    await store.set("192.168.1.50", updated);
    const result = await store.get("192.168.1.50");
    expect(result?.clientId).toBe("new-client");
  });
});
