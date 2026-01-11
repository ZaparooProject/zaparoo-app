import { vi } from "vitest";

export const Device = {
  getInfo: vi.fn().mockResolvedValue({
    model: "Test Device",
    platform: "web",
    operatingSystem: "unknown",
    osVersion: "unknown",
    manufacturer: "unknown",
    isVirtual: true,
    webViewVersion: "unknown",
  }),
  getId: vi.fn().mockResolvedValue({
    identifier: "test-device-id",
  }),
  getBatteryInfo: vi.fn().mockResolvedValue({
    batteryLevel: 1,
    isCharging: false,
  }),
  getLanguageCode: vi.fn().mockResolvedValue({
    value: "en",
  }),
  getLanguageTag: vi.fn().mockResolvedValue({
    value: "en-US",
  }),
};
