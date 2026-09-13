/**
 * Unit tests for NFC operations
 *
 * Tests pure functions (int2hex, int2char) and sessionManager state.
 * NFC session operations are tested via mocked Capacitor plugin.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  mockTransceive,
  mockSetAlertMessage,
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
    // Rejects by default so write verification takes the "unverified skip"
    // path unless a test provides readable tag memory.
    mockTransceive: vi
      .fn()
      .mockRejectedValue(new Error("transceive not mocked")),
    mockSetAlertMessage: vi.fn().mockResolvedValue(undefined),
    mockClose: vi.fn().mockResolvedValue(undefined),
    mockIsSupported: vi.fn().mockResolvedValue({ nfc: true }),
    mockGetPlatform: vi.fn().mockReturnValue("android"),
  };
});

// Mock the NFC plugin — keep real NfcUtils, TypeNameFormat, RecordTypeDefinition
// (pure JS, no native code) and only replace the Nfc singleton.
vi.mock("@capawesome-team/capacitor-nfc", async () => {
  const actual = await vi.importActual<
    typeof import("@capawesome-team/capacitor-nfc")
  >("@capawesome-team/capacitor-nfc");

  return {
    ...actual,
    Nfc: {
      addListener: mockAddListener,
      startScanSession: mockStartScanSession,
      stopScanSession: mockStopScanSession,
      write: mockWrite,
      format: mockFormat,
      erase: mockErase,
      makeReadOnly: mockMakeReadOnly,
      connect: mockConnect,
      transceive: mockTransceive,
      setAlertMessage: mockSetAlertMessage,
      close: mockClose,
      isSupported: mockIsSupported,
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
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

import { NfcUtils } from "@capawesome-team/capacitor-nfc";
import { logger } from "../../../lib/logger";
import {
  NfcFormatError,
  NfcTransientError,
  NfcUnformattedTagError,
  NfcVerificationError,
} from "../../../lib/errors";
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
    vi.mocked(logger.debug).mockClear();
    vi.mocked(logger.error).mockClear();

    // Reset mocks to default resolved values (important for tests that override them)
    mockWrite.mockResolvedValue(undefined);
    mockFormat.mockResolvedValue(undefined);
    mockConnect.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
    mockTransceive
      .mockReset()
      .mockRejectedValue(new Error("transceive not mocked"));
    mockSetAlertMessage.mockClear();

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

    it.each(["success", "cancellation"] as const)(
      "should release the session when listener removal rejects after %s",
      async (outcome) => {
        const firstRead = readTag();

        await vi.waitFor(() => {
          expect(mockState.listenerHandles.length).toBe(3);
        });
        mockState.listenerHandles[0]!.remove.mockRejectedValueOnce(
          new Error("native listener removal failed"),
        );

        if (outcome === "success") {
          mockState.nfcTagScannedCallback?.({
            nfcTag: { id: [1, 2, 3, 4] },
          } as NfcTagScannedEvent);
        } else {
          mockState.scanSessionCanceledCallback?.();
        }

        await expect(firstRead).resolves.toMatchObject({
          status: outcome === "success" ? Status.Success : Status.Cancelled,
        });
        expect(sessionManager.isScanning).toBe(false);
        expect(logger.error).toHaveBeenCalledWith(
          "Failed to remove NFC session listener",
          expect.any(Error),
          expect.objectContaining({ action: "removeSessionListener" }),
        );

        const secondRead = readTag();
        await vi.waitFor(() => {
          expect(mockState.listenerHandles.length).toBe(6);
        });
        mockState.nfcTagScannedCallback?.({
          nfcTag: { id: [5, 6, 7, 8] },
        } as NfcTagScannedEvent);

        await expect(secondRead).resolves.toMatchObject({
          status: Status.Success,
        });
      },
    );

    it("should ignore stale callbacks when listener removal fails", async () => {
      const firstWrite = writeTag("old operation");

      await vi.waitFor(() => {
        expect(mockState.listenerHandles.length).toBe(3);
      });
      const staleTagCallback = mockState.nfcTagScannedCallback!;
      const staleCancelCallback = mockState.scanSessionCanceledCallback!;
      const staleErrorCallback = mockState.scanSessionErrorCallback!;
      for (const handle of mockState.listenerHandles) {
        handle.remove.mockRejectedValueOnce(
          new Error("native listener removal failed"),
        );
      }

      await cancelSession();
      await expect(firstWrite).resolves.toMatchObject({
        status: Status.Cancelled,
      });

      const stopCallsAfterCancellation = mockStopScanSession.mock.calls.length;
      const secondRead = readTag();
      await vi.waitFor(() => {
        expect(mockState.listenerHandles.length).toBe(6);
      });

      await staleTagCallback({
        nfcTag: { id: [1, 2, 3, 4] },
      } as NfcTagScannedEvent);
      await staleCancelCallback();
      await staleErrorCallback(new Error("stale native error"));

      expect(mockWrite).not.toHaveBeenCalled();
      expect(mockStopScanSession).toHaveBeenCalledTimes(
        stopCallsAfterCancellation,
      );

      mockState.nfcTagScannedCallback?.({
        nfcTag: { id: [5, 6, 7, 8] },
      } as NfcTagScannedEvent);
      await expect(secondRead).resolves.toMatchObject({
        status: Status.Success,
      });
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

    it("should not log expected scan session errors as errors", async () => {
      const readPromise = readTag();

      await vi.waitFor(() => {
        expect(mockState.scanSessionErrorCallback).not.toBeNull();
      });

      mockState.scanSessionErrorCallback?.(new Error("Tag was lost."));

      await expect(readPromise).rejects.toBeInstanceOf(NfcTransientError);
      expect(logger.debug).toHaveBeenCalledWith(
        "Expected NFC scan session failure:",
        expect.any(NfcTransientError),
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("should log unexpected scan session errors as errors", async () => {
      const readPromise = readTag();

      await vi.waitFor(() => {
        expect(mockState.scanSessionErrorCallback).not.toBeNull();
      });

      mockState.scanSessionErrorCallback?.(new Error("NFC hardware error"));

      await expect(readPromise).rejects.toThrow("NFC hardware error");
      expect(logger.error).toHaveBeenCalledWith(
        "NFC scan session error:",
        expect.any(Error),
        expect.objectContaining({
          category: "nfc",
          action: "scanSessionError",
        }),
      );
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

    it("should not log transient write errors as errors", async () => {
      mockWrite.mockRejectedValueOnce(new Error("Tag was lost."));

      const writePromise = writeTag("test content");

      await vi.waitFor(() => {
        expect(mockState.nfcTagScannedCallback).not.toBeNull();
      });

      mockState.nfcTagScannedCallback?.({
        nfcTag: { id: [1, 2, 3, 4] },
      } as NfcTagScannedEvent);

      await expect(writePromise).rejects.toBeInstanceOf(NfcTransientError);
      expect(logger.debug).toHaveBeenCalledWith(
        "Expected NFC operation failure:",
        expect.any(NfcTransientError),
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    describe("blank tag on Android", () => {
      const UNFORMATTED = "The NFC tag has not yet been formatted as NDEF.";
      const blankTag = {
        id: [1, 2, 3, 4],
        techTypes: ["NFC_A", "MIFARE_ULTRALIGHT", "NDEF_FORMATABLE"],
      };
      const formattedTag = {
        id: [1, 2, 3, 4],
        techTypes: ["NFC_A", "MIFARE_ULTRALIGHT", "NDEF"],
      };

      function scan(nfcTag: { id: number[]; techTypes?: string[] }) {
        mockState.nfcTagScannedCallback?.({ nfcTag } as NfcTagScannedEvent);
      }

      async function scanBlankTag() {
        await vi.waitFor(() => {
          expect(mockState.nfcTagScannedCallback).not.toBeNull();
        });
        scan(blankTag);
      }

      async function scanBlankTagAndWaitForFormat() {
        await scanBlankTag();
        await vi.waitFor(() => {
          expect(mockFormat).toHaveBeenCalled();
        });
      }

      it("should format once, prompt for a re-tap, and write to the re-tapped tag", async () => {
        mockWrite.mockRejectedValueOnce(new Error(UNFORMATTED));
        const onRetapRequired = vi.fn();

        const writePromise = writeTag("test content", { onRetapRequired });
        await scanBlankTagAndWaitForFormat();
        await vi.waitFor(() => {
          expect(onRetapRequired).toHaveBeenCalledTimes(1);
        });

        // Nothing is retried against the stale tag handle
        expect(mockWrite).toHaveBeenCalledTimes(1);

        scan(formattedTag);
        const result = await writePromise;

        expect(result.status).toBe(Status.Success);
        expect(result.info.rawTag).toEqual(formattedTag);
        expect(mockFormat).toHaveBeenCalledTimes(1);
        expect(mockWrite).toHaveBeenCalledTimes(2);
        expect(logger.error).not.toHaveBeenCalled();
      });

      it("should not miss a re-tap that arrives before the format call resolves", async () => {
        mockWrite.mockRejectedValueOnce(new Error(UNFORMATTED));
        let resolveFormat: () => void = () => {};
        mockFormat.mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              resolveFormat = resolve;
            }),
        );

        const writePromise = writeTag("test content");
        await scanBlankTagAndWaitForFormat();
        scan(formattedTag);
        resolveFormat();
        const result = await writePromise;

        expect(result.status).toBe(Status.Success);
        expect(mockWrite).toHaveBeenCalledTimes(2);
      });

      it("should report a failed format once at warning level without retrying", async () => {
        mockWrite.mockRejectedValue(new Error(UNFORMATTED));
        mockFormat.mockRejectedValue(new Error("Transceive failed"));
        const onRetapRequired = vi.fn();

        const writePromise = writeTag("test content", { onRetapRequired });
        await scanBlankTag();

        await expect(writePromise).rejects.toBeInstanceOf(NfcFormatError);
        await expect(writePromise).rejects.toThrow("Transceive failed");
        expect(mockFormat).toHaveBeenCalledTimes(1);
        expect(mockWrite).toHaveBeenCalledTimes(1);
        expect(mockClose).not.toHaveBeenCalled();
        expect(onRetapRequired).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(
          "NFC format before write failed",
          expect.any(Error),
          {
            category: "nfc",
            action: "formatBeforeWrite",
            severity: "warning",
            techTypes: blankTag.techTypes,
          },
        );
        expect(mockStopScanSession).toHaveBeenCalled();
        mockState.listenerHandles.forEach((handle) => {
          expect(handle.remove).toHaveBeenCalled();
        });
      });

      it("should not report a tag lost while formatting", async () => {
        mockWrite.mockRejectedValue(new Error(UNFORMATTED));
        mockFormat.mockRejectedValue(new Error("Tag was lost."));

        const writePromise = writeTag("test content");
        await scanBlankTag();

        await expect(writePromise).rejects.toBeInstanceOf(NfcFormatError);
        expect(mockFormat).toHaveBeenCalledTimes(1);
        expect(logger.error).not.toHaveBeenCalled();
      });

      it("should report once when the re-tapped tag is still unformatted", async () => {
        mockWrite.mockRejectedValue(new Error(UNFORMATTED));
        const onRetapRequired = vi.fn();

        const writePromise = writeTag("test content", { onRetapRequired });
        await scanBlankTagAndWaitForFormat();
        await vi.waitFor(() => {
          expect(onRetapRequired).toHaveBeenCalled();
        });
        scan(blankTag);

        await expect(writePromise).rejects.toBeInstanceOf(NfcFormatError);
        expect(mockFormat).toHaveBeenCalledTimes(1);
        expect(mockWrite).toHaveBeenCalledTimes(2);
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(
          "NFC tag still unformatted after format",
          expect.any(Error),
          expect.objectContaining({
            action: "formatBeforeWrite",
            severity: "warning",
            techTypes: blankTag.techTypes,
          }),
        );
      });

      it("should not format a different blank tag presented for the re-tap", async () => {
        mockWrite.mockRejectedValue(new Error(UNFORMATTED));
        const onRetapRequired = vi.fn();

        const writePromise = writeTag("test content", { onRetapRequired });
        await scanBlankTagAndWaitForFormat();
        await vi.waitFor(() => {
          expect(onRetapRequired).toHaveBeenCalled();
        });
        scan({ ...blankTag, id: [9, 9, 9, 9] });

        await expect(writePromise).rejects.toBeInstanceOf(
          NfcUnformattedTagError,
        );
        expect(mockFormat).toHaveBeenCalledTimes(1);
        expect(logger.error).not.toHaveBeenCalled();
      });

      it("should clean up when the session is cancelled while waiting for the re-tap", async () => {
        mockWrite.mockRejectedValueOnce(new Error(UNFORMATTED));
        const onRetapRequired = vi.fn();

        const writePromise = writeTag("test content", { onRetapRequired });
        await scanBlankTagAndWaitForFormat();
        await vi.waitFor(() => {
          expect(onRetapRequired).toHaveBeenCalled();
        });

        await cancelSession();
        const result = await writePromise;

        expect(result.status).toBe(Status.Cancelled);
        expect(mockStopScanSession).toHaveBeenCalled();
        mockState.listenerHandles.forEach((handle) => {
          expect(handle.remove).toHaveBeenCalled();
        });

        // A tap after cancelling no longer writes
        scan(formattedTag);
        expect(mockWrite).toHaveBeenCalledTimes(1);
        expect(logger.error).not.toHaveBeenCalled();

        // The session lock is released for the next operation
        const nextWrite = writeTag("next content");
        await vi.waitFor(() => {
          expect(mockStartScanSession).toHaveBeenCalledTimes(2);
        });
        scan(formattedTag);
        await expect(nextWrite).resolves.toMatchObject({
          status: Status.Success,
        });
      });
    });
  });

  describe("writeTag verification", () => {
    /**
     * Build Type 2 tag user memory containing the real NDEF text record
     * writeTag would produce, wrapped in an NDEF TLV, padded to full pages.
     */
    function t2Memory(text: string): number[] {
      const { record } = new NfcUtils().createNdefTextRecord({ text });
      const payload = record.payload ?? [];
      const ndef = [0xd1, 0x01, payload.length, 0x54, ...payload];
      const mem = [0x03, ndef.length, ...ndef, 0xfe];
      while (mem.length % 16 !== 0) {
        mem.push(0x00);
      }
      return mem;
    }

    /** Serve READ (0x30) commands from the given Type 2 memory image. */
    function mockTransceiveFromMemory(mem: number[]): void {
      mockTransceive
        .mockReset()
        .mockImplementation((options: { data: number[] }) => {
          const page = options.data[1] ?? 0;
          const start = (page - 4) * 4;
          const slice = mem.slice(start, start + 16);
          while (slice.length < 16) {
            slice.push(0x00);
          }
          return Promise.resolve({ response: slice });
        });
    }

    /** Fire the initial scan event that triggers the write handler. */
    async function fireInitialScan(uid: number[] = [1, 2, 3, 4]) {
      await vi.waitFor(() => {
        expect(mockState.nfcTagScannedCallback).not.toBeNull();
      });
      mockState.nfcTagScannedCallback?.({
        nfcTag: { id: uid },
      } as NfcTagScannedEvent);
    }

    describe("android", () => {
      it("should verify successfully when the tag contains the written text", async () => {
        mockTransceiveFromMemory(t2Memory("test content"));

        const writePromise = writeTag("test content");
        await fireInitialScan();
        const result = await writePromise;

        expect(result.status).toBe(Status.Success);
        expect(mockConnect).toHaveBeenCalledWith({ techType: "NFC_A" });
        expect(mockClose).toHaveBeenCalled();
      });

      it("should reject with NfcVerificationError when the tag text mismatches", async () => {
        mockTransceiveFromMemory(t2Memory("something else"));

        const writePromise = writeTag("test content");
        await fireInitialScan();

        await expect(writePromise).rejects.toBeInstanceOf(NfcVerificationError);
        expect(mockClose).toHaveBeenCalled();
      });

      it("should reject with NfcVerificationError when the tag has an empty NDEF message", async () => {
        mockTransceiveFromMemory([
          0x03, 0x00, 0xfe, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00,
        ]);

        const writePromise = writeTag("test content");
        await fireInitialScan();

        await expect(writePromise).rejects.toMatchObject({
          name: "NfcVerificationError",
          reason: "empty",
        });
        expect(mockClose).toHaveBeenCalled();
      });

      it("should reject with NfcVerificationError when the tag has no NDEF TLV", async () => {
        mockTransceiveFromMemory([
          0xfe, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00,
        ]);

        const writePromise = writeTag("test content");
        await fireInitialScan();

        await expect(writePromise).rejects.toMatchObject({
          name: "NfcVerificationError",
          reason: "no-ndef",
        });
      });

      it("should succeed unverified when connect fails", async () => {
        mockConnect.mockRejectedValue(new Error("Tech type not supported."));

        const writePromise = writeTag("test content");
        await fireInitialScan();
        const result = await writePromise;

        expect(result.status).toBe(Status.Success);
        expect(mockTransceive).not.toHaveBeenCalled();
      });

      it("should succeed unverified when the first read is unsupported", async () => {
        // Default mockTransceive rejects every call
        const writePromise = writeTag("test content");
        await fireInitialScan();
        const result = await writePromise;

        expect(result.status).toBe(Status.Success);
        expect(mockClose).toHaveBeenCalled();
      });

      it("should succeed unverified when the tag is lost mid-read", async () => {
        const mem = t2Memory("a".repeat(60));
        let calls = 0;
        mockTransceive.mockReset().mockImplementation(() => {
          calls++;
          if (calls > 1) {
            return Promise.reject(new Error("Tag was lost."));
          }
          return Promise.resolve({ response: mem.slice(0, 16) });
        });

        const writePromise = writeTag("a".repeat(60));
        await fireInitialScan();
        const result = await writePromise;

        expect(result.status).toBe(Status.Success);
        expect(mockClose).toHaveBeenCalled();
      });

      it("should not read past the maximum Type 2 page", async () => {
        mockTransceive.mockReset().mockImplementation(() => {
          const response = Array<number>(16).fill(0);
          if (mockTransceive.mock.calls.length === 1) {
            response.splice(0, 4, 0x03, 0xff, 0x04, 0x00);
          }
          return Promise.resolve({ response });
        });

        const writePromise = writeTag("test content");
        await fireInitialScan();
        const result = await writePromise;

        expect(result.status).toBe(Status.Success);
        expect(
          mockTransceive.mock.calls.every(
            ([options]) => (options as { data: number[] }).data[1]! <= 0xff,
          ),
        ).toBe(true);
      });

      /** Deliver the re-tap scan once the blank tag has been formatted. */
      async function fireRetapScan(uid: number[] = [1, 2, 3, 4]) {
        await vi.waitFor(() => {
          expect(mockFormat).toHaveBeenCalled();
        });
        mockState.nfcTagScannedCallback?.({
          nfcTag: { id: uid },
        } as NfcTagScannedEvent);
      }

      it("should verify the re-tapped tag after formatting a blank tag", async () => {
        mockWrite.mockRejectedValueOnce(
          new Error("The NFC tag has not yet been formatted as NDEF."),
        );
        mockTransceiveFromMemory(t2Memory("test content"));

        const writePromise = writeTag("test content");
        await fireInitialScan();
        await fireRetapScan();
        const result = await writePromise;

        expect(mockFormat).toHaveBeenCalledTimes(1);
        expect(mockConnect).toHaveBeenCalled();
        expect(result.status).toBe(Status.Success);
      });

      it("should reject after formatting when the re-tapped tag's read-back mismatches", async () => {
        mockWrite.mockRejectedValueOnce(
          new Error("The NFC tag has not yet been formatted as NDEF."),
        );
        mockTransceiveFromMemory(t2Memory("something else"));

        const writePromise = writeTag("test content");
        await fireInitialScan();
        await fireRetapScan();

        await expect(writePromise).rejects.toBeInstanceOf(NfcVerificationError);
        expect(mockFormat).toHaveBeenCalledTimes(1);
      });
    });

    describe("ios", () => {
      const IOS_OPTIONS = {
        verifyTimeoutMs: 300,
        ios: {
          verifyingMessage: "verifying",
          verifyFailedMessage: "did not save",
        },
      };
      let setTimeoutSpy: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
        setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
      });

      afterEach(() => {
        setTimeoutSpy.mockRestore();
      });

      /** Build a scan event carrying the real NDEF record for the text. */
      function textTagEvent(uid: number[], text: string): NfcTagScannedEvent {
        const { record } = new NfcUtils().createNdefTextRecord({ text });
        return {
          nfcTag: { id: uid, message: { records: [record] } },
        } as NfcTagScannedEvent;
      }

      /**
       * Wait until the write happened and the verifier is waiting on the next
       * scan event, then deliver it.
       */
      async function fireVerificationScan(
        event: NfcTagScannedEvent,
        timeoutMs = IOS_OPTIONS.verifyTimeoutMs,
      ) {
        await vi.waitFor(() => {
          expect(mockWrite).toHaveBeenCalled();
          expect(mockSetAlertMessage).toHaveBeenCalled();
          expect(
            setTimeoutSpy.mock.calls.some(
              (call: unknown[]) => call[1] === timeoutMs,
            ),
          ).toBe(true);
        });
        mockState.nfcTagScannedCallback?.(event);
      }

      beforeEach(() => {
        mockGetPlatform.mockReturnValue("ios");
      });

      it("should verify against a matching re-scan of the same tag", async () => {
        const writePromise = writeTag("test content", IOS_OPTIONS);
        await fireInitialScan([1, 2, 3, 4]);
        await fireVerificationScan(textTagEvent([1, 2, 3, 4], "test content"));
        const result = await writePromise;

        expect(result.status).toBe(Status.Success);
        expect(result.info.tag?.text).toBe("test content");
        expect(mockSetAlertMessage).toHaveBeenCalledWith({
          message: "verifying",
        });
        expect(mockStopScanSession).toHaveBeenCalledWith();
        expect(mockConnect).not.toHaveBeenCalled();
      });

      it("should reject and stop the session with an error message on mismatch", async () => {
        const writePromise = writeTag("test content", IOS_OPTIONS);
        await fireInitialScan([1, 2, 3, 4]);
        await fireVerificationScan(textTagEvent([1, 2, 3, 4], "other text"));

        await expect(writePromise).rejects.toBeInstanceOf(NfcVerificationError);
        expect(mockStopScanSession).toHaveBeenCalledWith({
          errorMessage: "did not save",
        });
      });

      it("should reject when the re-scan shows zero NDEF records", async () => {
        const writePromise = writeTag("test content", IOS_OPTIONS);
        await fireInitialScan([1, 2, 3, 4]);
        await fireVerificationScan({
          nfcTag: { id: [1, 2, 3, 4], message: { records: [] } },
        } as unknown as NfcTagScannedEvent);

        await expect(writePromise).rejects.toMatchObject({
          name: "NfcVerificationError",
          reason: "empty",
        });
      });

      it("should succeed unverified when no re-scan arrives before the timeout", async () => {
        const writePromise = writeTag("test content", {
          ...IOS_OPTIONS,
          verifyTimeoutMs: 50,
        });
        await fireInitialScan([1, 2, 3, 4]);
        const result = await writePromise;

        expect(result.status).toBe(Status.Success);
      });

      it("should ignore a different tag and succeed unverified on timeout", async () => {
        const writePromise = writeTag("test content", {
          ...IOS_OPTIONS,
          verifyTimeoutMs: 150,
        });
        await fireInitialScan([1, 2, 3, 4]);
        await fireVerificationScan(
          textTagEvent([9, 9, 9, 9], "test content"),
          150,
        );
        const result = await writePromise;

        expect(result.status).toBe(Status.Success);
      });

      it("should resolve as Cancelled when the session is canceled during verification", async () => {
        const writePromise = writeTag("test content", IOS_OPTIONS);
        await fireInitialScan([1, 2, 3, 4]);
        await vi.waitFor(() => {
          expect(mockWrite).toHaveBeenCalled();
        });

        mockState.scanSessionCanceledCallback?.();
        const result = await writePromise;

        expect(result.status).toBe(Status.Cancelled);
        mockState.listenerHandles.forEach((handle) => {
          expect(handle.remove).toHaveBeenCalled();
        });
      });

      it("should not re-run the write handler when polling re-fires the same tag", async () => {
        const writePromise = writeTag("test content", IOS_OPTIONS);
        await fireInitialScan([1, 2, 3, 4]);
        await fireVerificationScan(textTagEvent([1, 2, 3, 4], "test content"));
        await writePromise;

        expect(mockWrite).toHaveBeenCalledTimes(1);
      });
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
                tnf: 1, // TypeNameFormat.WellKnown
                type: [0x54], // 'T' = text record
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

    it("should decode NDEF URI record with https:// identifier code", async () => {
      const readPromise = readTag();

      await vi.waitFor(() => {
        expect(mockState.nfcTagScannedCallback).not.toBeNull();
      });

      const enc = new TextEncoder();
      const uriBytes = Array.from(enc.encode("zpr.au/xyz"));

      mockState.nfcTagScannedCallback?.({
        nfcTag: {
          id: [170, 187, 204, 221],
          message: {
            records: [
              {
                tnf: 1, // TypeNameFormat.WellKnown
                type: [0x55], // 'U' = URI record
                payload: [0x04, ...uriBytes], // 0x04 = https://
              },
            ],
          },
        },
      } as unknown as NfcTagScannedEvent);

      const result = await readPromise;

      expect(result.info.tag?.text).toBe("https://zpr.au/xyz");
      expect(result.info.tag?.uid).toBe("aabbccdd");
    });
  });
});
