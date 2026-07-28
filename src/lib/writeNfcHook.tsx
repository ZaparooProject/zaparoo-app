import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { CheckIcon, WarningIcon } from "./images";
import {
  cancelSession,
  eraseTag,
  formatTag,
  makeReadOnly,
  readRaw,
  writeTag,
  Result,
  Status,
  isFormatRelatedError,
} from "./nfc";
import { CoreAPI } from "./coreApi.ts";
import { logger } from "./logger";
import {
  NfcCancelledError,
  NfcVerificationError,
  isCancellationError,
  isExpectedNfcError,
} from "./errors";

export interface WriteNfcHook {
  write: (action: WriteAction, text?: string) => Promise<void>;
  /** Re-run the last write after a verification failure. */
  retry: () => Promise<void>;
  end: () => Promise<void>;
  writing: boolean;
  result: null | Result;
  status: null | Status;
  /** Set when the post-write read-back showed the write did not stick. */
  verifyError: NfcVerificationError | null;
  /**
   * Ref-backed read of verifyError for callers that need the value right
   * after awaiting write(), before React re-renders.
   */
  getVerifyError: () => NfcVerificationError | null;
}

export enum WriteMethod {
  Auto = "auto",
  LocalNFC = "local",
  RemoteReader = "remote",
}

export enum WriteAction {
  Write = "write",
  Read = "read",
  Format = "format",
  Erase = "erase",
  MakeReadOnly = "makeReadOnly",
}

function coreWrite(text: string, signal?: AbortSignal): Promise<Result> {
  if (signal?.aborted) {
    return Promise.resolve({
      status: Status.Cancelled,
      info: {
        rawTag: null,
        tag: null,
      },
    });
  }

  return CoreAPI.write({ text }, signal)
    .then((result) => {
      // Check if the result indicates cancellation
      if (result && typeof result === "object" && "cancelled" in result) {
        return {
          status: Status.Cancelled,
          info: {
            rawTag: null,
            tag: null,
          },
        };
      } else {
        return {
          status: Status.Success,
          info: {
            rawTag: null,
            tag: null,
          },
        };
      }
    })
    .catch((e) => {
      throw e;
    });
}

async function determineWriteMethod(
  preferredMethod: WriteMethod,
  preferRemoteWriter: boolean,
): Promise<WriteMethod> {
  if (preferredMethod !== WriteMethod.Auto) {
    return preferredMethod;
  }

  const isNativePlatform = Capacitor.isNativePlatform();
  const isConnected = CoreAPI.isConnected();

  // If not connected, only local NFC is available - don't make API calls that will hang
  if (!isConnected) {
    if (isNativePlatform) {
      try {
        const nfcAvailable = await Nfc.isAvailable();
        if (nfcAvailable.nfc) {
          return WriteMethod.LocalNFC;
        }
      } catch (error) {
        logger.error("NFC availability check failed:", error, {
          category: "nfc",
          action: "determineWriteMethod",
          severity: "warning",
        });
      }
    }
    // Not connected and no local NFC available - return RemoteReader
    // which will fail gracefully when the write is attempted
    return WriteMethod.RemoteReader;
  }

  // Connected - use full auto-detection logic with API calls
  const hasRemoteWriter = await CoreAPI.hasWriteCapableReader();

  // If user prefers remote writer and it's available, use it
  if (preferRemoteWriter && hasRemoteWriter) {
    return WriteMethod.RemoteReader;
  }

  // If on native platform and has NFC, use local (unless user prefers remote)
  if (isNativePlatform) {
    try {
      const nfcAvailable = await Nfc.isAvailable();
      if (nfcAvailable.nfc) {
        return WriteMethod.LocalNFC;
      }
    } catch (error) {
      logger.error("NFC availability check failed:", error, {
        category: "nfc",
        action: "determineWriteMethod",
        severity: "warning",
      });
    }
  }

  // Fallback to remote reader if available
  if (hasRemoteWriter) {
    return WriteMethod.RemoteReader;
  }

  // Default fallback (will likely fail, but maintains existing behavior)
  return isNativePlatform ? WriteMethod.LocalNFC : WriteMethod.RemoteReader;
}

