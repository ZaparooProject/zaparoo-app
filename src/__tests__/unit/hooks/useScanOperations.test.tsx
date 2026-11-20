import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "../../../test-utils";
import toast from "react-hot-toast";
import {
  SAME_TAG_COOLDOWN_MS,
  SAME_TAG_RECHECK_MS,
  useScanOperations,
} from "@/hooks/useScanOperations";
import { ScanResult } from "@/lib/models";
import { IOS_SHEET_SETTLE_TIMEOUT_MS, sessionManager } from "@/lib/nfc";
import { CoreAPI, CoreApiError } from "@/lib/coreApi";
import { Capacitor } from "@capacitor/core";
import {
  BarcodeScanner,
  Barcode,
  BarcodeFormat,
  BarcodeValueType,
} from "@capacitor-mlkit/barcode-scanning";

import {
  Nfc,
  __simulateTagScanned,
  __simulateScanCanceled,
  __simulateScanError,
  __createMockNfcTag,
  NfcTagTechType,
} from "../../../../__mocks__/@capawesome-team/capacitor-nfc";

// Helper to create mock barcode with all required properties
const mockLogger = vi.hoisted(() => ({
  log: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: mockLogger,
}));

const mockHaptics = vi.hoisted(() => ({
  impact: vi.fn(),
  notification: vi.fn(),
}));

vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => mockHaptics,
}));

/**
 * Camera access refused on Android, where a single scan falls back to
 * Google's scanner sheet. Granted access opens the app's own camera view,
 * covered in useScanOperations.continuousCamera.test.tsx.
 */
const refuseCameraAccess = () => {
  vi.mocked(Capacitor.getPlatform).mockReturnValue("android");
  vi.mocked(BarcodeScanner.checkPermissions).mockResolvedValueOnce({
    camera: "denied",
  });
  vi.mocked(BarcodeScanner.requestPermissions).mockResolvedValueOnce({
    camera: "denied",
  });
};

const createMockBarcode = (rawValue: string): Barcode => ({
  rawValue,
  displayValue: rawValue,
  format: BarcodeFormat.QrCode,
  valueType: BarcodeValueType.Text,
});

// Note: Internal modules (@/lib/nfc, @/lib/tokenOperations, @/lib/errors, etc.)
// are NOT mocked. They run with their real implementation using globally mocked
// Capacitor plugins (Nfc, BarcodeScanner, Haptics).

