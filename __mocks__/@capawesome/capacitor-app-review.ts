import { vi } from "vitest";

export const AppReview = {
  requestReview: vi.fn().mockResolvedValue(undefined),
  openAppStore: vi.fn().mockResolvedValue(undefined),
};
