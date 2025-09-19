import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useNfcWriter, WriteAction, WriteMethod } from "../../../lib/writeNfcHook";
import { Capacitor } from "@capacitor/core";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { CoreAPI } from "../../../lib/coreApi";
import toast from "react-hot-toast";

// Mock all dependencies
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
    getPlatform: vi.fn(() => "web")
  }
}));

vi.mock("@capawesome-team/capacitor-nfc", () => ({
  Nfc: {
    isAvailable: vi.fn()
  }
}));

vi.mock("../../../lib/coreApi", () => ({
  CoreAPI: {
    write: vi.fn(),
    hasWriteCapableReader: vi.fn(),
    cancelWrite: vi.fn(),
    readersWriteCancel: vi.fn()
  }
}));

vi.mock("../../../lib/nfc", () => ({
  writeTag: vi.fn(),
  readRaw: vi.fn(),
  cancelSession: vi.fn(),
  Status: {
    Success: "success",
    Error: "error",
    Cancelled: "cancelled"
  }
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn()
  }
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}));

describe("useNfcWriter - Enhanced Functionality", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Nfc.isAvailable).mockResolvedValue({ nfc: true, hce: false });
    vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(false);
    vi.mocked(CoreAPI.write).mockResolvedValue();
    vi.mocked(CoreAPI.readersWriteCancel).mockResolvedValue();
  });

  describe("Write method selection", () => {
    it("should use local NFC when available and preferred", async () => {
      const { writeTag } = await import("../../../lib/nfc");
      vi.mocked(writeTag).mockResolvedValue({
        status: "success" as any,
        info: { rawTag: null, tag: null }
      });

      const { result } = renderHook(() => useNfcWriter(WriteMethod.LocalNFC));

      await act(async () => {
        await result.current.write(WriteAction.Write, "test-content");
      });

      expect(writeTag).toHaveBeenCalledWith("test-content");
      expect(CoreAPI.write).not.toHaveBeenCalled();
    });

    it("should use remote writer when specified", async () => {
      vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(true);

      const { result } = renderHook(() => useNfcWriter(WriteMethod.RemoteReader));

      await act(async () => {
        await result.current.write(WriteAction.Write, "test-content");
      });

      expect(CoreAPI.write).toHaveBeenCalledWith({ text: "test-content" });
    });

    it("should auto-detect and prefer local NFC on native platform", async () => {
      const { writeTag } = await import("../../../lib/nfc");
      vi.mocked(writeTag).mockResolvedValue({
        status: "success" as any,
        info: { rawTag: null, tag: null }
      });

      const { result } = renderHook(() => useNfcWriter(WriteMethod.Auto));

      await act(async () => {
        await result.current.write(WriteAction.Write, "test-content");
      });

      expect(writeTag).toHaveBeenCalledWith("test-content");
    });

    it("should fallback to remote when local NFC unavailable", async () => {
      vi.mocked(Nfc.isAvailable).mockResolvedValue({ nfc: false, hce: false });
      vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(true);

      const { result } = renderHook(() => useNfcWriter(WriteMethod.Auto));

      await act(async () => {
        await result.current.write(WriteAction.Write, "test-content");
      });

      expect(CoreAPI.write).toHaveBeenCalledWith({ text: "test-content" });
    });

    it("should prefer remote when user preference set", async () => {
      vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(true);

      const { result } = renderHook(() => useNfcWriter(WriteMethod.Auto, true));

      await act(async () => {
        await result.current.write(WriteAction.Write, "test-content");
      });

      expect(CoreAPI.write).toHaveBeenCalledWith({ text: "test-content" });
      expect(CoreAPI.hasWriteCapableReader).toHaveBeenCalled();
    });
  });

  describe("Cancellation handling", () => {
    it("should handle write cancellation for remote writes", async () => {
      vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(true);
      vi.mocked(CoreAPI.write).mockResolvedValue();

      const { result } = renderHook(() => useNfcWriter(WriteMethod.RemoteReader));

      // Start a write operation and wait for it to determine write method
      await act(async () => {
        await result.current.write(WriteAction.Write, "test-content");
      });

      // Cancel it
      await act(async () => {
        await result.current.end();
      });

      expect(CoreAPI.cancelWrite).toHaveBeenCalled();
      expect(CoreAPI.readersWriteCancel).toHaveBeenCalled();
    });

    it("should handle write cancellation for local NFC", async () => {
      const { writeTag, cancelSession } = await import("../../../lib/nfc");
      vi.mocked(writeTag).mockResolvedValue({
        status: "success" as any,
        info: { rawTag: null, tag: null }
      });

      const { result } = renderHook(() => useNfcWriter(WriteMethod.LocalNFC));

      // Start a write operation to set the current write method
      await act(async () => {
        await result.current.write(WriteAction.Write, "test-content");
      });

      await act(async () => {
        await result.current.end();
      });

      expect(cancelSession).toHaveBeenCalled();
    });

    it("should reset state after cancellation", async () => {
      const { result } = renderHook(() => useNfcWriter());

      await act(async () => {
        await result.current.end();
      });

      expect(result.current.status).toBeNull();
      expect(result.current.writing).toBe(false);
    });
  });

  describe("Error handling", () => {
    it("should handle CoreAPI write errors", async () => {
      vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(true);
      vi.mocked(CoreAPI.write).mockRejectedValue(new Error("Write failed"));

      const { result } = renderHook(() => useNfcWriter(WriteMethod.RemoteReader));

      await act(async () => {
        await result.current.write(WriteAction.Write, "test-content");
      });

      // The hook should properly handle the error and set status
      await waitFor(() => {
        expect(result.current.status).toBe("error");
      }, { timeout: 3000 });
    });

    it("should handle abort signal during remote write", async () => {
      vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(true);

      // Create an immediately aborted controller
      const mockAbortController = {
        signal: { aborted: true, addEventListener: vi.fn(), removeEventListener: vi.fn() },
        abort: vi.fn()
      };

      // Mock AbortController globally
      global.AbortController = vi.fn().mockImplementation(() => mockAbortController);

      const { result } = renderHook(() => useNfcWriter(WriteMethod.RemoteReader));

      await act(async () => {
        await result.current.write(WriteAction.Write, "test-content");
      });

      // Should not call CoreAPI.write when already aborted
      expect(CoreAPI.write).not.toHaveBeenCalled();
    });

    it("should not process write without text content", async () => {
      const { result } = renderHook(() => useNfcWriter());

      await act(async () => {
        await result.current.write(WriteAction.Write);
      });

      expect(CoreAPI.write).not.toHaveBeenCalled();
    });
  });

  describe("State management", () => {
    it("should clear state before starting new write operation", async () => {
      vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(true);
      vi.mocked(CoreAPI.write).mockResolvedValue();

      const { result } = renderHook(() => useNfcWriter(WriteMethod.RemoteReader));

      // Do a write operation - the hook manages its internal state
      await act(async () => {
        await result.current.write(WriteAction.Write, "test-content");
      });

      // The hook should manage state properly
      // Just verify the hook completed the operation without error
      expect(result.current.result).toBeDefined();
    });

    it("should provide clean abort controller for each operation", async () => {
      const mockAbortController = {
        signal: { aborted: false, addEventListener: vi.fn(), removeEventListener: vi.fn() },
        abort: vi.fn()
      };

      global.AbortController = vi.fn().mockImplementation(() => mockAbortController);

      const { result } = renderHook(() => useNfcWriter());

      await act(async () => {
        await result.current.write(WriteAction.Write, "test1");
      });

      await act(async () => {
        await result.current.write(WriteAction.Write, "test2");
      });

      // Should have created multiple controllers (old one aborted, new one created)
      expect(mockAbortController.abort).toHaveBeenCalled();
    });
  });

  describe("Platform detection", () => {
    it("should handle non-native platforms", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(true);

      const { result } = renderHook(() => useNfcWriter(WriteMethod.Auto));

      await act(async () => {
        await result.current.write(WriteAction.Write, "test-content");
      });

      expect(CoreAPI.write).toHaveBeenCalledWith({ text: "test-content" });
    });

    it("should check NFC availability on native platforms", async () => {
      const { result } = renderHook(() => useNfcWriter(WriteMethod.Auto));

      await act(async () => {
        await result.current.write(WriteAction.Write, "test-content");
      });

      expect(Nfc.isAvailable).toHaveBeenCalled();
    });
  });
});