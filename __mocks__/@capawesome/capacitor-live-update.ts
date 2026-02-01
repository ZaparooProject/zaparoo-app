import { vi } from "vitest";

// Default ReadyResult mock value
const defaultReadyResult = {
  previousBundleId: null,
  currentBundleId: null,
  rollback: false,
};

export const LiveUpdate = {
  ready: vi.fn().mockResolvedValue(defaultReadyResult),
  sync: vi.fn().mockResolvedValue({ nextBundleId: null }),
  getCurrentBundle: vi.fn().mockResolvedValue({ bundleId: null }),
  getNextBundle: vi.fn().mockResolvedValue({ bundleId: null }),
  setNextBundle: vi.fn().mockResolvedValue(undefined),
  deleteBundle: vi.fn().mockResolvedValue(undefined),
  reset: vi.fn().mockResolvedValue(undefined),
};

/**
 * Reset the mock state between tests.
 */
export function __resetLiveUpdateMock(): void {
  vi.mocked(LiveUpdate.ready).mockClear();
  vi.mocked(LiveUpdate.sync).mockClear();
  vi.mocked(LiveUpdate.getCurrentBundle).mockClear();
  vi.mocked(LiveUpdate.getNextBundle).mockClear();
  vi.mocked(LiveUpdate.setNextBundle).mockClear();
  vi.mocked(LiveUpdate.deleteBundle).mockClear();
  vi.mocked(LiveUpdate.reset).mockClear();
}
