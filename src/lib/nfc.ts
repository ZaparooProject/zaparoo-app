import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import {
  Nfc,
  NfcTag,
  NfcTagScannedEvent,
  NfcTagTechType,
  NfcUtils,
} from "@capawesome-team/capacitor-nfc";
import { logger } from "./logger";
import {
  NfcCancelledError,
  NfcSessionBusyError,
  NfcUnformattedTagError,
  NfcFormatError,
  NfcTransientError,
  NfcVerificationError,
  isExpectedNfcError,
  wrapNfcError,
} from "./errors";
import {
  decodeNdefRecordText,
  extractNdefFromType2Tlv,
  int2hex,
  parseFirstNdefRecord,
  verifyNdefTextMatches,
} from "./ndef";

export { int2char, int2hex } from "./ndef";

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
 * Session context handed to withNfcSession handlers so multi-read operations
 * (e.g. post-write verification) can consume further tag events from the same
 * native session.
 */
interface NfcSessionContext {
  /**
   * Resolve with the next nfcTagScanned event arriving AFTER this call, or
   * null on timeout or session teardown. Events are not buffered.
   */
  waitForNextTag(timeoutMs: number): Promise<NfcTagScannedEvent | null>;
}

interface WithNfcSessionOptions {
  /**
   * When the handler rejects, a returned message stops the iOS scan sheet
   * with that error text instead of dismissing it silently.
   */
  iosErrorMessageFor?: (error: unknown) => string | undefined;
}

/**
 * Helper function to manage NFC scan session lifecycle with proper listener cleanup.
 * This ensures all listeners are removed after the operation completes, preventing memory leaks.
 * Rejects with NfcSessionBusyError if another session is already active.
 */
