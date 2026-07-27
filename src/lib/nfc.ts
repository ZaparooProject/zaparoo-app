import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import {
  Nfc,
  NfcTag,
  NfcTagScannedEvent,
  NfcUtils,
  RecordTypeDefinition,
  TypeNameFormat,
} from "@capawesome-team/capacitor-nfc";
import { logger } from "./logger";
import {
  NfcCancelledError,
  NfcSessionBusyError,
  NfcUnformattedTagError,
  NfcFormatError,
  NfcTransientError,
  isExpectedNfcError,
  wrapNfcError,
} from "./errors";

export enum Status {
  Success,
  Error,
  Cancelled,
}

export interface TagInfo {
  rawTag: NfcTag | null;
  tag: Tag | null;
}

export interface Result {
  status: Status;
  info: TagInfo;
}

export const sessionManager = {
  shouldRestart: false,
  setShouldRestart: (value: boolean) => {
    sessionManager.shouldRestart = value;
  },
  launchOnScan: true,
  setLaunchOnScan: (value: boolean) => {
    sessionManager.launchOnScan = value;
  },
  isScanning: false,
  setIsScanning: (value: boolean) => {
    sessionManager.isScanning = value;
  },
};

export interface Tag {
  uid: string;
  text: string;
}

const createNdefTextRecord = (text: string) => {
  const utils = new NfcUtils();
  const { record } = utils.createNdefTextRecord({ text });
  return record;
};

// iOS enforces its own ~60s scan sheet timeout; Android reader-mode sessions
// stay open indefinitely, so we bound them ourselves.
const ANDROID_SESSION_TIMEOUT_MS = 60000;

// Owner token for the currently active scan session. Prevents two callers from
// starting overlapping native sessions and stops one session's cleanup from
// clobbering another's isScanning state.
let activeSessionToken: symbol | null = null;

// Unwinds the active session with a cancellation. Set by withNfcSession so
// cancelSession() can deterministically release the session instead of relying
// on the native scanSessionCanceled event (not guaranteed on Android).
let activeSessionCancel: (() => void) | null = null;

/**
 * Test-only helper: clears the module-level session lock so an unfinished
 * session in one test cannot block sessions in the next.
 */
export function __resetNfcSessionState(): void {
  activeSessionToken = null;
  activeSessionCancel = null;
  sessionManager.setIsScanning(false);
}

/**
 * Wait for the active session (if any) to finish releasing its lock.
 * Polls on short timers rather than microtasks so native Capacitor callbacks
 * (listener removal, session teardown) get macrotask turns to complete.
 */
