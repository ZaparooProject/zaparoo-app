import { vi } from "vitest";

let store = new Map<string, unknown>();
let prefix = "capacitor-storage_";

export const SecureStorage = {
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
};

export const __resetSecureStorageMock = () => {
  store = new Map<string, unknown>();
  prefix = "capacitor-storage_";
};
