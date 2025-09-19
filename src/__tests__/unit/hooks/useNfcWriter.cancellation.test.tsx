import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNfcWriter, WriteAction, WriteMethod } from "../../../lib/writeNfcHook";
import { CoreAPI } from "../../../lib/coreApi";
import { Capacitor } from "@capacitor/core";
import { Status } from "../../../lib/nfc";

// Mock dependencies
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
    getPlatform: vi.fn().mockReturnValue("web"),
  },
}));

vi.mock("@capawesome-team/capacitor-nfc", () => ({
  Nfc: {
    isAvailable: vi.fn(),
  },
}));

vi.mock("../../../lib/coreApi", () => ({
  CoreAPI: {
    write: vi.fn(),
    cancelWrite: vi.fn(),
    readersWriteCancel: vi.fn(),
    hasWriteCapableReader: vi.fn(),
  },
}));

vi.mock("../../../lib/nfc", () => ({
  cancelSession: vi.fn(),
  writeTag: vi.fn(),
  readRaw: vi.fn(),
  Status: {
    Success: 0,
    Error: 1,
    Cancelled: 2
  }
}));

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock react-hot-toast
vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

describe("useNfcWriter Cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(true);
    vi.mocked(CoreAPI.write).mockResolvedValue();
    vi.mocked(CoreAPI.readersWriteCancel).mockResolvedValue();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("write cancellation", () => {
    it("should cancel pending write operations when end() is called", async () => {
      const { result } = renderHook(() => useNfcWriter(WriteMethod.Auto, false));

      // Mock write operation that doesn't resolve immediately
      const writePromise = new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });
      vi.mocked(CoreAPI.write).mockReturnValue(writePromise as Promise<void>);

      // Start write operation
      await act(async () => {
        await result.current.write(WriteAction.Write, "test");
      });

      // End/cancel the operation
      await act(async () => {
        await result.current.end();
      });

      // Verify that cancelWrite was called
      expect(CoreAPI.cancelWrite).toHaveBeenCalledTimes(1);
    });

    it("should call readersWriteCancel for remote writer method", async () => {
      vi.mocked(CoreAPI.readersWriteCancel).mockResolvedValue();

      const { result } = renderHook(() => useNfcWriter(WriteMethod.RemoteReader, false));

      // Start write operation
      const writePromise = Promise.resolve();
      vi.mocked(CoreAPI.write).mockReturnValue(writePromise as Promise<void>);

      await act(async () => {
        await result.current.write(WriteAction.Write, "test");
      });

      // End/cancel the operation
      await act(async () => {
        await result.current.end();
      });

      // Should call both cancelWrite and readersWriteCancel
      expect(CoreAPI.cancelWrite).toHaveBeenCalledTimes(1);
      expect(CoreAPI.readersWriteCancel).toHaveBeenCalledTimes(1);
    });

    it("should call cancelSession for local NFC method", async () => {
      const { cancelSession } = await import("../../../lib/nfc");
      vi.mocked(cancelSession).mockResolvedValue();
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

      const { Nfc } = await import("@capawesome-team/capacitor-nfc");
      vi.mocked(Nfc.isAvailable).mockResolvedValue({ nfc: true, hce: false });

      const { result } = renderHook(() => useNfcWriter(WriteMethod.LocalNFC, false));

      // Start write operation using local NFC
      const writePromise = Promise.resolve({
        status: "success" as any,
        info: { rawTag: null, tag: null }
      });
      const { writeTag } = await import("../../../lib/nfc");
      vi.mocked(writeTag).mockReturnValue(writePromise);

      await act(async () => {
        await result.current.write(WriteAction.Write, "test");
      });

      // End/cancel the operation
      await act(async () => {
        await result.current.end();
      });

      // Should call both cancelWrite and cancelSession
      expect(CoreAPI.cancelWrite).toHaveBeenCalledTimes(1);
      expect(cancelSession).toHaveBeenCalledTimes(1);
    });

    it("should handle cancellation errors gracefully", async () => {
      vi.mocked(CoreAPI.readersWriteCancel).mockRejectedValue(new Error("Cancel failed"));

      const { result } = renderHook(() => useNfcWriter(WriteMethod.RemoteReader, false));

      // Start write operation
      const writePromise = Promise.resolve();
      vi.mocked(CoreAPI.write).mockReturnValue(writePromise as Promise<void>);

      await act(async () => {
        await result.current.write(WriteAction.Write, "test");
      });

      // Mock console.error to verify error logging
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // End/cancel the operation - should not throw
      await act(async () => {
        await expect(result.current.end()).resolves.not.toThrow();
      });

      // Should still call cancelWrite even if readersWriteCancel fails
      expect(CoreAPI.cancelWrite).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to cancel remote write:", expect.any(Error));

      consoleErrorSpy.mockRestore();
    });

    it("should reset write method and status after cancellation", async () => {
      const { result } = renderHook(() => useNfcWriter(WriteMethod.RemoteReader, false));

      // Start write operation
      const writePromise = Promise.resolve();
      vi.mocked(CoreAPI.write).mockReturnValue(writePromise as Promise<void>);

      await act(async () => {
        await result.current.write(WriteAction.Write, "test");
      });

      // End/cancel the operation
      await act(async () => {
        await result.current.end();
      });

      // Status should be reset
      expect(result.current.status).toBeNull();
    });
  });

  describe("rapid write/cancel sequences", () => {
    it("should handle rapid write and cancel operations", async () => {
      const { result } = renderHook(() => useNfcWriter(WriteMethod.Auto, false));

      // Perform multiple rapid write/cancel sequences
      for (let i = 0; i < 3; i++) {
        const writePromise = new Promise((resolve) => {
          setTimeout(resolve, 100);
        });
        vi.mocked(CoreAPI.write).mockReturnValue(writePromise as Promise<void>);

        await act(async () => {
          await result.current.write(WriteAction.Write, `test${i}`);
        });

        await act(async () => {
          await result.current.end();
        });
      }

      // Should have called cancelWrite for each operation
      expect(CoreAPI.cancelWrite).toHaveBeenCalledTimes(3);
    });

    it("should prevent timeout errors with immediate cancellation", async () => {
      vi.useFakeTimers();

      const { result } = renderHook(() => useNfcWriter(WriteMethod.Auto, false));

      // Start write operation that would timeout
      const writePromise = new Promise<void>((_resolve) => {
        // This will never resolve to simulate a hanging request
      });
      vi.mocked(CoreAPI.write).mockReturnValue(writePromise as Promise<void>);

      await act(async () => {
        await result.current.write(WriteAction.Write, "test");
      });

      // Cancel immediately
      await act(async () => {
        await result.current.end();
      });

      // Fast-forward time to simulate timeout period
      vi.advanceTimersByTime(35000);

      // Verify cancelWrite was called to prevent timeout
      expect(CoreAPI.cancelWrite).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it("should prevent race condition between abort handler and CoreAPI rejection", async () => {
      const { result } = renderHook(() => useNfcWriter(WriteMethod.Auto, false));

      // Create a promise that we can control
      let rejectCoreWrite: (error: Error) => void;
      const coreWritePromise = new Promise<void>((_, reject) => {
        rejectCoreWrite = reject;
      });
      vi.mocked(CoreAPI.write).mockReturnValue(coreWritePromise);

      // Start write operation
      await act(async () => {
        await result.current.write(WriteAction.Write, "test");
      });

      // Cancel the operation (triggers abort handler)
      await act(async () => {
        await result.current.end();
      });

      // Simulate CoreAPI.write() promise rejection happening after cancellation
      await act(async () => {
        rejectCoreWrite!(new Error("Write operation cancelled"));
      });

      // Should be in error state to trigger cancellation toast
      expect(result.current.status).toBe(Status.Error);
      expect(result.current.writing).toBe(false);
    });

    it("should handle multiple rapid cancel operations without duplicate toasts", async () => {
      const { result } = renderHook(() => useNfcWriter(WriteMethod.Auto, false));
      const mockToastError = vi.fn();

      // Mock toast.error to track calls
      vi.doMock("react-hot-toast", () => ({
        default: {
          error: mockToastError,
          success: vi.fn(),
          dismiss: vi.fn()
        }
      }));

      // Start and immediately cancel multiple times
      for (let i = 0; i < 3; i++) {
        const writePromise = Promise.resolve();
        vi.mocked(CoreAPI.write).mockReturnValue(writePromise);

        await act(async () => {
          await result.current.write(WriteAction.Write, "test");
        });

        // Check status before end() clears it
        expect(result.current.writing).toBe(true);

        await act(async () => {
          await result.current.end();
        });

        // After end(), status should be null and writing false
        expect(result.current.status).toBe(null);
        expect(result.current.writing).toBe(false);
      }

      // Should not have triggered any error toasts
      expect(mockToastError).not.toHaveBeenCalled();
    });
  });

  describe("write method determination with cancellation", () => {
    it("should work with auto write method selection", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(true);

      const { result } = renderHook(() => useNfcWriter(WriteMethod.Auto, true));

      const writePromise = Promise.resolve();
      vi.mocked(CoreAPI.write).mockReturnValue(writePromise as Promise<void>);

      await act(async () => {
        await result.current.write(WriteAction.Write, "test");
      });

      await act(async () => {
        await result.current.end();
      });

      expect(CoreAPI.cancelWrite).toHaveBeenCalledTimes(1);
    });

    it("should work with preferRemoteWriter setting", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(true);

      const { Nfc } = await import("@capawesome-team/capacitor-nfc");
      vi.mocked(Nfc.isAvailable).mockResolvedValue({ nfc: true, hce: false });

      // With preferRemoteWriter = true, should use remote even when local NFC available
      const { result } = renderHook(() => useNfcWriter(WriteMethod.Auto, true));

      const writePromise = Promise.resolve();
      vi.mocked(CoreAPI.write).mockReturnValue(writePromise as Promise<void>);

      await act(async () => {
        await result.current.write(WriteAction.Write, "test");
      });

      await act(async () => {
        await result.current.end();
      });

      expect(CoreAPI.cancelWrite).toHaveBeenCalledTimes(1);
      expect(CoreAPI.readersWriteCancel).toHaveBeenCalledTimes(1);
    });
  });
});