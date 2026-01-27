import { vi } from "vitest";

export const App = {
  addListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
  removeAllListeners: vi.fn().mockResolvedValue(undefined),
  exitApp: vi.fn().mockResolvedValue(undefined),
  getInfo: vi.fn().mockResolvedValue({
    name: "Test App",
    id: "com.test.app",
    build: "1",
    version: "1.0.0",
  }),
  getState: vi.fn().mockResolvedValue({
    isActive: true,
  }),
  getLaunchUrl: vi.fn().mockResolvedValue({
    url: undefined,
  }),
  minimizeApp: vi.fn().mockResolvedValue(undefined),
};
