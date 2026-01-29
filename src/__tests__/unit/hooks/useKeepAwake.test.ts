import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "../../../test-utils";
import { Capacitor } from "@capacitor/core";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { logger } from "@/lib/logger.ts";
import { useKeepAwake } from "@/hooks/useKeepAwake.ts";

// Mock modules
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}));

vi.mock("@capacitor-community/keep-awake", () => ({
  KeepAwake: {
    keepAwake: vi.fn(),
    allowSleep: vi.fn(),
  },
}));

vi.mock("../../../lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe("useKeepAwake", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should call keepAwake on mount when on native platform", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(KeepAwake.keepAwake).mockResolvedValue();
    vi.mocked(KeepAwake.allowSleep).mockResolvedValue();

    const { unmount } = renderHook(() => useKeepAwake());

    expect(Capacitor.isNativePlatform).toHaveBeenCalled();

    // Wait for the dynamic import to resolve
    await vi.waitFor(() => {
      expect(KeepAwake.keepAwake).toHaveBeenCalled();
    });

    unmount();

    // Wait for cleanup to execute
    await vi.waitFor(() => {
      expect(KeepAwake.allowSleep).toHaveBeenCalled();
    });
  });

  it("should not call keepAwake on web platform", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    const { unmount } = renderHook(() => useKeepAwake());

    expect(Capacitor.isNativePlatform).toHaveBeenCalled();
    expect(KeepAwake.keepAwake).not.toHaveBeenCalled();

    unmount();

    expect(KeepAwake.allowSleep).not.toHaveBeenCalled();
  });

  it("should log error when keepAwake fails", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const keepAwakeError = new Error("KeepAwake not supported");
    vi.mocked(KeepAwake.keepAwake).mockRejectedValue(keepAwakeError);
    vi.mocked(KeepAwake.allowSleep).mockResolvedValue();

    renderHook(() => useKeepAwake());

    // Wait for the rejected promise to be handled
    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to enable keep awake",
        keepAwakeError,
        expect.objectContaining({
          category: "lifecycle",
          action: "keepAwake",
          severity: "warning",
        }),
      );
    });
  });

  it("should log error when allowSleep fails on unmount", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(KeepAwake.keepAwake).mockResolvedValue();
    const allowSleepError = new Error("AllowSleep not supported");
    vi.mocked(KeepAwake.allowSleep).mockRejectedValue(allowSleepError);

    const { unmount } = renderHook(() => useKeepAwake());

    // Wait for the dynamic import and keepAwake to resolve
    await vi.waitFor(() => {
      expect(KeepAwake.keepAwake).toHaveBeenCalled();
    });

    unmount();

    // Wait for the rejected promise to be handled
    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to disable keep awake",
        allowSleepError,
        expect.objectContaining({
          category: "lifecycle",
          action: "allowSleep",
          severity: "warning",
        }),
      );
    });
  });
});