describe("useScanOperations", () => {
  const mockNfcWriter = {
    write: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
    writing: false,
    result: null,
    status: null,
    verifyError: null,
    getVerifyError: vi.fn(() => null),
    retapRequired: false,
  };

  const defaultProps = {
    connected: true,
    hasData: true,
    launcherAccess: true,
    setLastToken: vi.fn(),
    setProPurchaseModalOpen: vi.fn(),
    setWriteOpen: vi.fn(),
    nfcWriter: mockNfcWriter,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Reset session manager state
    sessionManager.shouldRestart = false;
    sessionManager.launchOnScan = true;
    // Default to native platform
    vi.mocked(Capacitor.getPlatform).mockReturnValue("android");
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
  });

  afterEach(() => {
    // Clean up any pending timers before restoring real timers
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    // CoreAPI.run spies would otherwise carry into later tests.
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("should return initial scan state", () => {
      // Arrange & Act
      const { result } = renderHook(() => useScanOperations(defaultProps));

      // Assert
      expect(result.current.scanSession).toBe(false);
      expect(result.current.scanStatus).toBe(ScanResult.Default);
    });
  });

  describe("handleScanButton", () => {
    it("should start NFC scan session when pressed", async () => {
      // Arrange
      const { result } = renderHook(() => useScanOperations(defaultProps));

      // Act
      await act(async () => {
        result.current.handleScanButton();
        await vi.advanceTimersByTimeAsync(10);
      });

      // Assert
      expect(result.current.scanSession).toBe(true);
      expect(Nfc.startScanSession).toHaveBeenCalled();
    });

    it("should cancel session when pressed during active scan", async () => {
      // Arrange
      const { result } = renderHook(() => useScanOperations(defaultProps));

      // Start scan
      await act(async () => {
        result.current.handleScanButton();
        await vi.advanceTimersByTimeAsync(10);
      });
      expect(result.current.scanSession).toBe(true);

      // Act - Press again to cancel
      await act(async () => {
        result.current.handleScanButton();
        await vi.advanceTimersByTimeAsync(10);
      });

      // Assert
      expect(result.current.scanSession).toBe(false);
      expect(Nfc.stopScanSession).toHaveBeenCalled();
    });

    it("should set success status after successful scan", async () => {
      // Arrange
      const { result } = renderHook(() => useScanOperations(defaultProps));

      // Act - Start scan
      await act(async () => {
        result.current.handleScanButton();
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(Nfc.startScanSession).toHaveBeenCalled();

      // Simulate tag scan
      await act(async () => {
        __simulateTagScanned(
          __createMockNfcTag("04abc123def456", "**launch.system:nes"),
        );
        await vi.advanceTimersByTimeAsync(100);
      });

      // Assert - use vi.waitFor which auto-advances fake timers
      await vi.waitFor(() => {
        expect(result.current.scanStatus).toBe(ScanResult.Success);
      });
    });

    it("should reset status after timeout", async () => {
      // Arrange
      const { result } = renderHook(() => useScanOperations(defaultProps));

      // Start scan
      await act(async () => {
        result.current.handleScanButton();
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(Nfc.startScanSession).toHaveBeenCalled();

      // Simulate tag scan
      await act(async () => {
        __simulateTagScanned(__createMockNfcTag("04abc123def456", "test"));
        await vi.advanceTimersByTimeAsync(100);
      });

      await vi.waitFor(() => {
        expect(result.current.scanStatus).toBe(ScanResult.Success);
      });

      // Advance past timeout (3000ms)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      // Assert
      expect(result.current.scanStatus).toBe(ScanResult.Default);
    });

    it("should handle scan cancellation", async () => {
      // Arrange
      const { result } = renderHook(() => useScanOperations(defaultProps));

      // Start scan
      await act(async () => {
        result.current.handleScanButton();
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(Nfc.startScanSession).toHaveBeenCalled();

      // Simulate user canceling scan
      await act(async () => {
        __simulateScanCanceled();
        await vi.advanceTimersByTimeAsync(100);
      });

      // Assert - Session should be closed, no error shown
      await vi.waitFor(() => {
        expect(result.current.scanSession).toBe(false);
      });
    });

    it("should call setLastToken with scanned tag data", async () => {
      // Arrange
      const setLastToken = vi.fn();
      const { result } = renderHook(() =>
        useScanOperations({
          ...defaultProps,
          setLastToken,
        }),
      );

      // Act
      await act(async () => {
        result.current.handleScanButton();
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(Nfc.startScanSession).toHaveBeenCalled();

      await act(async () => {
        __simulateTagScanned(
          __createMockNfcTag("04abc123def456", "**launch.system:nes"),
        );
        await vi.advanceTimersByTimeAsync(100);
      });

      // Assert - use vi.waitFor which auto-advances fake timers
      await vi.waitFor(() => {
        expect(setLastToken).toHaveBeenCalled();
      });

      expect(setLastToken.mock.calls[0]).toBeDefined();
      const lastTokenCall = setLastToken.mock.calls[0]![0];
      expect(lastTokenCall.uid).toBe("04abc123def456");
      expect(lastTokenCall.text).toBe("**launch.system:nes");
    });
  });

  describe("handleCameraScan with the system scanner sheet", () => {
    it("should call barcode scanner", async () => {
      refuseCameraAccess();
      // Arrange
      vi.mocked(BarcodeScanner.scan).mockResolvedValue({
        barcodes: [createMockBarcode("**launch.system:snes")],
      });
      const { result } = renderHook(() => useScanOperations(defaultProps));

      // Act
      await act(async () => {
        await result.current.handleCameraScan();
      });

      // Assert
      expect(BarcodeScanner.scan).toHaveBeenCalled();
    });

    it("offers to map a code Core can't run, on the scan control", async () => {
      refuseCameraAccess();
      const toastError = vi.spyOn(toast, "error");
      vi.spyOn(CoreAPI, "run").mockRejectedValue(
        new CoreApiError("no media", 1, { category: "media_not_found" }),
      );
      vi.mocked(BarcodeScanner.scan).mockResolvedValue({
        barcodes: [createMockBarcode("9780140449136")],
      });
      const { result } = renderHook(() => useScanOperations(defaultProps));

      await act(async () => {
        await result.current.handleCameraScan();
      });

      await vi.waitFor(() => {
        expect(result.current.scanError).toEqual({
          message: "scan.notSetUp",
          source: "camera",
          prefill: { type: "value", pattern: "9780140449136" },
        });
      });
      expect(toastError).not.toHaveBeenCalled();
    });

    it("should not open the scanner outside the native app", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      const { result } = renderHook(() => useScanOperations(defaultProps));

      await act(async () => {
        await result.current.handleCameraScan();
      });

      expect(BarcodeScanner.scan).not.toHaveBeenCalled();
      expect(mockHaptics.notification).not.toHaveBeenCalled();
    });

    it("should process barcode value and call setLastToken", async () => {
      refuseCameraAccess();
      // Arrange
      vi.mocked(BarcodeScanner.scan).mockResolvedValue({
        barcodes: [createMockBarcode("game:mario")],
      });
      const setLastToken = vi.fn();
      const { result } = renderHook(() =>
        useScanOperations({ ...defaultProps, setLastToken }),
      );

      // Act
      await act(async () => {
        await result.current.handleCameraScan();
      });

      // Assert
      expect(setLastToken).toHaveBeenCalled();
      expect(setLastToken.mock.calls[0]).toBeDefined();
      const lastTokenCall = setLastToken.mock.calls[0]![0];
      expect(lastTokenCall.uid).toBe("game:mario");
      expect(lastTokenCall.text).toBe("game:mario");
    });

    it("should handle write command barcodes", async () => {
      refuseCameraAccess();
      // Arrange
      vi.mocked(BarcodeScanner.scan).mockResolvedValue({
        barcodes: [createMockBarcode("**write:Some NFC content")],
      });
      const setWriteOpen = vi.fn();
      const setLastToken = vi.fn();
      const { result } = renderHook(() =>
        useScanOperations({ ...defaultProps, setWriteOpen, setLastToken }),
      );

      // Act
      await act(async () => {
        await result.current.handleCameraScan();
      });

      // Assert
      expect(setWriteOpen).toHaveBeenCalledWith(true);
      // Should not call setLastToken for write commands
      expect(setLastToken).not.toHaveBeenCalled();
    });

    it("should ignore empty barcode results", async () => {
      // Arrange
      vi.mocked(BarcodeScanner.scan).mockResolvedValue({
        barcodes: [],
      });
      const setLastToken = vi.fn();
      const { result } = renderHook(() =>
        useScanOperations({ ...defaultProps, setLastToken }),
      );

      // Act
      await act(async () => {
        await result.current.handleCameraScan();
      });

      // Assert
      expect(setLastToken).not.toHaveBeenCalled();
    });

    it("should handle user cancellation gracefully", async () => {
      // Arrange - Barcode scanner throws when user cancels
      vi.mocked(BarcodeScanner.scan).mockRejectedValue(
        new Error("User cancelled the scan session"),
      );
      const setLastToken = vi.fn();
      const { result } = renderHook(() =>
        useScanOperations({ ...defaultProps, setLastToken }),
      );

      // Act - Should not throw
      await act(async () => {
        await result.current.handleCameraScan();
      });

      // Assert - No token set, error handled gracefully
      expect(setLastToken).not.toHaveBeenCalled();
    });

    it("should not report denied camera access", async () => {
      refuseCameraAccess();
      vi.useRealTimers();
      try {
        vi.mocked(BarcodeScanner.scan).mockRejectedValue(
          new Error("User denied access to camera."),
        );
        const { result } = renderHook(() => useScanOperations(defaultProps));

        await act(async () => {
          await result.current.handleCameraScan();
        });

        await waitFor(() => {
          expect(mockHaptics.notification).toHaveBeenCalledWith("error");
        });
        expect(mockLogger.error).not.toHaveBeenCalled();
      } finally {
        vi.useFakeTimers();
      }
    });
  });

  describe("handleStopConfirm", () => {
    it("should call setLastToken with stop command", async () => {
      // Arrange
      const setLastToken = vi.fn();
      const { result } = renderHook(() =>
        useScanOperations({
          ...defaultProps,
          setLastToken,
        }),
      );

      // Act
      await act(async () => {
        result.current.handleStopConfirm();
      });

      // Assert
      expect(setLastToken).toHaveBeenCalled();
      expect(setLastToken.mock.calls[0]).toBeDefined();
      const lastTokenCall = setLastToken.mock.calls[0]![0];
      expect(lastTokenCall.uid).toBe("**stop");
      expect(lastTokenCall.text).toBe("**stop");
    });
  });

  describe("connection state handling", () => {
    it("should still process scans when disconnected", async () => {
      // Arrange
      const setLastToken = vi.fn();
      const { result } = renderHook(() =>
        useScanOperations({ ...defaultProps, connected: false, setLastToken }),
      );

      // Act
      await act(async () => {
        result.current.handleScanButton();
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(Nfc.startScanSession).toHaveBeenCalled();

      await act(async () => {
        __simulateTagScanned(__createMockNfcTag("04abc123def456", "test"));
        await vi.advanceTimersByTimeAsync(100);
      });

      // Assert - Token should still be stored locally
      await vi.waitFor(() => {
        expect(setLastToken).toHaveBeenCalled();
      });
    });
  });

  describe("pro access handling", () => {
    it("should show pro purchase modal when launchOnScan is on but no pro access", async () => {
      // Arrange
      sessionManager.launchOnScan = true;
      const setProPurchaseModalOpen = vi.fn();
      const { result } = renderHook(() =>
        useScanOperations({
          ...defaultProps,
          launcherAccess: false,
          setProPurchaseModalOpen,
        }),
      );

      // Act
      await act(async () => {
        result.current.handleScanButton();
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(Nfc.startScanSession).toHaveBeenCalled();

      await act(async () => {
        __simulateTagScanned(__createMockNfcTag("04abc123def456", "game:test"));
        await vi.advanceTimersByTimeAsync(100);
      });

      // Assert - Should show pro purchase modal
      await vi.waitFor(() => {
        expect(setProPurchaseModalOpen).toHaveBeenCalledWith(true, "nfc");
      });
    });

    it("should open the pro purchase modal from the camera for a camera scan", async () => {
      refuseCameraAccess();
      sessionManager.launchOnScan = true;
      vi.mocked(BarcodeScanner.scan).mockResolvedValue({
        barcodes: [createMockBarcode("**launch.system:snes")],
      });
      const setProPurchaseModalOpen = vi.fn();
      const { result } = renderHook(() =>
        useScanOperations({
          ...defaultProps,
          launcherAccess: false,
          setProPurchaseModalOpen,
        }),
      );

      await act(async () => {
        await result.current.handleCameraScan();
      });

      await vi.waitFor(() => {
        expect(setProPurchaseModalOpen).toHaveBeenCalledWith(true, "camera");
      });
    });

    it("should not show pro purchase modal when launchOnScan is off", async () => {
      // Arrange
      sessionManager.launchOnScan = false;
      const setProPurchaseModalOpen = vi.fn();
      const setLastToken = vi.fn();
      const { result } = renderHook(() =>
        useScanOperations({
          ...defaultProps,
          launcherAccess: false,
          setProPurchaseModalOpen,
          setLastToken,
        }),
      );

      // Act
      await act(async () => {
        result.current.handleScanButton();
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(Nfc.startScanSession).toHaveBeenCalled();

      await act(async () => {
        __simulateTagScanned(__createMockNfcTag("04abc123def456", "game:test"));
        await vi.advanceTimersByTimeAsync(100);
      });

      // Assert - Should just store token without showing modal
      await vi.waitFor(() => {
        expect(setLastToken).toHaveBeenCalled();
      });
      expect(setProPurchaseModalOpen).not.toHaveBeenCalled();
    });
  });

  describe("continuous scan launch state", () => {
    it("should use Pro access gained after the scan session started", async () => {
      sessionManager.launchOnScan = true;
      sessionManager.shouldRestart = true;
      const setProPurchaseModalOpen = vi.fn();
      const setLastToken = vi.fn();
      const { result, rerender } = renderHook(
        ({ launcherAccess }: { launcherAccess: boolean }) =>
          useScanOperations({
            ...defaultProps,
            launcherAccess,
            setProPurchaseModalOpen,
            setLastToken,
          }),
        { initialProps: { launcherAccess: false } },
      );

      await act(async () => {
        result.current.handleScanButton();
        await vi.advanceTimersByTimeAsync(10);
      });
      rerender({ launcherAccess: true });

      await act(async () => {
        __simulateTagScanned(__createMockNfcTag("04abc123def456", "game:test"));
        await vi.advanceTimersByTimeAsync(100);
      });

      await vi.waitFor(() => expect(setLastToken).toHaveBeenCalled());
      expect(setProPurchaseModalOpen).not.toHaveBeenCalledWith(true);
    });
  });

  describe("unmount", () => {
    it("should cancel the scan session it started", async () => {
      const { result, unmount } = renderHook(() =>
        useScanOperations(defaultProps),
      );
      await act(async () => {
        result.current.handleScanButton();
        await vi.advanceTimersByTimeAsync(10);
      });
      vi.mocked(Nfc.stopScanSession).mockClear();

      unmount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(Nfc.stopScanSession).toHaveBeenCalled();
    });

    it("should leave an NFC session it does not own alone", async () => {
      const { unmount } = renderHook(() => useScanOperations(defaultProps));

      unmount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(Nfc.stopScanSession).not.toHaveBeenCalled();
    });
  });

  describe("scan restart behavior", () => {
    it("should restart scan when shouldRestart is true and scan succeeds", async () => {
      // Arrange
      sessionManager.shouldRestart = true;
      const { result } = renderHook(() => useScanOperations(defaultProps));

      // Act - Start scan
      await act(async () => {
        result.current.handleScanButton();
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(Nfc.startScanSession).toHaveBeenCalledTimes(1);

      // Simulate successful tag scan
      await act(async () => {
        __simulateTagScanned(__createMockNfcTag("04abc123def456", "game:test"));
        await vi.advanceTimersByTimeAsync(100);
      });

      // Assert - Should restart scan (on Android, immediately)
      await vi.waitFor(() => {
        expect(Nfc.startScanSession).toHaveBeenCalledTimes(2);
      });

      // Session should remain active
      expect(result.current.scanSession).toBe(true);
    });

    it("should restart on iOS once the scan sheet has closed", async () => {
      vi.spyOn(CoreAPI, "run").mockResolvedValue(undefined as never);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("ios");
      sessionManager.shouldRestart = true;
      const { result } = renderHook(() => useScanOperations(defaultProps));

      await act(async () => {
        result.current.handleScanButton();
        await vi.advanceTimersByTimeAsync(10);
      });
      expect(Nfc.startScanSession).toHaveBeenCalledTimes(1);

      await act(async () => {
        __simulateTagScanned(__createMockNfcTag("04abc123def456", "game:test"));
        await vi.advanceTimersByTimeAsync(100);
      });

      // The sheet is still closing, so a new session would fail to open.
      expect(Nfc.stopScanSession).toHaveBeenCalledWith();
      expect(Nfc.startScanSession).toHaveBeenCalledTimes(1);

      await act(async () => {
        __simulateScanCanceled();
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(Nfc.startScanSession).toHaveBeenCalledTimes(2);
    });

    it("should restart on iOS after a timeout if the sheet never reports closing", async () => {
      vi.spyOn(CoreAPI, "run").mockResolvedValue(undefined as never);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("ios");
      sessionManager.shouldRestart = true;
      const { result } = renderHook(() => useScanOperations(defaultProps));

      await act(async () => {
        result.current.handleScanButton();
        await vi.advanceTimersByTimeAsync(10);
      });
      await act(async () => {
        __simulateTagScanned(__createMockNfcTag("04abc123def456", "game:test"));
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(Nfc.startScanSession).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(IOS_SHEET_SETTLE_TIMEOUT_MS);
      });

      expect(Nfc.startScanSession).toHaveBeenCalledTimes(2);
    });

    it("should not restart scan when session is cancelled", async () => {
      // Arrange
      sessionManager.shouldRestart = true;
      const { result } = renderHook(() => useScanOperations(defaultProps));

      // Start scan
      await act(async () => {
        result.current.handleScanButton();
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(Nfc.startScanSession).toHaveBeenCalledTimes(1);

      // Simulate cancellation
      await act(async () => {
        __simulateScanCanceled();
        await vi.advanceTimersByTimeAsync(100);
      });

      // Assert - Should NOT restart (cancelled status)
      await vi.waitFor(() => {
        expect(result.current.scanSession).toBe(false);
      });
      expect(Nfc.startScanSession).toHaveBeenCalledTimes(1);
    });
  });

  describe("NFC launches", () => {
    const startScan = async (result: {
      current: ReturnType<typeof useScanOperations>;
    }) => {
      await act(async () => {
        result.current.handleScanButton();
        await vi.advanceTimersByTimeAsync(10);
      });
    };

    const tapTag = async (uid: string, text: string) => {
      await act(async () => {
        __simulateTagScanned(__createMockNfcTag(uid, text));
        await vi.advanceTimersByTimeAsync(10);
      });
    };

    it("sends a toy tag's type and data to Core", async () => {
      const run = vi
        .spyOn(CoreAPI, "run")
        .mockResolvedValue(undefined as never);
      const amiiboHeader = [
        0x04, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x48, 0x0f, 0xe0,
        0xf1, 0x10, 0xff, 0xee,
      ];
      const amiiboId = [
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0, 0, 0, 0, 0, 0, 0, 0,
      ];
      vi.mocked(Nfc.connect).mockResolvedValue(undefined);
      vi.mocked(Nfc.transceive).mockImplementation(async ({ data }) => ({
        response: data[1] === 0 ? amiiboHeader : amiiboId,
      }));
      const { result } = renderHook(() => useScanOperations(defaultProps));

      await startScan(result);
      await act(async () => {
        __simulateTagScanned({
          ...__createMockNfcTag("04112233445566", ""),
          techTypes: [NfcTagTechType.NfcA],
        });
        await vi.advanceTimersByTimeAsync(10);
      });

      await vi.waitFor(() => {
        expect(run).toHaveBeenCalledWith(
          expect.objectContaining({
            uid: "04112233445566",
            text: "",
            type: "Amiibo",
            data: "0102030405060708",
          }),
        );
      });
    });

    it("shows a failed launch on the scan control instead of a toast", async () => {
      const toastError = vi.spyOn(toast, "error");
      vi.spyOn(CoreAPI, "run").mockRejectedValue(
        new CoreApiError("launcher not found", 1),
      );
      const { result } = renderHook(() => useScanOperations(defaultProps));

      await startScan(result);
      await tapTag("04abc123def456", "**launch.system:nes");

      await vi.waitFor(() => {
        expect(result.current.scanError).toEqual({
          message: "launcher not found",
          source: "nfc",
          prefill: null,
        });
      });
      expect(toastError).not.toHaveBeenCalled();

      act(() => {
        result.current.clearScanError();
      });
      expect(result.current.scanError).toBeNull();
    });

    it("offers to map a tag Core has nothing to run for", async () => {
      vi.spyOn(CoreAPI, "run").mockRejectedValue(
        new CoreApiError("no script", 1, { category: "invalid_script" }),
      );
      const { result } = renderHook(() => useScanOperations(defaultProps));

      await startScan(result);
      await tapTag("04abc123def456", "");

      await vi.waitFor(() => {
        expect(result.current.scanError).toEqual({
          message: "scan.notSetUp",
          source: "nfc",
          prefill: { type: "id", pattern: "04abc123def456" },
        });
      });
    });

    it("clears the last error when a new scan starts", async () => {
      vi.spyOn(CoreAPI, "run").mockRejectedValue(
        new CoreApiError("launcher not found", 1),
      );
      const { result } = renderHook(() => useScanOperations(defaultProps));

      await startScan(result);
      await tapTag("04abc123def456", "**launch.system:nes");
      await vi.waitFor(() => {
        expect(result.current.scanError).not.toBeNull();
      });

      await startScan(result);
      expect(result.current.scanError).toBeNull();
    });

    it("waits out the cooldown when the same tag is read again", async () => {
      const run = vi
        .spyOn(CoreAPI, "run")
        .mockResolvedValue(undefined as never);
      sessionManager.shouldRestart = true;
      const { result } = renderHook(() => useScanOperations(defaultProps));

      await startScan(result);
      await tapTag("04abc123def456", "**launch.system:nes");
      expect(Nfc.startScanSession).toHaveBeenCalledTimes(2);

      // The tag is still on the phone, so the new session reads it again.
      await tapTag("04abc123def456", "**launch.system:nes");
      expect(run).toHaveBeenCalledTimes(1);
      expect(Nfc.startScanSession).toHaveBeenCalledTimes(2);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(SAME_TAG_RECHECK_MS);
      });
      expect(Nfc.startScanSession).toHaveBeenCalledTimes(3);

      // Away from the phone for the full cooldown, it launches again.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SAME_TAG_COOLDOWN_MS);
      });
      await tapTag("04abc123def456", "**launch.system:nes");
      expect(run).toHaveBeenCalledTimes(2);
    });

    it("never launches a tag again while it stays on the phone", async () => {
      const run = vi
        .spyOn(CoreAPI, "run")
        .mockResolvedValue(undefined as never);
      sessionManager.shouldRestart = true;
      const { result } = renderHook(() => useScanOperations(defaultProps));

      await startScan(result);
      await tapTag("04abc123def456", "**launch.system:nes");
      expect(run).toHaveBeenCalledTimes(1);

      // Every new session reads the resting tag again, each time after the
      // wait the previous read asked for.
      for (let read = 0; read < 6; read++) {
        await tapTag("04abc123def456", "**launch.system:nes");
        await act(async () => {
          await vi.advanceTimersByTimeAsync(SAME_TAG_RECHECK_MS);
        });
      }

      expect(run).toHaveBeenCalledTimes(1);
    });

    it("launches a different tag straight away", async () => {
      const run = vi
        .spyOn(CoreAPI, "run")
        .mockResolvedValue(undefined as never);
      sessionManager.shouldRestart = true;
      const { result } = renderHook(() => useScanOperations(defaultProps));

      await startScan(result);
      await tapTag("04abc123def456", "**launch.system:nes");
      await tapTag("04ffffffffffff", "**launch.system:snes");

      expect(run).toHaveBeenCalledTimes(2);
    });
  });

  describe("error handling", () => {
    it("should set error status when NFC scan fails", async () => {
      // Arrange - Mock Nfc to simulate an error during scan
      vi.mocked(Nfc.startScanSession).mockRejectedValueOnce(
        new Error("NFC hardware error"),
      );
      const { result } = renderHook(() => useScanOperations(defaultProps));

      // Act
      await act(async () => {
        result.current.handleScanButton();
        await vi.advanceTimersByTimeAsync(100);
      });

      // Assert
      await vi.waitFor(() => {
        expect(result.current.scanStatus).toBe(ScanResult.Error);
      });
      expect(result.current.scanSession).toBe(false);
    });

    it("should reset error status after timeout", async () => {
      // Arrange
      vi.mocked(Nfc.startScanSession).mockRejectedValueOnce(
        new Error("NFC hardware error"),
      );
      const { result } = renderHook(() => useScanOperations(defaultProps));

      // Act
      await act(async () => {
        result.current.handleScanButton();
        await vi.advanceTimersByTimeAsync(100);
      });

      await vi.waitFor(() => {
        expect(result.current.scanStatus).toBe(ScanResult.Error);
      });

      // Advance past timeout (3000ms)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      // Assert
      expect(result.current.scanStatus).toBe(ScanResult.Default);
    });

    it("should not log expected transient NFC scan failures as errors", async () => {
      const { result } = renderHook(() => useScanOperations(defaultProps));

      await act(async () => {
        result.current.handleScanButton();
        await vi.advanceTimersByTimeAsync(10);
      });

      await act(async () => {
        __simulateScanError({ message: "Tag was lost." });
        await vi.advanceTimersByTimeAsync(100);
      });

      await vi.waitFor(() => {
        expect(result.current.scanStatus).toBe(ScanResult.Error);
      });
      expect(result.current.scanSession).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Expected NFC scan failure",
        expect.any(Error),
      );
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it("should log unexpected NFC scan failures as errors", async () => {
      const { result } = renderHook(() => useScanOperations(defaultProps));

      await act(async () => {
        result.current.handleScanButton();
        await vi.advanceTimersByTimeAsync(10);
      });

      await act(async () => {
        __simulateScanError({ message: "NFC hardware error" });
        await vi.advanceTimersByTimeAsync(100);
      });

      await vi.waitFor(() => {
        expect(result.current.scanStatus).toBe(ScanResult.Error);
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        "NFC scan failed",
        expect.any(Error),
        expect.objectContaining({
          category: "nfc",
          action: "doScan",
        }),
      );
    });

    it("should handle barcode scanner errors gracefully", async () => {
      // Arrange - Non-cancellation error
      vi.mocked(BarcodeScanner.scan).mockRejectedValue(
        new Error("Camera permission denied"),
      );
      const setLastToken = vi.fn();
      const { result } = renderHook(() =>
        useScanOperations({ ...defaultProps, setLastToken }),
      );

      // Act - Should not throw
      await act(async () => {
        await result.current.handleCameraScan();
      });

      // Assert - Error handled, no token set
      expect(setLastToken).not.toHaveBeenCalled();
    });

    it("should ignore empty write command barcodes", async () => {
      // Arrange - **write: with no content after
      vi.mocked(BarcodeScanner.scan).mockResolvedValue({
        barcodes: [createMockBarcode("**write:")],
      });
      const setWriteOpen = vi.fn();
      const setLastToken = vi.fn();
      const { result } = renderHook(() =>
        useScanOperations({ ...defaultProps, setWriteOpen, setLastToken }),
      );

      // Act
      await act(async () => {
        await result.current.handleCameraScan();
      });

      // Assert - Should not open reader activity for empty content
      expect(setWriteOpen).not.toHaveBeenCalled();
      expect(setLastToken).not.toHaveBeenCalled();
    });

    it("should ignore undefined barcode in results", async () => {
      // Arrange - First barcode is undefined (edge case)
      vi.mocked(BarcodeScanner.scan).mockResolvedValue({
        barcodes: [undefined as unknown as Barcode],
      });
      const setLastToken = vi.fn();
      const { result } = renderHook(() =>
        useScanOperations({ ...defaultProps, setLastToken }),
      );

      // Act
      await act(async () => {
        await result.current.handleCameraScan();
      });

      // Assert - Should handle gracefully
      expect(setLastToken).not.toHaveBeenCalled();
    });

    it("should ignore barcode with undefined rawValue", async () => {
      // Arrange - Barcode object exists but rawValue is missing.
      // @capacitor-mlkit/barcode-scanning v8 made Barcode.rawValue optional.
      vi.mocked(BarcodeScanner.scan).mockResolvedValue({
        barcodes: [{ displayValue: "ignored" } as Barcode],
      });
      const setWriteOpen = vi.fn();
      const setLastToken = vi.fn();
      const { result } = renderHook(() =>
        useScanOperations({ ...defaultProps, setWriteOpen, setLastToken }),
      );

      // Act
      await act(async () => {
        await result.current.handleCameraScan();
      });

      // Assert - Should handle gracefully without launching or opening reader activity
      expect(setLastToken).not.toHaveBeenCalled();
      expect(setWriteOpen).not.toHaveBeenCalled();
    });
  });
});
