import {
  NfcSessionBusyError,
  NfcTransientError,
  NoWriteMethodAvailableError,
} from "./errors";

/**
 * Translation key for the NFC failures the app can explain itself. Null means
 * the only description is the error's own (often native, untranslated) text.
 */
export function nfcErrorMessageKey(error: unknown): string | null {
  if (error instanceof NfcSessionBusyError) return "spinner.sessionBusy";
  if (error instanceof NfcTransientError) return "spinner.tagLost";
  if (error instanceof NoWriteMethodAvailableError) {
    return "write.noWriteMethodAvailable";
  }
  return null;
}
