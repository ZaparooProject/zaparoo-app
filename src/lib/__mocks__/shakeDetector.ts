import { vi } from "vitest";

export const ShakeDetector = {
  isAvailable: vi.fn().mockResolvedValue({ available: true }),
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
};
