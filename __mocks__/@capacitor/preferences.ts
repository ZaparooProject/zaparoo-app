import { vi } from "vitest";

// Stateful storage for preferences - allows set/get to work in tests
let storage: Record<string, string> = {};

export const Preferences = {
  get: vi.fn().mockImplementation(async ({ key }: { key: string }) => {
    return { value: storage[key] ?? null };
  }),
  set: vi
    .fn()
    .mockImplementation(
      async ({ key, value }: { key: string; value: string }) => {
        storage[key] = value;
      },
    ),
  remove: vi.fn().mockImplementation(async ({ key }: { key: string }) => {
    delete storage[key];
  }),
  clear: vi.fn().mockImplementation(async () => {
    storage = {};
  }),
  keys: vi.fn().mockImplementation(async () => {
    return { keys: Object.keys(storage) };
  }),
};

// Helper to reset storage between tests
export const __resetPreferencesStorage = () => {
  storage = {};
};
