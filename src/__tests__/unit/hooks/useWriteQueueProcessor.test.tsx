import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useWriteQueueProcessor } from "../../../hooks/useWriteQueueProcessor";
import { useStatusStore } from "../../../lib/store";
import { Status } from "../../../lib/nfc";
import { Capacitor } from "@capacitor/core";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { CoreAPI } from "../../../lib/coreApi";
import toast from "react-hot-toast";

// Mock all dependencies
vi.mock("../../../lib/store", () => ({
  useStatusStore: vi.fn()
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
  let mockNfcWriter: {
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    status: Status | null;
  };
  let mockSetWriteOpen: ReturnType<typeof vi.fn>;
  let mockSetWriteQueue: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockNfcWriter = {
      write: vi.fn().mockResolvedValue(undefined),
      end: vi.fn().mockResolvedValue(undefined),
      status: null
    };

    mockSetWriteOpen = vi.fn();
    mockSetWriteQueue = vi.fn();

    // Mock the store with empty queue initially
    vi.mocked(useStatusStore).mockImplementation((selector: any) => {
      if (typeof selector === 'function') {
        return selector({
          writeQueue: "",
          setWriteQueue: mockSetWriteQueue
        });
      }
      return mockSetWriteQueue;
    });

    // Reset default mock behaviors
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Nfc.isAvailable).mockResolvedValue({ nfc: true, hce: false });
    vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(false);
  });

  it("should be importable without errors", () => {
    expect(typeof useWriteQueueProcessor).toBe("function");
  });

  it("should not process when queue is empty", () => {
    renderHook(() => useWriteQueueProcessor({
      nfcWriter: mockNfcWriter,
      setWriteOpen: mockSetWriteOpen
    }));

    // Should not call any NFC writer methods when queue is empty
    expect(mockNfcWriter.write).not.toHaveBeenCalled();
    expect(mockNfcWriter.end).not.toHaveBeenCalled();
    expect(mockSetWriteOpen).not.toHaveBeenCalled();
  });

  it("should process write queue when NFC is available on native platform", async () => {
    // Setup: queue has content
    vi.mocked(useStatusStore).mockImplementation((selector: any) => {
      if (typeof selector === 'function') {
        return selector({
          writeQueue: "test-write-content",
          setWriteQueue: mockSetWriteQueue
        });
      }
      return mockSetWriteQueue;
    });

    renderHook(() => useWriteQueueProcessor({
      nfcWriter: mockNfcWriter,
      setWriteOpen: mockSetWriteOpen
    }));

    await waitFor(() => {
      expect(mockSetWriteQueue).toHaveBeenCalledWith("");
    }, { timeout: 3000 });

    await waitFor(() => {
      expect(mockSetWriteOpen).toHaveBeenCalledWith(true);
    }, { timeout: 3000 });

    await waitFor(() => {
      expect(mockNfcWriter.write).toHaveBeenCalledWith("write", "test-write-content");
    }, { timeout: 3000 });
  });

  it("should check remote writers when NFC unavailable", async () => {
    vi.mocked(Nfc.isAvailable).mockResolvedValue({ nfc: false, hce: false });
    vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(true);

    vi.mocked(useStatusStore).mockImplementation((selector: any) => {
      if (typeof selector === 'function') {
        return selector({
          writeQueue: "test-content",
          setWriteQueue: mockSetWriteQueue
        });
      }
      return mockSetWriteQueue;
    });

    renderHook(() => useWriteQueueProcessor({
      nfcWriter: mockNfcWriter,
      setWriteOpen: mockSetWriteOpen
    }));

    await waitFor(() => {
      expect(CoreAPI.hasWriteCapableReader).toHaveBeenCalled();
    }, { timeout: 3000 });

    await waitFor(() => {
      expect(mockNfcWriter.write).toHaveBeenCalledWith("write", "test-content");
    }, { timeout: 3000 });
  });

  it("should show error when no write methods available", async () => {
    vi.mocked(Nfc.isAvailable).mockResolvedValue({ nfc: false, hce: false });
    vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(false);

    vi.mocked(useStatusStore).mockImplementation((selector: any) => {
      if (typeof selector === 'function') {
        return selector({
          writeQueue: "test-content",
          setWriteQueue: mockSetWriteQueue
        });
      }
      return mockSetWriteQueue;
    });

    renderHook(() => useWriteQueueProcessor({
      nfcWriter: mockNfcWriter,
      setWriteOpen: mockSetWriteOpen
    }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    }, { timeout: 3000 });

    expect(mockNfcWriter.write).not.toHaveBeenCalled();
  });

  it("should check remote writers on non-native platforms", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(true);

    vi.mocked(useStatusStore).mockImplementation((selector: any) => {
      if (typeof selector === 'function') {
        return selector({
          writeQueue: "web-content",
          setWriteQueue: mockSetWriteQueue
        });
      }
      return mockSetWriteQueue;
    });

    renderHook(() => useWriteQueueProcessor({
      nfcWriter: mockNfcWriter,
      setWriteOpen: mockSetWriteOpen
    }));

    await waitFor(() => {
      expect(CoreAPI.hasWriteCapableReader).toHaveBeenCalled();
    }, { timeout: 3000 });

    await waitFor(() => {
      expect(mockNfcWriter.write).toHaveBeenCalledWith("write", "web-content");
    }, { timeout: 3000 });
  });

  it("should not call end() if no active write operation", async () => {
    // No active status
    mockNfcWriter.status = null;

    vi.mocked(useStatusStore).mockImplementation((selector: any) => {
      if (typeof selector === 'function') {
        return selector({
          writeQueue: "test-content",
          setWriteQueue: mockSetWriteQueue
        });
      }
      return mockSetWriteQueue;
    });

    renderHook(() => useWriteQueueProcessor({
      nfcWriter: mockNfcWriter,
      setWriteOpen: mockSetWriteOpen
    }));

    await waitFor(() => {
      expect(mockNfcWriter.end).not.toHaveBeenCalled();
    });
  });

  it("should return reset function", () => {
    const { result } = renderHook(() => useWriteQueueProcessor({
      nfcWriter: mockNfcWriter,
      setWriteOpen: mockSetWriteOpen
    }));

    expect(result.current.reset).toBeInstanceOf(Function);
  });
});