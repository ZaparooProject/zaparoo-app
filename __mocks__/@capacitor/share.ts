import { vi } from "vitest";

export const Share = {
  share: vi.fn().mockResolvedValue({ activityType: "mock-activity" }),
  canShare: vi.fn().mockResolvedValue({ value: true }),
};
