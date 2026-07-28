import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "../../../test-utils";
import { useWriteQueueProcessor } from "@/hooks/useWriteQueueProcessor";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { Capacitor } from "@capacitor/core";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import {
  __simulateTagScanned,
  __createMockNfcTag,
} from "../../../../__mocks__/@capawesome-team/capacitor-nfc";
import { CoreAPI } from "@/lib/coreApi";
import toast from "react-hot-toast";

// Note: Internal modules (useStatusStore, usePreferencesStore, useNfcWriter)
// are NOT mocked. They run with their real implementation using globally mocked
// Capacitor plugins (Nfc, Capacitor).

// Mock toast since it's an external UI library
vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
    dismiss: vi.fn(),
  },
}));

describe("useWriteQueueProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset stores to initial state
    useStatusStore.setState(useStatusStore.getInitialState());
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
      nfcAvailable: true,
    });

    // Default to native platform with NFC available
    vi.mocked(Capacitor.getPlatform).mockReturnValue("android");
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Nfc.isAvailable).mockResolvedValue({ nfc: true, hce: false });

    // Mock CoreAPI methods that make network calls
    vi.spyOn(CoreAPI, "hasWriteCapableReader").mockResolvedValue(false);
    vi.spyOn(CoreAPI, "isConnected").mockReturnValue(true);
    vi.spyOn(CoreAPI, "write").mockResolvedValue(undefined);
    vi.spyOn(CoreAPI, "cancelWrite").mockReturnValue(undefined);
    vi.spyOn(CoreAPI, "readersWriteCancel").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("should return reset function", () => {
      // Arrange & Act
      const { result } = renderHook(() => useWriteQueueProcessor());

      // Assert
      expect(result.current.reset).toBeInstanceOf(Function);
    });

    it("should not process when queue is empty", async () => {
      // Arrange - queue is empty by default
      renderHook(() => useWriteQueueProcessor());

      // Act
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Assert - writeOpen should not be set
      expect(useStatusStore.getState().writeOpen).toBe(false);
    });
  });

  describe("queue processing with local NFC", () => {
    function ndefTextReadResponse(text: string): number[] {
      const payload = [
        2,
        ...Array.from(`en${text}`).map((character) => character.charCodeAt(0)),
      ];
      const ndef = [0xd1, 0x01, payload.length, 0x54, ...payload];
      const response = [0x03, ndef.length, ...ndef, 0xfe];
      while (response.length < 16) {
        response.push(0x00);
      }
      return response;
    }

    it("should process write queue when NFC is available on native platform", async () => {
      // Arrange
      usePreferencesStore.setState({ nfcAvailable: true });
      renderHook(() => useWriteQueueProcessor());

      // Act - Add content to queue
      act(() => {
        useStatusStore.getState().setWriteQueue("test-write-content");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Assert
      expect(useStatusStore.getState().writeQueue).toBe("");
      expect(useStatusStore.getState().writeOpen).toBe(true);
      expect(Nfc.startScanSession).toHaveBeenCalled();
    });

    it("should clear the queue when processing starts", async () => {
      // Arrange
      usePreferencesStore.setState({ nfcAvailable: true });
      renderHook(() => useWriteQueueProcessor());

      // Act
      act(() => {
        useStatusStore.getState().setWriteQueue("content-to-write");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });

      // Assert - Queue should be cleared
      expect(useStatusStore.getState().writeQueue).toBe("");
    });

    it("should open write modal when processing", async () => {
      // Arrange
      usePreferencesStore.setState({ nfcAvailable: true });
      renderHook(() => useWriteQueueProcessor());

      // Act
      act(() => {
        useStatusStore.getState().setWriteQueue("modal-test");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Assert
      expect(useStatusStore.getState().writeOpen).toBe(true);
    });

    it("should close the write modal after the write completes", async () => {
      // Arrange - default global mock skips verification (connect rejects)
      usePreferencesStore.setState({ nfcAvailable: true });
      renderHook(() => useWriteQueueProcessor());

      act(() => {
        useStatusStore.getState().setWriteQueue("queued-content");
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(useStatusStore.getState().writeOpen).toBe(true);

      // Act - simulate the tag scan that lets the write complete
      await act(async () => {
        __simulateTagScanned(__createMockNfcTag("01020304", ""));
        await vi.advanceTimersByTimeAsync(100);
      });

      // Assert
      await vi.waitFor(() => {
        expect(useStatusStore.getState().writeOpen).toBe(false);
      });
    });

    it("should keep the write modal open when write verification fails", async () => {
      // Arrange - the read-back reports a tag without any NDEF message
      usePreferencesStore.setState({ nfcAvailable: true });
      vi.mocked(Nfc.connect).mockResolvedValue(undefined);
      vi.mocked(Nfc.transceive).mockResolvedValue({
        response: [
          0xfe, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00,
        ],
      });
      renderHook(() => useWriteQueueProcessor());

      act(() => {
        useStatusStore.getState().setWriteQueue("queued-content");
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(useStatusStore.getState().writeOpen).toBe(true);

      // Act - simulate the tag scan; the write succeeds but verification fails
      await act(async () => {
        __simulateTagScanned(__createMockNfcTag("01020304", ""));
        await vi.advanceTimersByTimeAsync(100);
      });

      // Assert - modal stays open showing the retry UI, no toast yet
      expect(useStatusStore.getState().writeOpen).toBe(true);
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("should keep the next write queued until verification retry succeeds", async () => {
      usePreferencesStore.setState({ nfcAvailable: true });
      vi.mocked(Nfc.connect).mockResolvedValue(undefined);
      vi.mocked(Nfc.transceive).mockResolvedValue({
        response: [0xfe, ...Array<number>(15).fill(0)],
      });
      const { result } = renderHook(() => useWriteQueueProcessor());

      act(() => {
        useStatusStore.getState().setWriteQueue("a");
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
        __simulateTagScanned(__createMockNfcTag("01020304", ""));
        await vi.advanceTimersByTimeAsync(100);
      });

      act(() => {
        useStatusStore.getState().setWriteQueue("b");
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(useStatusStore.getState().writeQueue).toBe("b");
      expect(Nfc.startScanSession).toHaveBeenCalledTimes(1);

      vi.mocked(Nfc.transceive).mockResolvedValue({
        response: ndefTextReadResponse("a"),
      });
      let retryPromise: Promise<void>;
      act(() => {
        retryPromise = result.current.nfcWriter.retry();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
        __simulateTagScanned(__createMockNfcTag("01020304", ""));
        await retryPromise!;
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(useStatusStore.getState().writeQueue).toBe("");
      expect(Nfc.startScanSession).toHaveBeenCalledTimes(3);

      await act(async () => {
        await result.current.nfcWriter.end();
      });
    });

    it("should resume the queue when verification is cancelled", async () => {
      usePreferencesStore.setState({ nfcAvailable: true });
      vi.mocked(Nfc.connect).mockResolvedValue(undefined);
      vi.mocked(Nfc.transceive).mockResolvedValue({
        response: [0xfe, ...Array<number>(15).fill(0)],
      });
      const { result } = renderHook(() => useWriteQueueProcessor());

      act(() => {
        useStatusStore.getState().setWriteQueue("a");
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
        __simulateTagScanned(__createMockNfcTag("01020304", ""));
        await vi.advanceTimersByTimeAsync(100);
      });

      act(() => {
        useStatusStore.getState().setWriteQueue("b");
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(useStatusStore.getState().writeQueue).toBe("b");

      await act(async () => {
        await result.current.nfcWriter.end();
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(useStatusStore.getState().writeQueue).toBe("");
      expect(Nfc.startScanSession).toHaveBeenCalledTimes(2);

      await act(async () => {
        await result.current.nfcWriter.end();
      });
    });
  });

  describe("queue processing with remote writer", () => {
    it("should check remote writers when NFC unavailable and connected", async () => {
      // Arrange - No local NFC, but connected with remote writer
      usePreferencesStore.setState({ nfcAvailable: false });
      useStatusStore.setState({
        connected: true,
        connectionState: ConnectionState.CONNECTED,
      });
      vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(true);
      vi.mocked(CoreAPI.isConnected).mockReturnValue(true);

      renderHook(() => useWriteQueueProcessor());

      // Act
      act(() => {
        useStatusStore.getState().setWriteQueue("remote-write-content");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Assert
      expect(CoreAPI.hasWriteCapableReader).toHaveBeenCalled();
      expect(useStatusStore.getState().writeOpen).toBe(true);
    });

    it("should check remote writers on non-native platforms when connected", async () => {
      // Arrange - Web platform
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      usePreferencesStore.setState({ nfcAvailable: false });
      useStatusStore.setState({
        connected: true,
        connectionState: ConnectionState.CONNECTED,
      });
      vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(true);
      vi.mocked(CoreAPI.isConnected).mockReturnValue(true);

      renderHook(() => useWriteQueueProcessor());

      // Act
      act(() => {
        useStatusStore.getState().setWriteQueue("web-content");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Assert - remote write completed, so the modal has already closed again
      expect(CoreAPI.hasWriteCapableReader).toHaveBeenCalled();
      expect(CoreAPI.write).toHaveBeenCalled();
      expect(useStatusStore.getState().writeOpen).toBe(false);
    });

    it("should NOT call remote writer API when not connected", async () => {
      // Arrange - NFC not available AND not connected
      usePreferencesStore.setState({ nfcAvailable: false });
      useStatusStore.setState({
        connected: false,
        connectionState: ConnectionState.DISCONNECTED,
      });

      renderHook(() => useWriteQueueProcessor());

      // Act
      act(() => {
        useStatusStore.getState().setWriteQueue("offline-content");
      });

      // The write is kept alive through the retry ladder (connection may
      // still be establishing) - run the finite retry ladder to exhaustion
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Assert - Should never call the API while disconnected (prevents
      // timeout on cold start), and surface an error once retries exhaust
      expect(CoreAPI.hasWriteCapableReader).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should show error when no write methods available", async () => {
      // Arrange - No NFC, connected but no remote writer
      usePreferencesStore.setState({ nfcAvailable: false });
      useStatusStore.setState({
        connected: true,
        connectionState: ConnectionState.CONNECTED,
      });
      vi.mocked(CoreAPI.hasWriteCapableReader).mockResolvedValue(false);

      renderHook(() => useWriteQueueProcessor());

      // Act
      act(() => {
        useStatusStore.getState().setWriteQueue("no-writer-content");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Assert
      expect(toast.error).toHaveBeenCalled();
      expect(useStatusStore.getState().writeOpen).toBe(false);
    });
  });

  describe("retry logic", () => {
    it("should keep a pending retry alive across re-renders", async () => {
      // Regression: the old implementation cleared the retry timer in the
      // effect cleanup on every render, permanently wedging the processor.
      vi.mocked(CoreAPI.hasWriteCapableReader)
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValue(true);

      usePreferencesStore.setState({ nfcAvailable: false });
      useStatusStore.setState({
        connected: true,
        connectionState: ConnectionState.CONNECTED,
      });

      const { rerender } = renderHook(() => useWriteQueueProcessor());

      act(() => {
        useStatusStore.getState().setWriteQueue("rerender-content");
      });

      // First attempt fails and schedules a retry
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const callsAfterFirstAttempt = vi.mocked(CoreAPI.hasWriteCapableReader)
        .mock.calls.length;

      // Unrelated re-renders while the retry is pending
      rerender();
      rerender();
      rerender();

      // The retry must still fire: the capability check runs again
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(
        vi.mocked(CoreAPI.hasWriteCapableReader).mock.calls.length,
      ).toBeGreaterThan(callsAfterFirstAttempt);
    });

    it("should retry when capability check fails", async () => {
      // Arrange - Make capability check fail then succeed
      // Note: hasWriteCapableReader may be called multiple times:
      // 1. By useWriteQueueProcessor's checkWriteCapabilityAndWrite (fails)
      // 2. On retry (succeeds)
      // 3. By useNfcWriter's determineWriteMethod when write() is called
      vi.mocked(CoreAPI.hasWriteCapableReader)
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValue(true);

      usePreferencesStore.setState({ nfcAvailable: false });
      useStatusStore.setState({
        connected: true,
        connectionState: ConnectionState.CONNECTED,
      });

      renderHook(() => useWriteQueueProcessor());

      // Act - Trigger write
      act(() => {
        useStatusStore.getState().setWriteQueue("retry-content");
      });

      // Process initial attempt (fails)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // First retry (succeeds)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      // Assert - Should have retried and eventually opened write modal
      expect(CoreAPI.hasWriteCapableReader).toHaveBeenCalled();
      expect(useStatusStore.getState().writeOpen).toBe(true);
    });

    it("should show error after max retries exhausted", async () => {
      // Arrange - Make capability check always fail
      vi.mocked(CoreAPI.hasWriteCapableReader).mockRejectedValue(
        new Error("Persistent network error"),
      );

      usePreferencesStore.setState({ nfcAvailable: false });
      useStatusStore.setState({
        connected: true,
        connectionState: ConnectionState.CONNECTED,
      });

      renderHook(() => useWriteQueueProcessor());

      // Act - Trigger write
      act(() => {
        useStatusStore.getState().setWriteQueue("max-retry-content");
      });

      // Process initial attempt + 10 retries (11 total * 500ms)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });

      // Assert - Should have attempted multiple times and show error
      expect(CoreAPI.hasWriteCapableReader).toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalled();
      // Write modal should NOT have opened since all attempts failed
      expect(useStatusStore.getState().writeOpen).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("should return reset function that can be called safely", () => {
      // Arrange
      const { result } = renderHook(() => useWriteQueueProcessor());

      // Act - Call reset (should not throw)
      act(() => {
        result.current.reset();
      });

      // Assert
      expect(result.current.reset).toBeInstanceOf(Function);
    });

    it("should allow processing new queue items after reset", async () => {
      // Arrange
      usePreferencesStore.setState({ nfcAvailable: true });
      const { result } = renderHook(() => useWriteQueueProcessor());

      // First write
      act(() => {
        useStatusStore.getState().setWriteQueue("first-content");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(useStatusStore.getState().writeOpen).toBe(true);

      // Reset the processor and clear state
      act(() => {
        result.current.reset();
        useStatusStore.getState().setWriteOpen(false);
      });

      // Second write should work
      act(() => {
        useStatusStore.getState().setWriteQueue("second-content");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Assert - Should have processed second write
      expect(useStatusStore.getState().writeOpen).toBe(true);
    });
  });

  describe("processing guard", () => {
    it("should not start new write while processing", async () => {
      // Arrange - Make the capability check hang to simulate slow processing
      let resolveCapability: (value: boolean) => void;
      vi.mocked(CoreAPI.hasWriteCapableReader).mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            resolveCapability = resolve;
          }),
      );
      usePreferencesStore.setState({ nfcAvailable: false });
      useStatusStore.setState({
        connected: true,
        connectionState: ConnectionState.CONNECTED,
      });

      renderHook(() => useWriteQueueProcessor());

      // Act - Start first write
      act(() => {
        useStatusStore.getState().setWriteQueue("first-content");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });

      const callsAfterFirst = vi.mocked(CoreAPI.hasWriteCapableReader).mock
        .calls.length;

      // Try to trigger another write while first is pending
      act(() => {
        useStatusStore.getState().setWriteQueue("second-content");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });

      // Assert - Should still only have first call (second blocked by isProcessing)
      expect(vi.mocked(CoreAPI.hasWriteCapableReader).mock.calls.length).toBe(
        callsAfterFirst,
      );

      // Cleanup - Complete the pending write
      await act(async () => {
        resolveCapability!(true);
        await vi.advanceTimersByTimeAsync(100);
      });
    });
  });
});
