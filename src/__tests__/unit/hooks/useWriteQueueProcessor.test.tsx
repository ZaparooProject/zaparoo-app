import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWriteQueueProcessor } from "../../../hooks/useWriteQueueProcessor";
import { useStatusStore } from "../../../lib/store";
import { Status } from "../../../lib/nfc";

// Mock all dependencies
vi.mock("../../../lib/store", () => ({
  useStatusStore: vi.fn()
}));

vi.mock("@capawesome-team/capacitor-nfc", () => ({
  Nfc: {
    isAvailable: vi.fn()
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
      write: vi.fn(),
      end: vi.fn(),
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
});