/**
 * Unit tests for NFC operations
 *
 * Tests pure functions (int2hex, int2char) and sessionManager state.
 * NFC session operations are tested via mocked Capacitor plugin.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NfcTagScannedEvent } from "@capawesome-team/capacitor-nfc";

// Track listener callbacks and handles for each test
interface MockListenerHandle {
  remove: ReturnType<typeof vi.fn>;
}

interface MockNfcState {
  nfcTagScannedCallback: ((event: NfcTagScannedEvent) => void) | null;
  scanSessionCanceledCallback: (() => void) | null;
  scanSessionErrorCallback: ((error: Error) => void) | null;
  listenerHandles: Array<MockListenerHandle>;
}

// Use vi.hoisted to ensure these are available when mocks are initialized
const {
  mockState,
  mockAddListener,
  mockStartScanSession,
  mockStopScanSession,
  mockWrite,
  mockFormat,
  mockErase,
  mockMakeReadOnly,
  mockConnect,
  mockClose,
  mockIsSupported,
  mockGetPlatform,
} = vi.hoisted(() => {
  const state: MockNfcState = {
    nfcTagScannedCallback: null,
    scanSessionCanceledCallback: null,
    scanSessionErrorCallback: null,
    listenerHandles: [],
  };

  return {
    mockState: state,
    mockAddListener: vi.fn(
      (eventName: string, callback: (...args: unknown[]) => void) => {
        const handle = {
          remove: vi.fn().mockResolvedValue(undefined),
        };
        state.listenerHandles.push(
          handle as MockNfcState["listenerHandles"][number],
        );

        if (eventName === "nfcTagScanned") {
          state.nfcTagScannedCallback =
            callback as MockNfcState["nfcTagScannedCallback"];
        } else if (eventName === "scanSessionCanceled") {
          state.scanSessionCanceledCallback =
            callback as MockNfcState["scanSessionCanceledCallback"];
        } else if (eventName === "scanSessionError") {
          state.scanSessionErrorCallback =
            callback as MockNfcState["scanSessionErrorCallback"];
        }

        return Promise.resolve(handle);
      },
    ),
    mockStartScanSession: vi.fn().mockResolvedValue(undefined),
    mockStopScanSession: vi.fn().mockResolvedValue(undefined),
    mockWrite: vi.fn().mockResolvedValue(undefined),
    mockFormat: vi.fn().mockResolvedValue(undefined),
    mockErase: vi.fn().mockResolvedValue(undefined),
    mockMakeReadOnly: vi.fn().mockResolvedValue(undefined),
    mockConnect: vi.fn().mockResolvedValue(undefined),
    mockClose: vi.fn().mockResolvedValue(undefined),
    mockIsSupported: vi.fn().mockResolvedValue({ nfc: true }),
    mockGetPlatform: vi.fn().mockReturnValue("android"),
  };
});

// Mock the NFC plugin
vi.mock("@capawesome-team/capacitor-nfc", () => {
  // Create a persistent mock for NfcUtils that can be instantiated
  class MockNfcUtils {
    createNdefTextRecord() {
      return { record: { payload: [] } };
    }
  }

  return {
    Nfc: {
      addListener: mockAddListener,
      startScanSession: mockStartScanSession,
      stopScanSession: mockStopScanSession,
      write: mockWrite,
      format: mockFormat,
      erase: mockErase,
      makeReadOnly: mockMakeReadOnly,
      connect: mockConnect,
      close: mockClose,
      isSupported: mockIsSupported,
    },
    NfcUtils: MockNfcUtils,
    NfcTagTechType: {
      NdefFormatable: "NDEF_FORMATABLE",
    },
  };
});

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: mockGetPlatform,
  },
}));

vi.mock("../../../lib/logger", () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  int2hex,
  int2char,
  readTag,
  writeTag,
  formatTag,
  eraseTag,
  readRaw,
  makeReadOnly,
  cancelSession,
  sessionManager,
  Status,
} from "../../../lib/nfc";

describe("nfc", () => {
  beforeEach(() => {
    // Reset mock state
    mockState.nfcTagScannedCallback = null;
    mockState.scanSessionCanceledCallback = null;
    mockState.scanSessionErrorCallback = null;
    mockState.listenerHandles = [];

    // Clear mock call history
    mockAddListener.mockClear();
    mockStartScanSession.mockClear();
    mockStopScanSession.mockClear();
    mockWrite.mockClear();
    mockFormat.mockClear();
    mockErase.mockClear();
    mockMakeReadOnly.mockClear();
    mockConnect.mockClear();
    mockClose.mockClear();
    mockIsSupported.mockClear();
    mockGetPlatform.mockClear();

    // Reset mocks to default resolved values (important for tests that override them)
    mockWrite.mockResolvedValue(undefined);
    mockFormat.mockResolvedValue(undefined);
    mockConnect.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);

    // Reset default platform to Android
    mockGetPlatform.mockReturnValue("android");

    // Reset sessionManager state to test defaults
    sessionManager.setShouldRestart(false);
    // Reset to true (default) - Pro check happens at launch time
    sessionManager.setLaunchOnScan(true);
  });

  describe("int2hex", () => {
    it("should convert empty array to empty string", () => {
      expect(int2hex([])).toBe("");
    });

    it("should convert single byte to hex", () => {
      expect(int2hex([255])).toBe("ff");
      expect(int2hex([0])).toBe("00");
      expect(int2hex([16])).toBe("10");
    });

    it("should convert multiple bytes to hex string", () => {
      expect(int2hex([1, 2, 3, 4])).toBe("01020304");
      expect(int2hex([170, 187, 204, 221])).toBe("aabbccdd");
    });

    it("should pad single digit hex values with leading zero", () => {
      expect(int2hex([1])).toBe("01");
      expect(int2hex([15])).toBe("0f");
    });

    it("should handle undefined values in array as 0", () => {
      const arr: (number | undefined)[] = [1, 2];
      arr[5] = 3;
      // The function handles sparse arrays by using nullish coalescing
      expect(int2hex(arr as number[])).toContain("01");
      expect(int2hex(arr as number[])).toContain("02");
    });
  });

  describe("int2char", () => {
    it("should convert empty array to empty string", () => {
      expect(int2char([])).toBe("");
    });

    it("should convert ASCII values to characters", () => {
      expect(int2char([72, 101, 108, 108, 111])).toBe("Hello");
    });

    it("should handle single character", () => {
      expect(int2char([65])).toBe("A");
    });

    it("should handle null bytes", () => {
      expect(int2char([0])).toBe("\0");
    });
  });

  describe("sessionManager", () => {
    it("should have default values", () => {
      expect(sessionManager.shouldRestart).toBe(false);
      // launchOnScan defaults to true - Pro check happens at launch time
      expect(sessionManager.launchOnScan).toBe(true);
    });

    it("should update shouldRestart", () => {
      sessionManager.setShouldRestart(true);
      expect(sessionManager.shouldRestart).toBe(true);
    });

    it("should update launchOnScan", () => {
      sessionManager.setLaunchOnScan(false);
      expect(sessionManager.launchOnScan).toBe(false);
    });
  });

  describe("readTag", () => {
    it("should register all three listeners before starting scan", async () => {
      const readPromise = readTag();

      // Wait for listeners to be registered
      await vi.waitFor(() => {
        expect(mockAddListener).toHaveBeenCalledTimes(3);
      });

      expect(mockAddListener).toHaveBeenCalledWith(
        "nfcTagScanned",
        expect.any(Function),
      );
      expect(mockAddListener).toHaveBeenCalledWith(
        "scanSessionCanceled",
        expect.any(Function),
      );
      expect(mockAddListener).toHaveBeenCalledWith(
        "scanSessionError",
        expect.any(Function),
      );

      // Simulate successful scan to complete the promise
      mockState.nfcTagScannedCallback?.({
        nfcTag: { id: [1, 2, 3, 4] },
      } as NfcTagScannedEvent);

      await readPromise;
    });

    it("should start scan session after registering listeners", async () => {
      const readPromise = readTag();

      await vi.waitFor(() => {
        expect(mockStartScanSession).toHaveBeenCalled();
      });

      // Complete the scan
      mockState.nfcTagScannedCallback?.({
        nfcTag: { id: [1, 2, 3, 4] },
      } as NfcTagScannedEvent);

      await readPromise;
    });

    it("should return Success status on successful scan", async () => {
      const readPromise = readTag();

      await vi.waitFor(() => {
        expect(mockState.nfcTagScannedCallback).not.toBeNull();
      });

      mockState.nfcTagScannedCallback?.({
        nfcTag: {
          id: [1, 2, 3, 4],
          message: {
            records: [
              {
                payload: [2, 101, 110, 72, 101, 108, 108, 111], // "en" prefix + "Hello"
              },
            ],
          },
        },
      } as unknown as NfcTagScannedEvent);

      const result = await readPromise;

      expect(result.status).toBe(Status.Success);
      expect(result.info.tag?.uid).toBe("01020304");
    });

    it("should cleanup listeners on successful scan", async () => {
      const readPromise = readTag();

      // Wait for all 3 listeners to be registered
      await vi.waitFor(() => {
        expect(mockState.listenerHandles.length).toBe(3);
      });

      // Capture handles before triggering callback (cleanup will run after)
      const handles = [...mockState.listenerHandles];

      mockState.nfcTagScannedCallback?.({
        nfcTag: { id: [1, 2, 3, 4] },
      } as NfcTagScannedEvent);

      await readPromise;

      // The cleanup happens during the callback, before resolve
      // Check that all listener handles had remove() called
      for (const handle of handles) {
        expect(handle.remove).toHaveBeenCalled();
      }
    });

    it("should return Cancelled status when scan is cancelled", async () => {
      const readPromise = readTag();

      await vi.waitFor(() => {
        expect(mockState.scanSessionCanceledCallback).not.toBeNull();
      });

      mockState.scanSessionCanceledCallback?.();

      const result = await readPromise;

      expect(result.status).toBe(Status.Cancelled);
      expect(result.info.tag).toBeNull();
    });

    it("should cleanup listeners on cancellation", async () => {
      const readPromise = readTag();

      await vi.waitFor(() => {
        expect(mockState.scanSessionCanceledCallback).not.toBeNull();
      });

      mockState.scanSessionCanceledCallback?.();

      await readPromise;

      mockState.listenerHandles.forEach((handle) => {
        expect(handle.remove).toHaveBeenCalled();
      });
    });

    it("should cleanup listeners on error", async () => {
      const readPromise = readTag();

      await vi.waitFor(() => {
        expect(mockState.scanSessionErrorCallback).not.toBeNull();
      });

      // Trigger error - but catch the rejection since we need to verify cleanup
      mockState.scanSessionErrorCallback?.(new Error("NFC error"));

      // The promise should reject, but we need to handle it
      await expect(readPromise).rejects.toThrow("NFC error");

      mockState.listenerHandles.forEach((handle) => {
        expect(handle.remove).toHaveBeenCalled();
      });
    });

    it("should stop scan session on successful scan", async () => {
      const readPromise = readTag();

      await vi.waitFor(() => {
        expect(mockState.nfcTagScannedCallback).not.toBeNull();
      });

      mockState.nfcTagScannedCallback?.({
        nfcTag: { id: [1, 2, 3, 4] },
      } as NfcTagScannedEvent);

      await readPromise;

      expect(mockStopScanSession).toHaveBeenCalled();
    });
  });

  describe("writeTag", () => {
    it("should call Nfc.write with the provided text", async () => {
      const writePromise = writeTag("test content");

      await vi.waitFor(() => {
        expect(mockState.nfcTagScannedCallback).not.toBeNull();
      });

      mockState.nfcTagScannedCallback?.({
        nfcTag: { id: [1, 2, 3, 4] },
      } as NfcTagScannedEvent);

      await writePromise;

      expect(mockWrite).toHaveBeenCalledWith({
        message: { records: [expect.any(Object)] },
      });
    });

    it("should return Success status on successful write", async () => {
      const writePromise = writeTag("test content");

      await vi.waitFor(() => {
        expect(mockState.nfcTagScannedCallback).not.toBeNull();
      });

      mockState.nfcTagScannedCallback?.({
        nfcTag: { id: [1, 2, 3, 4] },
      } as NfcTagScannedEvent);

      const result = await writePromise;

      expect(result.status).toBe(Status.Success);
    });

    it("should cleanup listeners after write", async () => {
      const writePromise = writeTag("test content");

      await vi.waitFor(() => {
        expect(mockState.nfcTagScannedCallback).not.toBeNull();
      });

      mockState.nfcTagScannedCallback?.({
        nfcTag: { id: [1, 2, 3, 4] },
      } as NfcTagScannedEvent);

      await writePromise;

      mockState.listenerHandles.forEach((handle) => {
        expect(handle.remove).toHaveBeenCalled();
      });
    });

    it("should auto-format unformatted tag on Android and retry write", async () => {
      mockWrite.mockRejectedValueOnce(
        new Error("The NFC tag has not yet been formatted as NDEF."),
      );

      const writePromise = writeTag("test content");

      await vi.waitFor(() => {
        expect(mockState.nfcTagScannedCallback).not.toBeNull();
      });

      mockState.nfcTagScannedCallback?.({
        nfcTag: { id: [1, 2, 3, 4] },
      } as NfcTagScannedEvent);

      const result = await writePromise;

      expect(mockFormat).toHaveBeenCalled();
      expect(mockWrite).toHaveBeenCalledTimes(2);
      expect(result.status).toBe(Status.Success);
    });

    it("should not auto-format on iOS", async () => {
      mockGetPlatform.mockReturnValue("ios");
      mockWrite.mockRejectedValueOnce(
        new Error("The NFC tag has not yet been formatted as NDEF."),
      );

      const writePromise = writeTag("test content");

      await vi.waitFor(() => {
        expect(mockState.nfcTagScannedCallback).not.toBeNull();
      });

      mockState.nfcTagScannedCallback?.({
        nfcTag: { id: [1, 2, 3, 4] },
      } as NfcTagScannedEvent);

      await expect(writePromise).rejects.toThrow(
        "The NFC tag has not yet been formatted as NDEF.",
      );
      expect(mockFormat).not.toHaveBeenCalled();
    });

    it("should propagate non-formatting errors", async () => {
      mockWrite.mockRejectedValueOnce(new Error("Tag is read-only"));

      const writePromise = writeTag("test content");

      await vi.waitFor(() => {
        expect(mockState.nfcTagScannedCallback).not.toBeNull();
      });

      mockState.nfcTagScannedCallback?.({
        nfcTag: { id: [1, 2, 3, 4] },
      } as NfcTagScannedEvent);

      await expect(writePromise).rejects.toThrow("Tag is read-only");
      expect(mockFormat).not.toHaveBeenCalled();
    });

    it("should propagate format errors after retries exhausted", async () => {
      mockWrite.mockRejectedValue(
        new Error("The NFC tag has not yet been formatted as NDEF."),
      );
      // Reject all 3 retry attempts
      mockFormat.mockRejectedValue(new Error("Format failed"));

      const writePromise = writeTag("test content");

      await vi.waitFor(() => {
        expect(mockState.nfcTagScannedCallback).not.toBeNull();
      });

      mockState.nfcTagScannedCallback?.({
        nfcTag: { id: [1, 2, 3, 4] },
      } as NfcTagScannedEvent);

      await expect(writePromise).rejects.toThrow("Format failed");
      // Verify all 3 retries were attempted
      expect(mockFormat).toHaveBeenCalledTimes(3);
    });

    it("should retry on unknown error during format and succeed", async () => {
      // Initial write fails with unformatted error, triggering auto-format
      mockWrite
        .mockRejectedValueOnce(
          new Error("The NFC tag has not yet been formatted as NDEF."),
        )
        .mockResolvedValueOnce(undefined); // Write succeeds after second format attempt
      // First format attempt fails with "unknown error", second succeeds
      mockFormat
        .mockRejectedValueOnce(new Error("An unknown error has occurred."))
        .mockResolvedValueOnce(undefined);

      const writePromise = writeTag("test content");

      await vi.waitFor(() => {
        expect(mockState.nfcTagScannedCallback).not.toBeNull();
      });

      mockState.nfcTagScannedCallback?.({
        nfcTag: { id: [1, 2, 3, 4] },
      } as NfcTagScannedEvent);

      const result = await writePromise;

      expect(mockFormat).toHaveBeenCalledTimes(2);
      // Write is called: once initially (fails), then once after successful format
      expect(mockWrite).toHaveBeenCalledTimes(2);
      expect(result.status).toBe(Status.Success);
    });

    it("should call Nfc.close() before retrying format to release stale connection", async () => {
      // Initial write fails with unformatted error
      mockWrite
        .mockRejectedValueOnce(
          new Error("The NFC tag has not yet been formatted as NDEF."),
        )
        .mockResolvedValueOnce(undefined); // Write succeeds after second format attempt
      // First format attempt fails with TagTechnology error, second succeeds
      mockFormat
        .mockRejectedValueOnce(
          new Error("Only one TagTechnology can be connected at a time."),
        )
        .mockResolvedValueOnce(undefined);

      const writePromise = writeTag("test content");

      await vi.waitFor(() => {
        expect(mockState.nfcTagScannedCallback).not.toBeNull();
      });

      mockState.nfcTagScannedCallback?.({
        nfcTag: { id: [1, 2, 3, 4] },
      } as NfcTagScannedEvent);

      const result = await writePromise;

      // Nfc.close() is called before the second attempt
      expect(mockClose).toHaveBeenCalledTimes(1);
      expect(mockFormat).toHaveBeenCalledTimes(2);
      expect(result.status).toBe(Status.Success);
    });
  });

  describe("formatTag", () => {
    it("should call Nfc.format", async () => {
      const formatPromise = formatTag();

      await vi.waitFor(() => {
        expect(mockState.nfcTagScannedCallback).not.toBeNull();
      });

      mockState.nfcTagScannedCallback?.({
        nfcTag: { id: [1, 2, 3, 4] },
      } as NfcTagScannedEvent);

      await formatPromise;

      expect(mockFormat).toHaveBeenCalled();
    });

    it("should return Cancelled on cancellation", async () => {
      const formatPromise = formatTag();

      await vi.waitFor(() => {
        expect(mockState.scanSessionCanceledCallback).not.toBeNull();
      });

      mockState.scanSessionCanceledCallback?.();

      const result = await formatPromise;

      expect(result.status).toBe(Status.Cancelled);
    });
  });

  describe("eraseTag", () => {
    it("should call Nfc.erase", async () => {
      const erasePromise = eraseTag();

      await vi.waitFor(() => {
        expect(mockState.nfcTagScannedCallback).not.toBeNull();
      });

      mockState.nfcTagScannedCallback?.({
        nfcTag: { id: [1, 2, 3, 4] },
      } as NfcTagScannedEvent);

      await erasePromise;

      expect(mockErase).toHaveBeenCalled();
    });
  });

  describe("readRaw", () => {
    it("should return raw tag data without writing", async () => {
      const readPromise = readRaw();

      await vi.waitFor(() => {
        expect(mockState.nfcTagScannedCallback).not.toBeNull();
      });

      mockState.nfcTagScannedCallback?.({
        nfcTag: { id: [1, 2, 3, 4] },
      } as NfcTagScannedEvent);

      const result = await readPromise;

      expect(result.status).toBe(Status.Success);
      expect(mockWrite).not.toHaveBeenCalled();
      expect(mockFormat).not.toHaveBeenCalled();
      expect(mockErase).not.toHaveBeenCalled();
    });
  });

  describe("makeReadOnly", () => {
    it("should call Nfc.makeReadOnly", async () => {
      const promise = makeReadOnly();

      await vi.waitFor(() => {
        expect(mockState.nfcTagScannedCallback).not.toBeNull();
      });

      mockState.nfcTagScannedCallback?.({
        nfcTag: { id: [1, 2, 3, 4] },
      } as NfcTagScannedEvent);

      await promise;

      expect(mockMakeReadOnly).toHaveBeenCalled();
    });
  });

  describe("cancelSession", () => {
    it("should stop scan session when NFC is supported", async () => {
      mockIsSupported.mockResolvedValue({ nfc: true });

      await cancelSession();

      expect(mockStopScanSession).toHaveBeenCalled();
    });

    it("should not stop scan session when NFC is not supported", async () => {
      mockIsSupported.mockResolvedValue({ nfc: false });

      await cancelSession();

      expect(mockStopScanSession).not.toHaveBeenCalled();
    });
  });

  describe("NDEF text parsing", () => {
    it("should parse NDEF text record with language prefix", async () => {
      const readPromise = readTag();

      await vi.waitFor(() => {
        expect(mockState.nfcTagScannedCallback).not.toBeNull();
      });

      // NDEF text record: status byte (2) + "en" language code + "Hello"
      mockState.nfcTagScannedCallback?.({
        nfcTag: {
          id: [170, 187, 204, 221],
          message: {
            records: [
              {
                payload: [2, 101, 110, 72, 101, 108, 108, 111], // 2 + "en" + "Hello"
              },
            ],
          },
        },
      } as unknown as NfcTagScannedEvent);

      const result = await readPromise;

      expect(result.info.tag?.text).toBe("Hello");
      expect(result.info.tag?.uid).toBe("aabbccdd");
    });

    it("should handle tag with no message", async () => {
      const readPromise = readTag();

      await vi.waitFor(() => {
        expect(mockState.nfcTagScannedCallback).not.toBeNull();
      });

      mockState.nfcTagScannedCallback?.({
        nfcTag: {
          id: [1, 2, 3, 4],
        },
      } as NfcTagScannedEvent);

      const result = await readPromise;

      expect(result.info.tag?.text).toBe("");
    });

    it("should handle tag with empty records", async () => {
      const readPromise = readTag();

      await vi.waitFor(() => {
        expect(mockState.nfcTagScannedCallback).not.toBeNull();
      });

      mockState.nfcTagScannedCallback?.({
        nfcTag: {
          id: [1, 2, 3, 4],
          message: { records: [] },
        },
      } as unknown as NfcTagScannedEvent);

      const result = await readPromise;

      expect(result.info.tag?.text).toBe("");
    });

    it("should return null tag info when nfcTag.id is missing", async () => {
      const readPromise = readTag();

      await vi.waitFor(() => {
        expect(mockState.nfcTagScannedCallback).not.toBeNull();
      });

      mockState.nfcTagScannedCallback?.({
        nfcTag: {},
      } as NfcTagScannedEvent);

      const result = await readPromise;

      expect(result.info.tag).toBeNull();
    });
  });
});
