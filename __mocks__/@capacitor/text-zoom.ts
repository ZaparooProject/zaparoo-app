import { vi } from "vitest";

export const TextZoom = {
  get: vi.fn().mockResolvedValue({ value: 1 }),
  getPreferred: vi.fn().mockResolvedValue({ value: 1 }),
  set: vi.fn().mockResolvedValue(undefined),
};
