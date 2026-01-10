import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import {
  Nfc,
  NfcTag,
  NfcTagScannedEvent,
  NfcUtils,
} from "@capawesome-team/capacitor-nfc";
import { logger } from "./logger";
import {
  NfcCancelledError,
  NfcUnformattedTagError,
  NfcFormatError,
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

/**
 * Helper function to manage NFC scan session lifecycle with proper listener cleanup.
 * This ensures all listeners are removed after the operation completes, preventing memory leaks.
 */
async function withNfcSession<T>(
  handler: (event: NfcTagScannedEvent) => Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let listeners: PluginListenerHandle[] = [];

    const cleanup = async () => {
      // Remove all listeners
      await Promise.all(listeners.map((listener) => listener.remove()));
      listeners = [];
    };

    const handleSuccess = async (result: T) => {
      await cleanup();
      resolve(result);
    };

    const handleError = async (error: unknown) => {
      await cleanup();
      reject(error);
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
              Nfc.stopScanSession();
              await handleSuccess(result);
            } catch (error) {
              logger.error("NFC operation error:", error, {
                category: "nfc",
                action: "nfcTagScanned",
                stack: error instanceof Error ? error.stack : undefined,
              });
              Nfc.stopScanSession();
              await handleError(error);
            }
          },
        );

        const scanCanceledHandle = await Nfc.addListener(
          "scanSessionCanceled",
          async () => {
            Nfc.stopScanSession();
            await handleError(new NfcCancelledError());
          },
        );

        const scanErrorHandle = await Nfc.addListener(
          "scanSessionError",
          async (err) => {
            logger.error("NFC scan session error:", err, {
              category: "nfc",
              action: "scanSessionError",
              message: err.message,
              stack: err instanceof Error ? err.stack : undefined,
            });
            Nfc.stopScanSession();
            await handleError(err);
          },
        );

        // Store all listener handles for cleanup
        listeners.push(
          nfcTagScannedHandle,
          scanCanceledHandle,
          scanErrorHandle,
        );

        // Now it's safe to start the scan session
        await Nfc.startScanSession();
      } catch (setupError) {
        // If setup fails (e.g., NFC not enabled), clean up and reject
        await cleanup();
        reject(setupError);
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

function readNfcEvent(event: NfcTagScannedEvent): Tag | null {
  if (!event.nfcTag || !event.nfcTag.id) {
    return null;
  }

  let text = "";
  if (event.nfcTag.message && event.nfcTag.message.records.length > 0) {
    const ndef = event.nfcTag.message.records[0];

    if (ndef?.payload) {
      let bs = ndef.payload;
      if (bs.length > 3 && bs[0] == 2) {
        bs = bs.slice(3);
      }
      text = int2char(bs);
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
              lastFormatError = formatError;
              logger.log(
                `Format attempt ${attempt} failed: ${formatError instanceof Error ? formatError.message : String(formatError)}`,
              );
            }
          }

          // All retries exhausted - log technical error for debugging
          logger.error(
            "NFC format/write failed after retries",
            lastFormatError,
            {
              category: "nfc",
              action: "writeTag",
              stack:
                lastFormatError instanceof Error
                  ? lastFormatError.stack
                  : undefined,
            },
          );
          throw lastFormatError;
        }
        throw writeError;
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
  const supported = await Nfc.isSupported();
  if (supported.nfc) {
    // Just stop the session - this triggers scanSessionCanceled event which
    // withNfcSession handles properly by cleaning up its own listeners.
    // Do NOT call removeAllListeners() as it would globally remove ALL NFC listeners,
    // breaking encapsulation and potentially affecting other code.
    await Nfc.stopScanSession();
  }
}
