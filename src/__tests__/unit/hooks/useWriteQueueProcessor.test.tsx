import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWriteQueueProcessor } from "../../../hooks/useWriteQueueProcessor";
import { useStatusStore } from "../../../lib/store";
import { usePreferencesStore } from "../../../lib/preferencesStore";
import { useNfcWriter } from "../../../lib/writeNfcHook";
import { Capacitor } from "@capacitor/core";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { CoreAPI } from "../../../lib/coreApi";
import toast from "react-hot-toast";

// Mock all dependencies
vi.mock("../../../lib/store", () => ({
  useStatusStore: vi.fn()
}));

vi.mock("../../../lib/preferencesStore", () => ({
  usePreferencesStore: vi.fn()
}));

vi.mock("../../../lib/writeNfcHook", () => ({
  useNfcWriter: vi.fn(),
  WriteMethod: { Auto: "auto" },
  WriteAction: { Write: "write" }
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn()
  }
}));

vi.mock("@capawesome-team/capacitor-nfc", () => ({
  Nfc: {
    isAvailable: vi.fn()
  }
}));

vi.mock("../../../lib/coreApi", () => ({
  CoreAPI: {
    hasWriteCapableReader: vi.fn()
  }
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    dismiss: vi.fn()
  }
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}));

describe("useWriteQueueProcessor", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockNfcWriter: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSetWriteOpen: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSetWriteQueue: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockNfcWriter = {
      write: vi.fn().mockResolvedValue(undefined),
      end: vi.fn().mockResolvedValue(undefined),
      status: null,
      writing: false,
      result: null
    };

    mockSetWriteOpen = vi.fn();
    mockSetWriteQueue = vi.fn();

    // Mock useNfcWriter to return the mock writer
    vi.mocked(useNfcWriter).mockReturnValue(mockNfcWriter);

    // Mock the preferences store
    vi.mocked(usePreferencesStore).mockImplementation((selector: any) => {
      if (typeof selector === 'function') {
        return selector({
          preferRemoteWriter: false
        });
      }
      return false;
    });

    // Mock the status store with empty queue initially
    vi.mocked(useStatusStore).mockImplementation((selector: any) => {
      const mockState = {
        writeQueue: "",
        setWriteQueue: mockSetWriteQueue,
        setWriteOpen: mockSetWriteOpen
      };
      if (typeof selector === 'function') {
        return selector(mockState);
      }
      return mockState;
    });

    // Reset default mock behaviors
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Nfc.isAvailable).mockResolvedValue({ nfc: true, hce: false });
    vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should be importable without errors", () => {
    expect(typeof useWriteQueueProcessor).toBe("function");
  });

  it("should not process when queue is empty", () => {
    renderHook(() => useWriteQueueProcessor());

    // Should not call any NFC writer methods when queue is empty
    expect(mockNfcWriter.write).not.toHaveBeenCalled();
    expect(mockNfcWriter.end).not.toHaveBeenCalled();
    expect(mockSetWriteOpen).not.toHaveBeenCalled();
  });

  it("should process write queue when NFC is available on native platform", async () => {
    // Setup: queue has content
    vi.mocked(useStatusStore).mockImplementation((selector: any) => {
      const mockState = {
        writeQueue: "test-write-content",
        setWriteQueue: mockSetWriteQueue,
        setWriteOpen: mockSetWriteOpen
      };
      if (typeof selector === 'function') {
        return selector(mockState);
      }
      return mockState;
    });

    renderHook(() => useWriteQueueProcessor());

    // Skip the 1000ms initial delay and flush async operations
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();
    });

    // Now assertions should work immediately
    expect(mockSetWriteQueue).toHaveBeenCalledWith("");
    expect(mockSetWriteOpen).toHaveBeenCalledWith(true);
    expect(mockNfcWriter.write).toHaveBeenCalledWith("write", "test-write-content");
  });

  it("should check remote writers when NFC unavailable", async () => {
    vi.mocked(Nfc.isAvailable).mockResolvedValue({ nfc: false, hce: false });
    vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(true);

    vi.mocked(useStatusStore).mockImplementation((selector: any) => {
      const mockState = {
        writeQueue: "test-content",
        setWriteQueue: mockSetWriteQueue,
        setWriteOpen: mockSetWriteOpen
      };
      if (typeof selector === 'function') {
        return selector(mockState);
      }
      return mockState;
    });

    renderHook(() => useWriteQueueProcessor());

    // Skip the 1000ms initial delay and flush async operations
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();
    });

    // Now assertions should work immediately
    expect(CoreAPI.hasWriteCapableReader).toHaveBeenCalled();
    expect(mockNfcWriter.write).toHaveBeenCalledWith("write", "test-content");
  });

  it("should show error when no write methods available", async () => {
    vi.mocked(Nfc.isAvailable).mockResolvedValue({ nfc: false, hce: false });
    vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(false);

    vi.mocked(useStatusStore).mockImplementation((selector: any) => {
      const mockState = {
        writeQueue: "test-content",
        setWriteQueue: mockSetWriteQueue,
        setWriteOpen: mockSetWriteOpen
      };
      if (typeof selector === 'function') {
        return selector(mockState);
      }
      return mockState;
    });

    renderHook(() => useWriteQueueProcessor());

    // Skip the 1000ms initial delay and flush async operations
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();
    });

    // Now assertions should work immediately
    expect(toast.error).toHaveBeenCalled();

    expect(mockNfcWriter.write).not.toHaveBeenCalled();
  });

  it("should check remote writers on non-native platforms", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(true);

    vi.mocked(useStatusStore).mockImplementation((selector: any) => {
      const mockState = {
        writeQueue: "web-content",
        setWriteQueue: mockSetWriteQueue,
        setWriteOpen: mockSetWriteOpen
      };
      if (typeof selector === 'function') {
        return selector(mockState);
      }
      return mockState;
    });

    renderHook(() => useWriteQueueProcessor());

    // Skip the 1000ms initial delay and flush async operations
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();
    });

    // Now assertions should work immediately
    expect(CoreAPI.hasWriteCapableReader).toHaveBeenCalled();
    expect(mockNfcWriter.write).toHaveBeenCalledWith("write", "web-content");
  });

  it("should not call end() if no active write operation", async () => {
    // No active status
    mockNfcWriter.status = null;

    vi.mocked(useStatusStore).mockImplementation((selector: any) => {
      const mockState = {
        writeQueue: "test-content",
        setWriteQueue: mockSetWriteQueue,
        setWriteOpen: mockSetWriteOpen
      };
      if (typeof selector === 'function') {
        return selector(mockState);
      }
      return mockState;
    });

    renderHook(() => useWriteQueueProcessor());

    // Skip the 1000ms initial delay and flush async operations
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();
    });

    // Now assertions should work immediately
    expect(mockNfcWriter.end).not.toHaveBeenCalled();
  });

  it("should return reset function", () => {
    const { result } = renderHook(() => useWriteQueueProcessor());

    expect(result.current.reset).toBeInstanceOf(Function);
  });
});