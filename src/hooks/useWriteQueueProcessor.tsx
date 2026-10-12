import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Capacitor } from "@capacitor/core";
import {
  WriteAction,
  WriteNfcHook,
  useNfcWriter,
  WriteMethod,
} from "@/lib/writeNfcHook";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { CoreAPI } from "@/lib/coreApi";
import {
  cancelSession,
  sessionManager,
  waitForSessionRelease,
} from "@/lib/nfc";
import { nfcErrorMessageKey } from "@/lib/nfcErrorMessages";
import { logger } from "@/lib/logger";
import { NoWriteMethodAvailableError } from "@/lib/errors";

const MAX_RETRIES = 10;
const RETRY_INTERVAL_MS = 500;

export interface UseWriteQueueProcessorReturn {
  nfcWriter: WriteNfcHook;
}

export function useWriteQueueProcessor(): UseWriteQueueProcessorReturn {
  const { t } = useTranslation();
  const writeQueue = useStatusStore((state) => state.writeQueue);
  const preferRemoteWriter = usePreferencesStore(
    (state) => state.preferRemoteWriter,
  );
  const nfcWriter = useNfcWriter(WriteMethod.Auto, preferRemoteWriter);

  // Latest-value refs so the processing loop never needs to re-subscribe and
  // no effect cleanup can destroy a pending retry timer mid-flight.
  const nfcWriterRef = useRef(nfcWriter);
  const tRef = useRef(t);
  useEffect(() => {
    nfcWriterRef.current = nfcWriter;
    tRef.current = t;
  }, [nfcWriter, t]);

  const isProcessingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Self-reference so finish() can chain to the next queued item
  const processNextRef = useRef<() => void>(() => {});
  const pendingVerificationCompletionRef = useRef<(() => void) | null>(null);

  const completePendingVerification = useCallback(() => {
    const complete = pendingVerificationCompletionRef.current;
    if (!complete) {
      return;
    }
    pendingVerificationCompletionRef.current = null;
    complete();
  }, []);

  const processNext = useCallback(() => {
    if (isProcessingRef.current) {
      return;
    }
    const currentWriteValue = useStatusStore.getState().writeQueue;
    if (currentWriteValue === "") {
      return;
    }

    isProcessingRef.current = true;
    useStatusStore.getState().setWriteQueue("");

    let retryCount = 0;

    const attempt = async () => {
      const writer = nfcWriterRef.current;

      // Only call end() if there's an active write operation
      if (writer.status !== null) {
        await writer.end().catch((e) => {
          logger.error("NFC writer end failed:", e, {
            category: "nfc",
            action: "endWriter",
          });
        });
      }

      let hasWriteCapability = false;

      // Use cached NFC availability (already checked during app hydration)
      // This avoids an async Capacitor call that could delay processing
      const { nfcAvailable } = usePreferencesStore.getState();
      if (Capacitor.isNativePlatform() && nfcAvailable) {
        hasWriteCapability = true;
      }

      // Only check remote readers if local NFC is not available AND the
      // connection is fully established - during RECONNECTING the request
      // would sit in the offline queue until it times out.
      const { connectionState } = useStatusStore.getState();
      const isConnected = connectionState === ConnectionState.CONNECTED;
      if (!hasWriteCapability && isConnected) {
        hasWriteCapability = await CoreAPI.hasWriteCapableReader();
      }

      if (!hasWriteCapability) {
        const message = tRef.current("write.noWriteMethodAvailable");
        if (!isConnected) {
          // No local NFC and the connection may still come up (e.g. cold
          // start or resume from a deep link) - throw so the retry loop keeps
          // the write alive until the remote reader can be checked
          throw new NoWriteMethodAvailableError(message);
        }
        toast.error(message);
        return;
      }

      // A deep-link write is a deliberate user action; take over from any
      // open read session before starting our own.
      if (sessionManager.isScanning) {
        await cancelSession().catch((e) => {
          logger.debug("Failed to cancel active session before write:", e);
        });
        await waitForSessionRelease();
      }

      logger.log("Processing NFC write:", currentWriteValue.slice(0, 50));
      useStatusStore.getState().setWriteOpen(true);
      // write() resolves when the operation completes (including tag errors,
      // which surface their own toast) and only rejects on setup failures.
      await writer.write(WriteAction.Write, currentWriteValue);
      // On verification failure the reader activity stays up with its retry
      // action; deferred completion ends it after retry or cancellation.
      if (writer.getVerifyError() === null) {
        useStatusStore.getState().setWriteOpen(false);
      }
    };

    const finish = () => {
      isProcessingRef.current = false;
      // Pick up a write that was queued while this one was processing
      processNextRef.current();
    };

    const completeDeferredVerification = () => {
      useStatusStore.getState().setWriteOpen(false);
      finish();
    };

    const run = () => {
      attempt()
        .then(() => {
          if (nfcWriterRef.current.getVerifyError() !== null) {
            pendingVerificationCompletionRef.current =
              completeDeferredVerification;
            return;
          }
          finish();
        })
        .catch((e) => {
          if (retryCount < MAX_RETRIES) {
            retryCount++;
            logger.log(
              `NFC not ready, retrying (${retryCount}/${MAX_RETRIES})...`,
            );
            timeoutRef.current = setTimeout(run, RETRY_INTERVAL_MS);
          } else {
            if (e instanceof NoWriteMethodAvailableError) {
              // Core never connected; the toast explains the outcome
              logger.warn("No NFC write method became available", e);
            } else {
              logger.error("NFC write failed after retries", e, {
                category: "nfc",
                action: "writeQueue",
                retryCount,
                maxRetries: MAX_RETRIES,
              });
            }
            // NoWriteMethodAvailableError already carries translated text;
            // other typed failures map to keys, raw text is the last resort.
            const messageKey =
              e instanceof NoWriteMethodAvailableError
                ? null
                : nfcErrorMessageKey(e);
            toast.error(
              messageKey
                ? tRef.current(messageKey)
                : e instanceof Error && e.message
                  ? e.message
                  : tRef.current("write.noWriteMethodAvailable"),
            );
            useStatusStore.getState().setWriteOpen(false);
            finish();
          }
        });
    };

    run();
  }, []);

  useEffect(() => {
    processNextRef.current = processNext;
  }, [processNext]);

  useEffect(() => {
    if (writeQueue === "") {
      return;
    }
    // Consume the queue outside the synchronous effect body so state updates
    // (clearing the queue, showing reader activity) don't cascade renders
    // mid-effect
    queueMicrotask(() => {
      processNextRef.current();
    });
  }, [writeQueue]);

  // Cleanup only on unmount - retry timers must survive re-renders
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const retry = useCallback(async () => {
    await nfcWriterRef.current.retry();
    if (nfcWriterRef.current.getVerifyError() === null) {
      completePendingVerification();
    }
  }, [completePendingVerification]);

  const end = useCallback(async () => {
    try {
      await nfcWriterRef.current.end();
    } finally {
      completePendingVerification();
    }
  }, [completePendingVerification]);

  const guardedNfcWriter = useMemo<WriteNfcHook>(
    () => ({ ...nfcWriter, retry, end }),
    [nfcWriter, retry, end],
  );

  return { nfcWriter: guardedNfcWriter };
}
