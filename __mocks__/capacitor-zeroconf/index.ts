import { vi } from "vitest";

// Store for watch callbacks to allow tests to trigger device discovery
let watchCallbacks: Array<(result: ZeroConfWatchResult) => void> = [];

export const ZeroConf = {
  getHostname: vi.fn().mockResolvedValue({ hostname: "test-device" }),
  register: vi.fn().mockResolvedValue(undefined),
  unregister: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  watch: vi
    .fn()
    .mockImplementation(
      async (
        _options: { type: string; domain: string },
        callback?: (result: ZeroConfWatchResult) => void,
      ) => {
        if (callback) {
          watchCallbacks.push(callback);
        }
        return "watch-id";
      },
    ),
  unwatch: vi.fn().mockImplementation(async () => {
    watchCallbacks = [];
    return undefined;
  }),
  close: vi.fn().mockImplementation(async () => {
    watchCallbacks = [];
    return undefined;
  }),
  addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
};

/**
 * Helper to simulate discovering a device in tests.
 * Call this after useNetworkScan().startScan() to trigger device discovery.
 */
export function __simulateDeviceDiscovered(service: ZeroConfService): void {
  watchCallbacks.forEach((callback) => {
    callback({ action: "resolved", service });
  });
}

/**
 * Helper to simulate a device being removed in tests.
 */
export function __simulateDeviceRemoved(service: ZeroConfService): void {
  watchCallbacks.forEach((callback) => {
    callback({ action: "removed", service });
  });
}

/**
 * Reset the mock state between tests.
 */
export function __resetZeroConfMock(): void {
  watchCallbacks = [];
  vi.mocked(ZeroConf.watch).mockClear();
  vi.mocked(ZeroConf.unwatch).mockClear();
  vi.mocked(ZeroConf.close).mockClear();
}

// Re-export types that tests might need
export type ZeroConfService = {
  domain: string;
  type: string;
  name: string;
  port: number;
  hostname: string;
  ipv4Addresses: string[];
  ipv6Addresses: string[];
  txtRecord: Record<string, string>;
};

export type ZeroConfWatchResult = {
  action: "added" | "removed" | "resolved";
  service: ZeroConfService;
};
