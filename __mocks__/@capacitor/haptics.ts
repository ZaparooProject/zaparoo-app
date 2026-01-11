import { vi } from "vitest";

export const ImpactStyle = {
  Heavy: "HEAVY",
  Medium: "MEDIUM",
  Light: "LIGHT",
};

export const NotificationType = {
  Success: "SUCCESS",
  Warning: "WARNING",
  Error: "ERROR",
};

export const Haptics = {
  impact: vi.fn().mockResolvedValue(undefined),
  notification: vi.fn().mockResolvedValue(undefined),
  vibrate: vi.fn().mockResolvedValue(undefined),
  selectionStart: vi.fn().mockResolvedValue(undefined),
  selectionChanged: vi.fn().mockResolvedValue(undefined),
  selectionEnd: vi.fn().mockResolvedValue(undefined),
};