export function useNfcWriter(
  writeMethod: WriteMethod = WriteMethod.Auto,
  preferRemoteWriter: boolean = false,
): WriteNfcHook {
  const [writing, setWriting] = useState(false);
  const [result, setResult] = useState<null | Result>(null);
  const [status, setStatus] = useState<null | Status>(null);
  const [verifyError, setVerifyError] = useState<NfcVerificationError | null>(
    null,
  );
  const verifyErrorRef = useRef<NfcVerificationError | null>(null);
  const lastWriteArgsRef = useRef<{
    action: WriteAction;
    text?: string;
  } | null>(null);
  // Verification-failure toast content stashed until the write modal closes,
  // so the toast is not fired while the scan UI still covers it.
  const deferredErrorToastRef = useRef<{
    title: string;
    message: string;
  } | null>(null);
  const currentWriteMethodRef = useRef<WriteMethod | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Whether THIS hook instance has a local NFC session in flight, so unmount
  // cleanup only cancels sessions it owns instead of any active session.
  const ownsLocalSessionRef = useRef(false);
  // Monotonic per-write token: a superseded write's cleanup must not clear
  // the ownership flag set by a newer write still in flight.
  const writeOpIdRef = useRef(0);

  const { t } = useTranslation();

  useEffect(() => {
    return () => {
      if (ownsLocalSessionRef.current) {
        ownsLocalSessionRef.current = false;
        cancelSession().catch((error) => {
          logger.debug("Failed to cancel NFC session on unmount:", error);
        });
      }
      if (
        abortControllerRef.current &&
        !abortControllerRef.current.signal.aborted
      ) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const write = useCallback(
    async (action: WriteAction, text?: string) => {
      const writeOpId = ++writeOpIdRef.current;

      // Clear any previous state before starting a new write operation
      setStatus(null);
      setResult(null);
      setWriting(false);
      setVerifyError(null);
      verifyErrorRef.current = null;
      deferredErrorToastRef.current = null;
      lastWriteArgsRef.current = { action, text };

      // Clean up any existing AbortController before creating new one
      if (
        abortControllerRef.current &&
        !abortControllerRef.current.signal.aborted
      ) {
        abortControllerRef.current.abort();
      }

      // Create new AbortController for this write operation
      const controller = new AbortController();
      abortControllerRef.current = controller;

      let actionFunc = readRaw;
      let toastSuccess = t("spinner.writeSuccess");
      let toastFailed = t("spinner.writeFailed");
      let usesLocalSession = true;

      switch (action) {
        case WriteAction.Write: {
          if (!text) {
            logger.error("No text provided to write", {
              category: "nfc",
              action: "writeValidation",
            });
            setStatus(Status.Error);
            return;
          }

          let selectedWriteMethod: WriteMethod;
          try {
            selectedWriteMethod = await determineWriteMethod(
              writeMethod,
              preferRemoteWriter,
            );
          } catch (error) {
            logger.error("Failed to determine write method:", error, {
              category: "nfc",
              action: "determineWriteMethod",
            });
            setStatus(Status.Error);
            throw error;
          }
          currentWriteMethodRef.current = selectedWriteMethod;

          if (selectedWriteMethod === WriteMethod.LocalNFC) {
            actionFunc = () =>
              writeTag(text, {
                ios: {
                  verifyingMessage: t("spinner.verifying"),
                  verifyFailedMessage: t("spinner.verifyFailed"),
                },
              });
          } else {
            actionFunc = () => coreWrite(text, controller.signal);
            usesLocalSession = false;
          }

          toastSuccess = t("spinner.writeSuccess");
          toastFailed = t("spinner.writeFailed");

          break;
        }
        case WriteAction.Read:
          currentWriteMethodRef.current = WriteMethod.LocalNFC;
          actionFunc = readRaw;
          toastSuccess = t("spinner.readSuccess");
          toastFailed = t("spinner.readFailed");
          break;
        case WriteAction.Format:
          if (Capacitor.getPlatform() !== "android") {
            logger.error("Format is only supported on Android", {
              category: "nfc",
              action: "formatPlatformCheck",
              platform: Capacitor.getPlatform(),
              severity: "warning",
            });
            setStatus(Status.Error);
            return;
          }
          currentWriteMethodRef.current = WriteMethod.LocalNFC;
          actionFunc = formatTag;
          toastSuccess = t("spinner.formatSuccess");
          toastFailed = t("spinner.formatFailed");
          break;
        case WriteAction.Erase:
          currentWriteMethodRef.current = WriteMethod.LocalNFC;
          actionFunc = eraseTag;
          toastSuccess = t("spinner.eraseSuccess");
          toastFailed = t("spinner.eraseFailed");
          break;
        case WriteAction.MakeReadOnly:
          currentWriteMethodRef.current = WriteMethod.LocalNFC;
          actionFunc = makeReadOnly;
          toastSuccess = t("spinner.makeReadOnlySuccess");
          toastFailed = t("spinner.makeReadOnlyFailed");
          break;
      }

      setWriting(true);
      if (usesLocalSession) {
        ownsLocalSessionRef.current = true;
      }
      return actionFunc()
        .then((result) => {
          setWriting(false);
          if (result.status === Status.Cancelled) {
            setStatus(Status.Cancelled);
          } else {
            let showMs = 2000;
            if (Capacitor.getPlatform() === "ios") {
              showMs += 4000;
            }
            toast.success(
              (to) => (
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
                <span
                  className="flex grow flex-col"
                  onClick={() => toast.dismiss(to.id)}
                >
                  <span>{toastSuccess}</span>
                </span>
              ),
              {
                id: "writeSuccess",
                icon: (
                  <span className="text-success pr-1">
                    <CheckIcon size="24" />
                  </span>
                ),
                duration: showMs,
              },
            );
            setResult(result);
            setStatus(Status.Success);
          }
        })
        .catch((e: Error) => {
          setWriting(false);
          // Don't log user-initiated cancellations as errors
          if (e instanceof NfcCancelledError || isCancellationError(e)) {
            setStatus(Status.Cancelled);
            return;
          }
          if (isExpectedNfcError(e)) {
            logger.debug("Expected NFC write operation failure", e);
          } else {
            logger.error("NFC write operation failed", e, {
              category: "nfc",
              action: action,
              writeMethod: currentWriteMethodRef.current,
            });
          }
          if (e instanceof NfcVerificationError) {
            // The write modal surfaces this failure with a retry action; the
            // toast is deferred until the modal closes so it stays visible.
            verifyErrorRef.current = e;
            setVerifyError(e);
            deferredErrorToastRef.current = {
              title: toastFailed,
              message: t("spinner.verifyFailedRetry"),
            };
            setStatus(Status.Error);
            return;
          }
          let showMs = 4000;
          if (Capacitor.getPlatform() === "ios") {
            showMs += 4000;
          }
          // Use user-friendly message for format-related errors on Android
          const userMessage =
            Capacitor.getPlatform() === "android" && isFormatRelatedError(e)
              ? t("spinner.formatErrorRetry")
              : e.message;
          toast.error(
            (to) => (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
              <span
                className="flex grow flex-col"
                onClick={() => toast.dismiss(to.id)}
              >
                <span>{toastFailed}</span>
                <span>{userMessage}</span>
              </span>
            ),
            {
              icon: (
                <span className="text-error pr-1">
                  <WarningIcon size="24" />
                </span>
              ),
              duration: showMs,
            },
          );
          setStatus(Status.Error);
        })
        .finally(() => {
          // Only the latest write may release ownership - an older write
          // settling late must not clear the flag for a newer local session
          if (usesLocalSession && writeOpIdRef.current === writeOpId) {
            ownsLocalSessionRef.current = false;
          }
        });
    },
    [writeMethod, preferRemoteWriter, t],
  );

  const retry = useCallback(async () => {
    const lastWrite = lastWriteArgsRef.current;
    if (!lastWrite || lastWrite.action !== WriteAction.Write) {
      return;
    }
    // Retrying replaces the failed attempt; its deferred toast must not fire.
    deferredErrorToastRef.current = null;
    try {
      await write(lastWrite.action, lastWrite.text);
    } catch {
      // write() already logged the failure and set error status
    }
  }, [write]);

  const getVerifyError = useCallback(() => verifyErrorRef.current, []);

  const end = useCallback(async () => {
    const method = currentWriteMethodRef.current;

    // Cancel pending write requests FIRST while pendingWriteId is still valid
    if (method === WriteMethod.RemoteReader) {
      CoreAPI.cancelWrite();
      // CoreAPI.cancelWrite() already calls readersWriteCancel(), but we can add extra safety
      try {
        await CoreAPI.readersWriteCancel();
      } catch (error) {
        logger.error("Failed to cancel remote write:", error, {
          category: "nfc",
          action: "cancelRemoteWrite",
        });
      }
    } else {
      // For local NFC or when method is unknown, always attempt session
      // cancellation so read/format/erase sessions are actually stopped.
      try {
        await cancelSession();
      } catch (error) {
        logger.debug("Failed to cancel NFC session:", error);
      }
    }

    // Abort promise operations AFTER cancelling API requests
    if (
      abortControllerRef.current &&
      !abortControllerRef.current.signal.aborted
    ) {
      abortControllerRef.current.abort();
    }

    currentWriteMethodRef.current = null;
    abortControllerRef.current = null;
    ownsLocalSessionRef.current = false;
    setStatus(null);
    setWriting(false);

    // The scan UI is gone now, so a stashed verification-failure toast can
    // fire without being obscured.
    const deferredToast = deferredErrorToastRef.current;
    if (deferredToast) {
      deferredErrorToastRef.current = null;
      toast.error(
        (to) => (
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
          <span
            className="flex grow flex-col"
            onClick={() => toast.dismiss(to.id)}
          >
            <span>{deferredToast.title}</span>
            <span>{deferredToast.message}</span>
          </span>
        ),
        {
          icon: (
            <span className="text-error pr-1">
              <WarningIcon size="24" />
            </span>
          ),
          duration: 4000,
        },
      );
    }
    verifyErrorRef.current = null;
    setVerifyError(null);
  }, []);

  return useMemo(
    () => ({
      write,
      retry,
      end,
      writing,
      result,
      status,
      verifyError,
      getVerifyError,
    }),
    [write, retry, end, writing, result, status, verifyError, getVerifyError],
  );
}
