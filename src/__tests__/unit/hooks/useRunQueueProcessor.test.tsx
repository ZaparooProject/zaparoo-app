/**
 * Unit tests for useRunQueueProcessor hook
 *
 * Tests launch queue processing: immediate launch when connected,
 * deep-link confirmation, waiting for connection with a deadline,
 * and backlog handling for items queued mid-launch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@/test-utils";
import { useRunQueueProcessor } from "@/hooks/useRunQueueProcessor";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useShakeSheetStore } from "@/lib/shakeSheetStore";
import type { RunTokenOptions } from "@/lib/tokenOperations";

// Create hoisted mocks
const { mockRunToken, mockToast, mockLogger } = vi.hoisted(() => ({
  mockRunToken: vi.fn().mockResolvedValue(true),
  mockToast: {
    error: vi.fn(),
  },
  mockLogger: {
    log: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock dependencies
vi.mock("../../../lib/tokenOperations.tsx", () => ({
  runToken: mockRunToken,
}));

vi.mock("react-hot-toast", () => ({
  default: mockToast,
}));

vi.mock("../../../lib/logger", () => ({
  logger: mockLogger,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe("useRunQueueProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    useStatusStore.setState({
      proPurchaseModalOpen: false,
      runQueue: null,
      connectionState: ConnectionState.CONNECTED,
      connected: true,
    });
    usePreferencesStore.setState({ launcherAccess: true });

    mockRunToken.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should not process when queue is empty", () => {
    renderHook(() => useRunQueueProcessor());

    expect(mockRunToken).not.toHaveBeenCalled();
  });

  it("should process shake items immediately when connected", async () => {
    renderHook(() => useRunQueueProcessor());

    act(() => {
      useStatusStore
        .getState()
        .setRunQueue({ value: "test-token", unsafe: false, source: "shake" });
    });
    await flush();

    // Queue should be cleared
    expect(useStatusStore.getState().runQueue).toBe(null);

    expect(mockRunToken).toHaveBeenCalledWith(
      "",
      "test-token",
      true, // launcherAccess
      true, // connected
      expect.any(Function),
      expect.any(Function),
      false, // unsafe
      false, // override
      true, // canQueueCommands
      true, // requiresLaunch
      expect.objectContaining({ source: "shake" }),
    );
  });

  it.each([
    ["shake", "shake"],
    ["deepLink", "nfc"],
  ] as const)(
    "should open the Pro screen for a blocked %s launch as %s",
    async (source, proSource) => {
      const { result } = renderHook(() => useRunQueueProcessor());

      act(() => {
        useStatusStore
          .getState()
          .setRunQueue({ value: "test-token", unsafe: false, source });
      });
      await flush();
      if (source === "deepLink") {
        act(() => result.current.confirmRun());
        await flush();
      }

      const openProPurchase = mockRunToken.mock.calls[0]![5] as (
        open: boolean,
      ) => void;
      act(() => openProPurchase(true));

      expect(useStatusStore.getState().proPurchaseModalOpen).toBe(true);
      expect(useStatusStore.getState().proPurchaseSource).toBe(proSource);
    },
  );

  it("should pass unsafe flag correctly", async () => {
    renderHook(() => useRunQueueProcessor());

    act(() => {
      useStatusStore
        .getState()
        .setRunQueue({ value: "unsafe-token", unsafe: true, source: "shake" });
    });
    await flush();

    expect(mockRunToken).toHaveBeenCalledWith(
      "",
      "unsafe-token",
      true,
      true,
      expect.any(Function),
      expect.any(Function),
      true, // unsafe should be true
      false,
      true,
      true,
      expect.objectContaining({ source: "shake" }),
    );
  });

  it("should require confirmation for deep link items", async () => {
    const { result } = renderHook(() => useRunQueueProcessor());

    act(() => {
      useStatusStore.getState().setRunQueue({
        value: "link-token",
        unsafe: true,
        source: "deepLink",
      });
    });
    await flush();

    // Not launched yet - awaiting user confirmation
    expect(mockRunToken).not.toHaveBeenCalled();
    expect(result.current.pendingConfirm).toEqual({
      value: "link-token",
      unsafe: true,
      source: "deepLink",
    });

    act(() => {
      result.current.confirmRun();
    });
    await flush();

    expect(result.current.pendingConfirm).toBe(null);
    expect(mockRunToken).toHaveBeenCalledWith(
      "",
      "link-token",
      true,
      true,
      expect.any(Function),
      expect.any(Function),
      true,
      false,
      true,
      true,
      { source: "queue" },
    );
  });

  it("should discard deep link items when confirmation is cancelled", async () => {
    const { result } = renderHook(() => useRunQueueProcessor());

    act(() => {
      useStatusStore.getState().setRunQueue({
        value: "link-token",
        unsafe: true,
        source: "deepLink",
      });
    });
    await flush();

    act(() => {
      result.current.cancelConfirm();
    });
    await flush();

    expect(result.current.pendingConfirm).toBe(null);
    expect(mockRunToken).not.toHaveBeenCalled();
  });

  it("should wait for CONNECTED before launching", async () => {
    useStatusStore.setState({
      connectionState: ConnectionState.RECONNECTING,
      connected: true,
    });

    renderHook(() => useRunQueueProcessor());

    act(() => {
      useStatusStore
        .getState()
        .setRunQueue({ value: "wait-token", unsafe: false, source: "shake" });
    });
    await flush();

    // Reconnecting is not connected enough to launch
    expect(mockRunToken).not.toHaveBeenCalled();

    act(() => {
      useStatusStore.getState().setConnectionState(ConnectionState.CONNECTED);
    });
    await flush();

    expect(mockRunToken).toHaveBeenCalledTimes(1);
  });

  it("should show error toast when the connection deadline passes", async () => {
    useStatusStore.setState({
      connectionState: ConnectionState.DISCONNECTED,
      connected: false,
    });

    renderHook(() => useRunQueueProcessor());

    act(() => {
      useStatusStore
        .getState()
        .setRunQueue({ value: "fail-token", unsafe: false, source: "shake" });
    });
    await flush();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(mockToast.error).toHaveBeenCalledWith("create.custom.failMsg");
    expect(mockRunToken).not.toHaveBeenCalled();
  });

  it("should process items queued while another launch is in flight", async () => {
    let resolveFirst: (value: boolean) => void = () => {};
    mockRunToken.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    renderHook(() => useRunQueueProcessor());

    act(() => {
      useStatusStore
        .getState()
        .setRunQueue({ value: "first", unsafe: false, source: "shake" });
    });
    await flush();
    expect(mockRunToken).toHaveBeenCalledTimes(1);

    // Second item arrives while the first is still launching
    act(() => {
      useStatusStore
        .getState()
        .setRunQueue({ value: "second", unsafe: false, source: "shake" });
    });
    await flush();
    expect(mockRunToken).toHaveBeenCalledTimes(1);

    act(() => {
      resolveFirst(true);
    });
    await flush();
    await flush();

    expect(mockRunToken).toHaveBeenCalledTimes(2);
    expect(mockRunToken).toHaveBeenLastCalledWith(
      "",
      "second",
      true,
      true,
      expect.any(Function),
      expect.any(Function),
      false,
      false,
      true,
      true,
      expect.objectContaining({ source: "shake" }),
    );
  });

  it("should handle runToken errors gracefully", async () => {
    mockRunToken.mockRejectedValueOnce(new Error("API Error"));

    renderHook(() => useRunQueueProcessor());

    act(() => {
      useStatusStore
        .getState()
        .setRunQueue({ value: "error-token", unsafe: false, source: "shake" });
    });
    await flush();
    await flush();

    expect(mockLogger.error).toHaveBeenCalledWith(
      "runQueue error",
      expect.any(Error),
      expect.any(Object),
    );
  });

  it("should use launcherAccess from preferences store", async () => {
    usePreferencesStore.setState({ launcherAccess: false });

    renderHook(() => useRunQueueProcessor());

    act(() => {
      useStatusStore
        .getState()
        .setRunQueue({ value: "pro-token", unsafe: false, source: "shake" });
    });
    await flush();

    expect(mockRunToken).toHaveBeenCalledWith(
      "",
      "pro-token",
      false, // launcherAccess should be false
      true,
      expect.any(Function),
      expect.any(Function),
      false,
      false,
      true,
      true,
      expect.objectContaining({ source: "shake" }),
    );
  });

  describe("shake sheet", () => {
    const queueShake = async () => {
      act(() => {
        useShakeSheetStore.getState().charge(1, true);
        useShakeSheetStore.getState().confirm();
        useStatusStore.getState().setRunQueue({
          value: "**launch.random",
          unsafe: true,
          source: "shake",
        });
      });
      await flush();
    };
    const launchError = {
      message: "no media found",
      category: "media_not_found",
      cancelled: false,
    };

    beforeEach(() => {
      useShakeSheetStore.getState().dismiss();
    });

    it("should show a failed shake launch on the sheet instead of a toast", async () => {
      mockRunToken.mockImplementation(async (...args: unknown[]) => {
        const options = args[10] as RunTokenOptions;
        options.onError?.(launchError);
        return false;
      });
      renderHook(() => useRunQueueProcessor());

      await queueShake();

      expect(useShakeSheetStore.getState()).toMatchObject({
        phase: "failed",
        error: "no media found",
      });
      expect(mockToast.error).not.toHaveBeenCalled();
    });

    it("should toast a shake failure once the sheet is gone", async () => {
      mockRunToken.mockImplementation(async (...args: unknown[]) => {
        const options = args[10] as RunTokenOptions;
        useShakeSheetStore.getState().dismiss();
        options.onError?.(launchError);
        return false;
      });
      renderHook(() => useRunQueueProcessor());

      await queueShake();

      expect(mockToast.error).toHaveBeenCalledWith("no media found");
    });

    it("should close the sheet when the launch is blocked before Core", async () => {
      mockRunToken.mockResolvedValue(false);
      renderHook(() => useRunQueueProcessor());

      await queueShake();

      expect(useShakeSheetStore.getState().phase).toBe("idle");
    });

    it("should show the connection deadline on the sheet", async () => {
      useStatusStore.setState({
        connectionState: ConnectionState.DISCONNECTED,
        connected: false,
      });
      renderHook(() => useRunQueueProcessor());

      await queueShake();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });

      expect(useShakeSheetStore.getState()).toMatchObject({
        phase: "failed",
        error: "create.custom.failMsg",
      });
      expect(mockToast.error).not.toHaveBeenCalled();
    });

    it("should tag confirmed deep links as queue launches", async () => {
      const { result } = renderHook(() => useRunQueueProcessor());
      act(() => {
        useStatusStore
          .getState()
          .setRunQueue({ value: "link", unsafe: false, source: "deepLink" });
      });
      await flush();

      act(() => {
        result.current.confirmRun();
      });
      await flush();

      const options = mockRunToken.mock.calls[0]?.[10] as RunTokenOptions;
      expect(options.source).toBe("queue");
      expect(options.onError).toBeUndefined();
    });
  });
});