export async function waitForSessionRelease(
  timeoutMs = 2000,
): Promise<boolean> {
  const start = Date.now();
  while (activeSessionToken !== null) {
    if (Date.now() - start >= timeoutMs) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return true;
}

async function stopScanSessionSafely(): Promise<void> {
  try {
    await Nfc.stopScanSession();
  } catch (error) {
    logger.debug("Failed to stop NFC scan session:", error);
  }
}

/**
 * Helper function to manage NFC scan session lifecycle with proper listener cleanup.
 * This ensures all listeners are removed after the operation completes, preventing memory leaks.
 * Rejects with NfcSessionBusyError if another session is already active.
 */
async function withNfcSession<T>(
  handler: (event: NfcTagScannedEvent) => Promise<T>,
): Promise<T> {
  if (activeSessionToken !== null) {
    throw new NfcSessionBusyError();
  }
  const sessionToken = Symbol("nfcSession");
  activeSessionToken = sessionToken;

  return new Promise((resolve, reject) => {
    let listeners: PluginListenerHandle[] = [];
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const cleanup = async () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      // Remove listeners BEFORE releasing the session lock - a successor
      // session may start the moment the lock frees, and this session's
      // listeners must not still be attached when it does.
      await Promise.all(listeners.map((listener) => listener.remove()));
      listeners = [];
      if (activeSessionToken === sessionToken) {
        activeSessionToken = null;
        activeSessionCancel = null;
        sessionManager.setIsScanning(false);
      }
    };

    const handleSuccess = async (result: T) => {
      if (settled) return;
      settled = true;
      await cleanup();
      resolve(result);
    };

    const handleError = async (error: unknown) => {
      if (settled) return;
      settled = true;
      await cleanup();
      reject(error);
    };

    activeSessionCancel = () => {
      void handleError(new NfcCancelledError());
    };

    const setupAndStartScan = async () => {
      try {
        // Register all listeners and store their handles before starting the scan session.
        // This prevents a race condition where native events could fire before listener handles
        // are stored, which would cause cleanup() to fail and reintroduce the memory leak.
        const nfcTagScannedHandle = await Nfc.addListener(
          "nfcTagScanned",
          async (event) => {
            try {
              const result = await handler(event);
              await stopScanSessionSafely();
              await handleSuccess(result);
            } catch (error) {
              const wrappedError = wrapNfcError(error);
              if (isExpectedNfcError(wrappedError)) {
                logger.debug("Expected NFC operation failure:", wrappedError);
              } else {
                logger.error("NFC operation error:", wrappedError, {
                  category: "nfc",
                  action: "nfcTagScanned",
                  stack:
                    wrappedError instanceof Error
                      ? wrappedError.stack
                      : undefined,
                });
              }
              await stopScanSessionSafely();
              await handleError(wrappedError);
            }
          },
        );

        const scanCanceledHandle = await Nfc.addListener(
          "scanSessionCanceled",
          async () => {
            await stopScanSessionSafely();
            await handleError(new NfcCancelledError());
          },
        );

        const scanErrorHandle = await Nfc.addListener(
          "scanSessionError",
          async (err) => {
            const wrappedError = wrapNfcError(err);
            if (isExpectedNfcError(wrappedError)) {
              logger.debug("Expected NFC scan session failure:", wrappedError);
            } else {
              logger.error("NFC scan session error:", wrappedError, {
                category: "nfc",
                action: "scanSessionError",
                message: wrappedError.message,
                stack:
                  wrappedError instanceof Error
                    ? wrappedError.stack
                    : undefined,
              });
            }
            await stopScanSessionSafely();
            await handleError(wrappedError);
          },
        );

        // Store all listener handles for cleanup
        listeners.push(
          nfcTagScannedHandle,
          scanCanceledHandle,
          scanErrorHandle,
        );

        sessionManager.setIsScanning(true);
        // Now it's safe to start the scan session
        await Nfc.startScanSession();

        if (Capacitor.getPlatform() === "android") {
          timeoutId = setTimeout(() => {
            void stopScanSessionSafely();
            void handleError(
              new NfcCancelledError("NFC scan session timed out"),
            );
          }, ANDROID_SESSION_TIMEOUT_MS);
        }
      } catch (setupError) {
        const wrappedError = wrapNfcError(setupError);
        // If setup fails (e.g., NFC not enabled), clean up and reject
        settled = true;
        await cleanup();
        reject(wrappedError);
      }
    };

    setupAndStartScan();
  });
}

export function int2hex(v: number[]): string {
  let hexId = "";
  for (let i = 0; i < v.length; i++) {
    hexId += (v[i] ?? 0).toString(16).padStart(2, "0");
  }
  hexId = hexId.replace(/-/g, "");
  return hexId;
}

export function int2char(v: number[]): string {
  let charId = "";
  for (let i = 0; i < v.length; i++) {
    charId += String.fromCharCode(v[i] ?? 0);
  }
  return charId;
}

