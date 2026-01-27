import { vi } from "vitest";

export const SafeArea = {
  getSafeAreaInsets: vi.fn().mockResolvedValue({
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  }),
  addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  removeAllListeners: vi.fn().mockResolvedValue(undefined),
};
