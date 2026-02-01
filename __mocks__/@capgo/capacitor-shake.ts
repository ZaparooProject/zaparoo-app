import { vi } from "vitest";

export const CapacitorShake = {
  addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  removeAllListeners: vi.fn().mockResolvedValue(undefined),
};

// Export as both names for compatibility
export const Shake = CapacitorShake;
