import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "../../../test-utils";
import { useScanOperations } from "@/hooks/useScanOperations";
import { ScanResult } from "@/lib/models";
import { sessionManager } from "@/lib/nfc";
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
  __createMockNfcTag,
} from "../../../../__mocks__/@capawesome-team/capacitor-nfc";

// Helper to create mock barcode with all required properties
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
  const defaultProps = {
    connected: true,
    hasData: true,
    launcherAccess: true,
    setLastToken: vi.fn(),
    setProPurchaseModalOpen: vi.fn(),
    setWriteOpen: vi.fn(),
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

  describe("handleCameraScan", () => {
    it("should call barcode scanner", async () => {
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

    it("should process barcode value and call setLastToken", async () => {
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
        expect(setProPurchaseModalOpen).toHaveBeenCalledWith(true);
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

    it("should delay restart on iOS platform", async () => {
      // Arrange
      vi.mocked(Capacitor.getPlatform).mockReturnValue("ios");
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

      // Assert - Should NOT have restarted yet (iOS has 4s delay)
      expect(Nfc.startScanSession).toHaveBeenCalledTimes(1);

      // Advance past iOS delay
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });

      // Now should have restarted
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

      // Assert - Should not open write modal for empty content
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
  });
});
