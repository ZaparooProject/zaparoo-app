import { vi } from "vitest";

export const Capacitor = {
  isNativePlatform: vi.fn().mockReturnValue(false),
  getPlatform: vi.fn().mockReturnValue("web"),
  isPluginAvailable: vi.fn().mockReturnValue(false),
  convertFileSrc: vi.fn((filePath: string) => filePath),
};