export function readNfcEvent(event: NfcTagScannedEvent): Tag | null {
  if (!event.nfcTag || !event.nfcTag.id) {
    return null;
  }

  let text = "";
  if (event.nfcTag.message && event.nfcTag.message.records.length > 0) {
    const ndef = event.nfcTag.message.records[0];

    if (ndef?.payload) {
      const utils = new NfcUtils();

      if (ndef.tnf === TypeNameFormat.WellKnown) {
        const { type: recordType } = utils.mapBytesToRecordTypeDefinition({
          bytes: ndef.type ?? [],
        });

        if (recordType === RecordTypeDefinition.Text) {
          text = utils.getTextFromNdefTextRecord({ record: ndef }).text ?? "";
        } else if (recordType === RecordTypeDefinition.Uri) {
          const { identifierCode } = utils.getIdentifierCodeFromNdefUriRecord({
            record: ndef,
          });
          const prefix =
            identifierCode === undefined
              ? ""
              : (utils.mapUriIdentifierCodeToString({ identifierCode })
                  ?.prefix ?? "");
          const { uri } = utils.getUriFromNdefUriRecord({ record: ndef });
          text = prefix + (uri ?? "");
        } else {
          text = int2char(ndef.payload);
        }
      } else {
        text = int2char(ndef.payload);
      }
    }
  }

  return { uid: int2hex(event.nfcTag.id), text: text };
}

export async function readTag(): Promise<Result> {
  try {
    return await withNfcSession<Result>(async (event) => {
      return {
        status: Status.Success,
        info: {
          rawTag: event.nfcTag,
          tag: readNfcEvent(event),
        },
      };
    });
  } catch (error) {
    // Handle cancellation as a successful result with Cancelled status
    if (error instanceof NfcCancelledError) {
      return {
        status: Status.Cancelled,
        info: {
          rawTag: null,
          tag: null,
        },
      };
    }
    throw error;
  }
}

/**
 * Checks if an error is related to NFC tag formatting failures.
 * Used to show user-friendly error messages in the UI.
 */
export function isFormatRelatedError(error: unknown): boolean {
  // Check typed error first
  if (
    error instanceof NfcFormatError ||
    error instanceof NfcUnformattedTagError
  ) {
    return true;
  }
  // Fallback for native plugin errors we haven't wrapped yet
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("unknown error") ||
    msg.includes("an unknown error has occurred") ||
    msg.includes("only one tagtechnology") ||
    msg.includes("format")
  );
}

export async function writeTag(text: string): Promise<Result> {
  const record = createNdefTextRecord(text);
  const maxFormatRetries = 3;
  const formatRetryDelayMs = 500;

  try {
    return await withNfcSession<Result>(async (event) => {
      try {
        await Nfc.write({ message: { records: [record] } });
        logger.log("write success");
      } catch (writeError) {
        const wrappedError = wrapNfcError(writeError);
        if (
          wrappedError instanceof NfcUnformattedTagError &&
          Capacitor.getPlatform() === "android"
        ) {
          logger.log("Tag not NDEF formatted, auto-formatting...");
          let lastFormatError: unknown = null;

          for (let attempt = 1; attempt <= maxFormatRetries; attempt++) {
            try {
              // Before retrying, try to close any stale TagTechnology connection.
              // This may help in some cases, though it's not guaranteed due to
              // a bug in the capacitor-nfc plugin where format() doesn't properly
              // clean up its internal NdefFormatable connection on failure.
              if (attempt > 1) {
                try {
                  await Nfc.close();
                } catch {
                  // Ignore close errors - connection may already be closed
                }
                await new Promise((resolve) =>
                  setTimeout(resolve, formatRetryDelayMs),
                );
              }

              await Nfc.format();
              await Nfc.write({ message: { records: [record] } });
              logger.log("Write after auto-format successful");
              return {
                status: Status.Success,
                info: {
                  rawTag: event.nfcTag,
                  tag: readNfcEvent(event),
                },
              };
            } catch (formatError) {
              const wrappedFormatError = wrapNfcError(formatError);
              lastFormatError = wrappedFormatError;
              logger.log(
                `Format attempt ${attempt} failed: ${wrappedFormatError.message}`,
              );
            }
          }

          // All retries exhausted - log technical error for debugging
          const wrappedFormatError = wrapNfcError(lastFormatError);
          if (wrappedFormatError instanceof NfcTransientError) {
            logger.debug(
              "Expected NFC format/write failure:",
              wrappedFormatError,
            );
          } else {
            logger.error(
              "NFC format/write failed after retries",
              wrappedFormatError,
              {
                category: "nfc",
                action: "writeTag",
                stack: wrappedFormatError.stack,
              },
            );
          }
          throw wrappedFormatError;
        }
        throw wrapNfcError(writeError);
      }
      return {
        status: Status.Success,
        info: {
          rawTag: event.nfcTag,
          tag: readNfcEvent(event),
        },
      };
    });
  } catch (error) {
    if (error instanceof NfcCancelledError) {
      return {
        status: Status.Cancelled,
        info: {
          rawTag: null,
          tag: null,
        },
      };
    }
    throw error;
  }
}

