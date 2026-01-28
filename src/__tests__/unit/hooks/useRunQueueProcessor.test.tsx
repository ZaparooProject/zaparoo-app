/**
 * Unit tests for useRunQueueProcessor hook
 *
 * Tests the launch queue processing with retry logic,
 * Pro access gating, and offline/reconnecting scenarios.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRunQueueProcessor } from "../../../hooks/useRunQueueProcessor";

// Create hoisted mocks
const { mockRunToken, mockToast, mockLogger } = vi.hoisted(() => ({
  mockRunToken: vi.fn().mockResolvedValue(true),
  mockToast: {
    error: vi.fn(),
  },
  mockLogger: {
    log: vi.fn(),
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

// Mock the stores with controllable state
const mockStoreState = {
  runQueue: null as { value: string; unsafe: boolean } | null,
  connected: true,
  launcherAccess: true,
};

const mockSetRunQueue = vi.fn();
const mockSetLastToken = vi.fn();
const mockSetProPurchaseModalOpen = vi.fn();

// Mock store with both selector pattern and getState() support
vi.mock("../../../lib/store", () => ({
  useStatusStore: Object.assign(
    vi.fn((selector: (state: unknown) => unknown) => {
      const state = {
        runQueue: mockStoreState.runQueue,
        setRunQueue: mockSetRunQueue,
        setLastToken: mockSetLastToken,
        setProPurchaseModalOpen: mockSetProPurchaseModalOpen,
        connected: mockStoreState.connected,
      };
      return selector(state);
    }),
    {
      getState: () => ({
        connected: mockStoreState.connected,
      }),
    },
  ),
}));

vi.mock("../../../lib/preferencesStore", () => ({
  usePreferencesStore: vi.fn((selector: (state: unknown) => unknown) => {
    const state = {
      launcherAccess: mockStoreState.launcherAccess,
    };
    return selector(state);
  }),
}));

describe("useRunQueueProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset store state
    mockStoreState.runQueue = null;
    mockStoreState.connected = true;
    mockStoreState.launcherAccess = true;

    // Reset mock implementations
    mockRunToken.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should not process when queue is empty", () => {
    renderHook(() => useRunQueueProcessor());

    expect(mockRunToken).not.toHaveBeenCalled();
    expect(mockSetRunQueue).not.toHaveBeenCalled();
  });

  it("should process queue immediately when connected", async () => {
    mockStoreState.runQueue = { value: "test-token", unsafe: false };
    mockStoreState.connected = true;

    renderHook(() => useRunQueueProcessor());

    // Queue should be cleared immediately
    expect(mockSetRunQueue).toHaveBeenCalledWith(null);

    // runToken should be called
    await vi.waitFor(() => {
      expect(mockRunToken).toHaveBeenCalled();
    });

    expect(mockRunToken).toHaveBeenCalledWith(
      "",
      "test-token",
      true, // launcherAccess
      true, // connected
      mockSetLastToken,
      mockSetProPurchaseModalOpen,
      false, // unsafe
      false, // override
      true, // canQueueCommands
      true, // requiresLaunch
    );
  });

  it("should pass unsafe flag correctly", async () => {
    mockStoreState.runQueue = { value: "unsafe-token", unsafe: true };
    mockStoreState.connected = true;

    renderHook(() => useRunQueueProcessor());

    await vi.waitFor(() => {
      expect(mockRunToken).toHaveBeenCalled();
    });

    expect(mockRunToken).toHaveBeenCalledWith(
      "",
      "unsafe-token",
      true,
      true,
      mockSetLastToken,
      mockSetProPurchaseModalOpen,
      true, // unsafe should be true
      false, // override
      true, // canQueueCommands
      true, // requiresLaunch
    );
  });

  it("should retry when disconnected", async () => {
    mockStoreState.runQueue = { value: "retry-token", unsafe: false };
    mockStoreState.connected = false;

    renderHook(() => useRunQueueProcessor());

    // Queue should be cleared
    expect(mockSetRunQueue).toHaveBeenCalledWith(null);

    // First attempt - not connected, should log retry
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining("Device not connected, retrying"),
    );

    // Still not connected after first retry
    expect(mockRunToken).not.toHaveBeenCalled();
  });

  it("should process after reconnection during retry", async () => {
    mockStoreState.runQueue = { value: "reconnect-token", unsafe: false };
    mockStoreState.connected = false;

    renderHook(() => useRunQueueProcessor());

    // First few retries while disconnected
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(500);
    });

    // Now reconnect
    mockStoreState.connected = true;

    // Next retry should succeed
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await vi.waitFor(() => {
      expect(mockRunToken).toHaveBeenCalled();
    });
  });

  it("should show error toast after max retries exhausted", async () => {
    mockStoreState.runQueue = { value: "fail-token", unsafe: false };
    mockStoreState.connected = false;

    renderHook(() => useRunQueueProcessor());

    // Advance through all 15 retries (500ms each = 7500ms total)
    for (let i = 0; i < 16; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
    }

    // Should show error toast
    expect(mockToast.error).toHaveBeenCalledWith("create.custom.failMsg");

    // Should log error
    expect(mockLogger.error).toHaveBeenCalledWith(
      "Failed to connect to device after multiple attempts",
      expect.any(Object),
    );

    // runToken should NOT have been called (never connected)
    expect(mockRunToken).not.toHaveBeenCalled();
  });

  it("should handle runToken errors gracefully", async () => {
    mockStoreState.runQueue = { value: "error-token", unsafe: false };
    mockStoreState.connected = true;
    mockRunToken.mockRejectedValueOnce(new Error("API Error"));

    renderHook(() => useRunQueueProcessor());

    await vi.waitFor(() => {
      expect(mockRunToken).toHaveBeenCalled();
    });

    // Allow error to propagate
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockLogger.error).toHaveBeenCalledWith(
      "runQueue error",
      expect.any(Error),
      expect.any(Object),
    );
  });

  it("should return processQueue function", () => {
    const { result } = renderHook(() => useRunQueueProcessor());

    expect(result.current.processQueue).toBeInstanceOf(Function);
  });

  it("should use launcherAccess from preferences store", async () => {
    mockStoreState.runQueue = { value: "pro-token", unsafe: false };
    mockStoreState.connected = true;
    mockStoreState.launcherAccess = false;

    renderHook(() => useRunQueueProcessor());

    await vi.waitFor(() => {
      expect(mockRunToken).toHaveBeenCalled();
    });

    expect(mockRunToken).toHaveBeenCalledWith(
      "",
      "pro-token",
      false, // launcherAccess should be false
      true,
      mockSetLastToken,
      mockSetProPurchaseModalOpen,
      false, // unsafe
      false, // override
      true, // canQueueCommands
      true, // requiresLaunch
    );
  });
});
