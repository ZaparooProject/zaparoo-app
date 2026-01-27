import { vi } from "vitest";

export const KeepAwake = {
  keepAwake: vi.fn().mockResolvedValue(undefined),
  allowSleep: vi.fn().mockResolvedValue(undefined),
  isSupported: vi.fn().mockResolvedValue({ isSupported: false }),
  isKeptAwake: vi.fn().mockResolvedValue({ isKeptAwake: false }),
};
