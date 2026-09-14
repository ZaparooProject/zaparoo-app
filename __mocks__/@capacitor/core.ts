import { vi } from "vitest";

export const Capacitor = {
  isNativePlatform: vi.fn().mockReturnValue(false),
  getPlatform: vi.fn().mockReturnValue("web"),
  // Preferences ships a web implementation and is mocked globally, so it is
  // available on every platform. Modules loaded by the test setup keep this
  // instance even when a test file mocks @capacitor/core as native, so a
  // missing Preferences plugin would fail preference hydration there.
  isPluginAvailable: vi.fn(
    (pluginName: string) => pluginName === "Preferences",
  ),
  convertFileSrc: vi.fn((filePath: string) => filePath),
};