async function withNfcSession<T>(
  handler: (
    event: NfcTagScannedEvent,
    session: NfcSessionContext,
  ) => Promise<T>,
  options?: WithNfcSessionOptions,
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
    let handlerStarted = false;
    let pendingWaiter: {
      resolve: (event: NfcTagScannedEvent | null) => void;
      timer: ReturnType<typeof setTimeout>;
    } | null = null;

    const resolvePendingWaiter = (event: NfcTagScannedEvent | null) => {
      if (!pendingWaiter) return;
      const waiter = pendingWaiter;
      pendingWaiter = null;
      clearTimeout(waiter.timer);
      waiter.resolve(event);
    };

    const cleanup = async () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      // Unblock a handler waiting on another tag event; it will observe the
      // settled session and its late return value gets discarded.
      resolvePendingWaiter(null);
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

    const handleError = async (error: unknown) => {
      if (settled) return;
      settled = true;
      await cleanup();
      reject(error);
    };

    // Settle path for handler results: mark settled BEFORE stopping the native
    // session so the scanSessionCanceled/scanSessionError events our own stop
    // call triggers cannot win the race and mask the handler's outcome.
    const settleFromHandler = async (
      stop: () => Promise<void>,
      finish: () => void,
    ) => {
      if (settled) return;
      settled = true;
      await stop();
      await cleanup();
      finish();
    };

    activeSessionCancel = () => {
      void handleError(new NfcCancelledError());
    };

    const sessionContext: NfcSessionContext = {
      waitForNextTag: (timeoutMs) =>
        new Promise<NfcTagScannedEvent | null>((resolveWait) => {
          if (settled) {
            resolveWait(null);
            return;
          }
          const timer = setTimeout(() => {
            if (pendingWaiter && pendingWaiter.resolve === resolveWait) {
              pendingWaiter = null;
            }
            resolveWait(null);
          }, timeoutMs);
          pendingWaiter = { resolve: resolveWait, timer };
        }),
    };

    const setupAndStartScan = async () => {
      try {
        // Register all listeners and store their handles before starting the scan session.
        // This prevents a race condition where native events could fire before listener handles
        // are stored, which would cause cleanup() to fail and reintroduce the memory leak.
        const nfcTagScannedHandle = await Nfc.addListener(
          "nfcTagScanned",
          async (event) => {
            // iOS restartPolling re-fires scans while the tag stays in the
            // field; re-running the handler would repeat its side effects
            // (e.g. double-write), so later events only feed waiters.
            if (handlerStarted) {
              resolvePendingWaiter(event);
              return;
            }
            handlerStarted = true;
            try {
              const result = await handler(event, sessionContext);
              await settleFromHandler(stopScanSessionSafely, () =>
                resolve(result),
              );
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
              const iosErrorMessage =
                options?.iosErrorMessageFor?.(wrappedError);
              const stop =
                iosErrorMessage !== undefined
                  ? async () => {
                      try {
                        await Nfc.stopScanSession({
                          errorMessage: iosErrorMessage,
                        });
                      } catch (stopError) {
                        logger.debug(
                          "Failed to stop NFC scan session:",
                          stopError,
                        );
                      }
                    }
                  : stopScanSessionSafely;
              await settleFromHandler(stop, () => reject(wrappedError));
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

export function readNfcEvent(event: NfcTagScannedEvent): Tag | null {
  if (!event.nfcTag || !event.nfcTag.id) {
    return null;
  }

  let text = "";
  if (event.nfcTag.message && event.nfcTag.message.records.length > 0) {
    const ndef = event.nfcTag.message.records[0];
    if (ndef) {
      text = decodeNdefRecordText(ndef);
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

// How long iOS waits for the still-held tag to be re-scanned (the native
// plugin restarts polling ~0.5s after each read) before giving up on
// verification. A missing read-back is NOT treated as a write failure.
export const WRITE_VERIFY_TIMEOUT_MS = 5000;

export interface WriteTagOptions {
  verifyTimeoutMs?: number;
  ios?: {
    /** Shown in the iOS scan sheet while the post-write read-back runs. */
    verifyingMessage?: string;
    /** Shown in the iOS scan sheet when verification fails. */
    verifyFailedMessage?: string;
  };
}

type VerifyOutcome =
  | { kind: "verified"; event?: NfcTagScannedEvent }
  | { kind: "skipped"; reason: string }
  | { kind: "failed"; error: NfcVerificationError };

// NFC Forum Type 2 tag READ command: returns 16 bytes (4 pages); user data
// starts at page 4.
const T2_READ_COMMAND = 0x30;
const T2_FIRST_DATA_PAGE = 4;
const T2_LAST_PAGE = 0xff;
const T2_BYTES_PER_PAGE = 4;
const T2_READ_RESPONSE_BYTES = 16;
const VERIFY_MAX_BYTES = 1024;

/**
 * Read back the tag over raw NfcA transceive and compare the stored NDEF text
 * record against the written text. Tags that cannot be read this way (non
 * Type 2, unsupported READ command) skip verification rather than fail it.
 */
async function verifyWrittenTagAndroid(
  expectedText: string,
): Promise<VerifyOutcome> {
  try {
    await Nfc.connect({ techType: NfcTagTechType.NfcA });
  } catch (error) {
    logger.debug("Write verification connect failed:", error);
    return { kind: "skipped", reason: "connect-failed" };
  }

  try {
    const bytes: number[] = [];
    let firstRead = true;
    while (bytes.length < VERIFY_MAX_BYTES) {
      const page =
        T2_FIRST_DATA_PAGE + Math.floor(bytes.length / T2_BYTES_PER_PAGE);
      if (page > T2_LAST_PAGE) {
        return { kind: "skipped", reason: "capacity-cap" };
      }
      let response: number[];
      try {
        ({ response } = await Nfc.transceive({
          data: [T2_READ_COMMAND, page],
        }));
      } catch (error) {
        logger.debug("Write verification read failed:", error);
        // A first-read failure means the tag rejects the Type 2 READ command
        // (e.g. Mifare Classic); a later one means the tag was lost mid-read.
        // Neither is evidence the write failed.
        return {
          kind: "skipped",
          reason: firstRead ? "read-unsupported" : "read-interrupted",
        };
      }
      firstRead = false;
      bytes.push(...response);

      const extracted = extractNdefFromType2Tlv(bytes);
      if (extracted.kind === "no-ndef" || extracted.kind === "empty") {
        return {
          kind: "failed",
          error: new NfcVerificationError(
            `NFC write verification failed: tag contains ${
              extracted.kind === "empty"
                ? "an empty NDEF message"
                : "no NDEF message"
            }`,
            extracted.kind === "empty" ? "empty" : "no-ndef",
          ),
        };
      }
      if (extracted.kind === "found") {
        if (!parseFirstNdefRecord(extracted.ndef)) {
          return {
            kind: "failed",
            error: new NfcVerificationError(
              "NFC write verification failed: tag NDEF message is unparseable",
              "unparseable",
            ),
          };
        }
        if (verifyNdefTextMatches(extracted.ndef, expectedText)) {
          return { kind: "verified" };
        }
        return {
          kind: "failed",
          error: new NfcVerificationError(
            "NFC write verification failed: tag data does not match written data",
            "mismatch",
          ),
        };
      }
      // need-more: a short READ response with an incomplete TLV means we
      // cannot get further data - treat as inconclusive.
      if (response.length < T2_READ_RESPONSE_BYTES) {
        return { kind: "skipped", reason: "read-interrupted" };
      }
    }
    return { kind: "skipped", reason: "capacity-cap" };
  } finally {
    try {
      await Nfc.close();
    } catch {
      // Ignore close errors - connection may already be closed
    }
  }
}

/**
 * Wait for the still-held tag to be re-scanned by iOS's restarted polling and
 * compare the freshly read NDEF text against the written text. Timing out or
 * losing the session is inconclusive, not a failure.
 */
async function verifyWrittenTagIos(
  session: NfcSessionContext,
  writtenUid: string,
  expectedText: string,
  timeoutMs: number,
  verifyingMessage?: string,
): Promise<VerifyOutcome> {
  if (verifyingMessage) {
    try {
      await Nfc.setAlertMessage({ message: verifyingMessage });
    } catch (error) {
      logger.debug("Failed to set NFC alert message:", error);
    }
  }

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return { kind: "skipped", reason: "verify-timeout" };
    }
    const event = await session.waitForNextTag(remaining);
    if (!event) {
      return { kind: "skipped", reason: "verify-timeout" };
    }
    const tag = readNfcEvent(event);
    if (!tag || tag.uid !== writtenUid) {
      // A different (or unreadable) tag was presented; keep waiting for the
      // written one until the deadline.
      continue;
    }
    if (tag.text === expectedText) {
      return { kind: "verified", event };
    }
    return {
      kind: "failed",
      error: new NfcVerificationError(
        tag.text === ""
          ? "NFC write verification failed: tag contains an empty NDEF message"
          : "NFC write verification failed: tag data does not match written data",
        tag.text === "" ? "empty" : "mismatch",
      ),
    };
  }
}

export async function writeTag(
  text: string,
  options?: WriteTagOptions,
): Promise<Result> {
  const record = createNdefTextRecord(text);
  const maxFormatRetries = 3;
  const formatRetryDelayMs = 500;
  const verifyTimeoutMs = options?.verifyTimeoutMs ?? WRITE_VERIFY_TIMEOUT_MS;

  // Runs after a successful native write: read the tag back, compare against
  // the requested text, and only then build the success result. Throws
  // NfcVerificationError when the read-back shows the write did not stick.
  const finishWrite = async (
    event: NfcTagScannedEvent,
    session: NfcSessionContext,
  ): Promise<Result> => {
    const platform = Capacitor.getPlatform();
    let outcome: VerifyOutcome;
    if (platform === "android") {
      outcome = await verifyWrittenTagAndroid(text);
    } else if (platform === "ios") {
      outcome = await verifyWrittenTagIos(
        session,
        int2hex(event.nfcTag?.id ?? []),
        text,
        verifyTimeoutMs,
        options?.ios?.verifyingMessage,
      );
    } else {
      outcome = { kind: "skipped", reason: "platform-unsupported" };
    }

    if (outcome.kind === "failed") {
      throw outcome.error;
    }
    if (outcome.kind === "skipped") {
      logger.log(`write verification skipped: ${outcome.reason}`);
    } else {
      logger.log("write verification passed");
    }

    const resultEvent =
      outcome.kind === "verified" && outcome.event ? outcome.event : event;
    return {
      status: Status.Success,
      info: {
        rawTag: resultEvent.nfcTag,
        tag: readNfcEvent(resultEvent),
      },
    };
  };

  try {
    return await withNfcSession<Result>(
      async (event, session) => {
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
                return await finishWrite(event, session);
              } catch (formatError) {
                if (formatError instanceof NfcVerificationError) {
                  // The write itself succeeded; a failed read-back is not a
                  // formatting problem to retry.
                  throw formatError;
                }
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
        return finishWrite(event, session);
      },
      {
        iosErrorMessageFor: (error) =>
          error instanceof NfcVerificationError
            ? options?.ios?.verifyFailedMessage
            : undefined,
      },
    );
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
