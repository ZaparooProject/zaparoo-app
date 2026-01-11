import { vi } from "vitest";

export const Shake = {
  addListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
  removeAllListeners: vi.fn().mockResolvedValue(undefined),
};