export async function formatTag(): Promise<Result> {
  try {
    return await withNfcSession<Result>(async (event) => {
      await Nfc.format();
      logger.log("format success");
      return {
        status: Status.Success,
        info: {
          rawTag: event.nfcTag,
          tag: readNfcEvent(event),
        },
      };
    });
  } catch (error) {
    if (error instanceof NfcCancelledError) {
      return {
        status: Status.Cancelled,
        info: {
          rawTag: null,
          tag: null,
        },
      };
    }
    throw error;
  }
}

export async function eraseTag(): Promise<Result> {
  try {
    return await withNfcSession<Result>(async (event) => {
      await Nfc.erase();
      logger.log("erase success");
      return {
        status: Status.Success,
        info: {
          rawTag: event.nfcTag,
          tag: readNfcEvent(event),
        },
      };
    });
  } catch (error) {
    if (error instanceof NfcCancelledError) {
      return {
        status: Status.Cancelled,
        info: {
          rawTag: null,
          tag: null,
        },
      };
    }
    throw error;
  }
}

export async function readRaw(): Promise<Result> {
  try {
    return await withNfcSession<Result>(async (event) => {
      logger.log("read raw success");
      return {
        status: Status.Success,
        info: {
          rawTag: event.nfcTag,
          tag: readNfcEvent(event),
        },
      };
    });
  } catch (error) {
    if (error instanceof NfcCancelledError) {
      return {
        status: Status.Cancelled,
        info: {
          rawTag: null,
          tag: null,
        },
      };
    }
    throw error;
  }
}

export async function makeReadOnly(): Promise<Result> {
  try {
    return await withNfcSession<Result>(async (event) => {
      await Nfc.makeReadOnly();
      logger.log("make read only success");
      return {
        status: Status.Success,
        info: {
          rawTag: event.nfcTag,
          tag: readNfcEvent(event),
        },
      };
    });
  } catch (error) {
    if (error instanceof NfcCancelledError) {
      return {
        status: Status.Cancelled,
        info: {
          rawTag: null,
          tag: null,
        },
      };
    }
    throw error;
  }
}

export async function cancelSession() {
  let supported = false;
  try {
    supported = (await Nfc.isSupported()).nfc;
  } catch (error) {
    // isSupported rejects on web / when the bridge is unavailable
    logger.debug("NFC support check failed during cancel:", error);
  }
  if (supported) {
    // Stop the native session first. On iOS this also fires the
    // scanSessionCanceled event; the explicit unwind below covers Android,
    // where stopping does not emit an event. Do NOT call removeAllListeners()
    // as it would globally remove ALL NFC listeners, breaking encapsulation
    // and potentially affecting other code.
    await stopScanSessionSafely();
  }
  // Deterministically unwind the active JS session even when native stopping
  // is unsupported or fails (no-op if none, and the settled guard makes a
  // duplicate native cancel event harmless).
  activeSessionCancel?.();
}
