import { vi } from "vitest";

export const Style = {
  Dark: "DARK",
  Light: "LIGHT",
  Default: "DEFAULT",
};

export const StatusBar = {
  setStyle: vi.fn().mockResolvedValue(undefined),
  setBackgroundColor: vi.fn().mockResolvedValue(undefined),
  show: vi.fn().mockResolvedValue(undefined),
  hide: vi.fn().mockResolvedValue(undefined),
  getInfo: vi.fn().mockResolvedValue({
    visible: true,
    style: Style.Default,
  }),
  setOverlaysWebView: vi.fn().mockResolvedValue(undefined),
};
