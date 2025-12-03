import { vi } from "vitest";

export const ScreenReader = {
  isEnabled: vi.fn().mockResolvedValue({ value: false }),
  addListener: vi.fn().mockResolvedValue({
    remove: vi.fn(),
  }),
  speak: vi.fn().mockResolvedValue(undefined),
};
