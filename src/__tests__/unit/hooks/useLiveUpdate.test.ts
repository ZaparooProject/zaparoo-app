import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "../../../test-utils";
import { Capacitor } from "@capacitor/core";
import { LiveUpdate } from "@capawesome/capacitor-live-update";
import { useLiveUpdate } from "@/hooks/useLiveUpdate";

// Mock the logger
vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    log: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("useLiveUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should skip execution on non-native platform", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    renderHook(() => useLiveUpdate());

    // Wait a tick to ensure effect has run
    await waitFor(() => {
      expect(LiveUpdate.ready).not.toHaveBeenCalled();
      expect(LiveUpdate.sync).not.toHaveBeenCalled();
    });
  });

  it("should call LiveUpdate.ready() on mount on native platform", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(LiveUpdate.ready).mockResolvedValue({
      previousBundleId: null,
      currentBundleId: null,
      rollback: false,
    });
    vi.mocked(LiveUpdate.sync).mockResolvedValue({ nextBundleId: null });

    renderHook(() => useLiveUpdate());

    await waitFor(() => {
      expect(LiveUpdate.ready).toHaveBeenCalled();
    });
  });

  it("should call LiveUpdate.sync() after ready on native platform", async () => {
    const { logger } = await import("@/lib/logger");

    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(LiveUpdate.ready).mockResolvedValue({
      previousBundleId: null,
      currentBundleId: null,
      rollback: false,
    });
    vi.mocked(LiveUpdate.sync).mockResolvedValue({ nextBundleId: null });

    renderHook(() => useLiveUpdate());

    await waitFor(() => {
      expect(LiveUpdate.ready).toHaveBeenCalled();
      expect(LiveUpdate.sync).toHaveBeenCalled();
    });

    // Logger should indicate success
    expect(logger.debug).toHaveBeenCalledWith(
      "LiveUpdate: App marked as ready",
    );
  });

  it("should log when new bundle is available", async () => {
    const { logger } = await import("@/lib/logger");

    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(LiveUpdate.ready).mockResolvedValue({
      previousBundleId: null,
      currentBundleId: null,
      rollback: false,
    });
    vi.mocked(LiveUpdate.sync).mockResolvedValue({
      nextBundleId: "bundle-v2.0.0",
    });

    renderHook(() => useLiveUpdate());

    await waitFor(() => {
      expect(logger.log).toHaveBeenCalledWith(
        "LiveUpdate: New bundle available (bundle-v2.0.0), will apply on next restart",
      );
    });
  });

  it("should handle ready() failure gracefully", async () => {
    const { logger } = await import("@/lib/logger");
    const readyError = new Error("Ready failed");

    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(LiveUpdate.ready).mockRejectedValue(readyError);

    renderHook(() => useLiveUpdate());

    await waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith(
        "LiveUpdate: Failed to initialize",
        readyError,
      );
    });

    // sync should not be called if ready fails
    expect(LiveUpdate.sync).not.toHaveBeenCalled();
  });

  it("should handle sync() failure gracefully", async () => {
    const { logger } = await import("@/lib/logger");
    const syncError = new Error("Sync failed");

    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(LiveUpdate.ready).mockResolvedValue({
      previousBundleId: null,
      currentBundleId: null,
      rollback: false,
    });
    vi.mocked(LiveUpdate.sync).mockRejectedValue(syncError);

    renderHook(() => useLiveUpdate());

    await waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith(
        "LiveUpdate: Failed to initialize",
        syncError,
      );
    });
  });

  it("should only run once even with multiple renders", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(LiveUpdate.ready).mockResolvedValue({
      previousBundleId: null,
      currentBundleId: null,
      rollback: false,
    });
    vi.mocked(LiveUpdate.sync).mockResolvedValue({ nextBundleId: null });

    const { rerender } = renderHook(() => useLiveUpdate());

    await waitFor(() => {
      expect(LiveUpdate.ready).toHaveBeenCalledTimes(1);
    });

    // Re-render the hook
    rerender();
    rerender();
    rerender();

    // Should still only be called once due to initialized.current ref
    expect(LiveUpdate.ready).toHaveBeenCalledTimes(1);
    expect(LiveUpdate.sync).toHaveBeenCalledTimes(1);
  });
});
