import { vi } from "vitest";

export const Preferences = {
  get: vi.fn().mockResolvedValue({ value: null }),
  set: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn().mockResolvedValue(undefined),
  keys: vi.fn().mockResolvedValue({ keys: [] })
};