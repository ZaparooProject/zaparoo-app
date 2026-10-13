import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useStatusStore } from "@/lib/store";
import {
  cancelSession,
  sessionManager,
  waitForSessionRelease,
} from "@/lib/nfc";
import { NfcSessionBusyError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { useNfcWriter, WriteAction, WriteMethod } from "@/lib/writeNfcHook";
import type { ReaderActivityState } from "@/components/ReaderActivityControl";

const START_FAILED_KEYS: Record<WriteAction, string> = {
  [WriteAction.Write]: "spinner.writeFailed",
  [WriteAction.Read]: "spinner.readFailed",
  [WriteAction.Format]: "spinner.formatFailed",
  [WriteAction.Erase]: "spinner.eraseFailed",
  [WriteAction.MakeReadOnly]: "spinner.makeReadOnlyFailed",
};

/**
 * A visible action owns its reader work until it settles or its context is
 * dismissed. Writes are the default; reads and tag tools pass their action.
 */
export function useContextualNfcWrite(
  contextKey: string | null,
  enabled: boolean,
) {
  const { t } = useTranslation();
  const preferRemoteWriter = usePreferencesStore(
    (state) => state.preferRemoteWriter,
  );
  const externalWriteActive = useStatusStore(
    (state) => state.writeOpen || state.writeQueue !== "",
  );
  const {
    write,
    end,
    retry: retryWrite,
    getVerifyError,
    verifyError,
    retapRequired,
    result,
  } = useNfcWriter(WriteMethod.Auto, preferRemoteWriter);
  const [active, setActive] = useState(false);
  const operationRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const endingRef = useRef<Promise<void> | null>(null);

  const cancel = useCallback((): Promise<void> => {
    if (!operationRef.current) return endingRef.current ?? Promise.resolve();
    operationRef.current.abort();
    operationRef.current = null;
    const ending = end()
      .catch((error) => {
        logger.error("Failed to cancel contextual NFC write", error, {
          category: "nfc",
          action: "cancelContextualWrite",
        });
      })
      .finally(() => {
        if (endingRef.current === ending) {
          endingRef.current = null;
          inFlightRef.current = false;
          setActive(false);
        }
      });
    endingRef.current = ending;
    return ending;
  }, [end]);

  useEffect(
    () => () => {
      void cancel();
    },
    [contextKey, enabled, cancel],
  );

  const start = useCallback(
    async (text: string, action: WriteAction = WriteAction.Write) => {
      const globalState = useStatusStore.getState();
      if (
        !enabled ||
        (action === WriteAction.Write && !text) ||
        operationRef.current ||
        endingRef.current ||
        globalState.writeOpen ||
        globalState.writeQueue !== ""
      )
        return;
      const operation = new AbortController();
      operationRef.current = operation;
      inFlightRef.current = true;
      setActive(true);
      try {
        // A deliberate action takes over from Home's continuous read session.
        if (sessionManager.isScanning) {
          await cancelSession();
          if (!(await waitForSessionRelease())) throw new NfcSessionBusyError();
        }
        if (operation.signal.aborted) return;
        await write(action, action === WriteAction.Write ? text : undefined);
      } catch (error) {
        if (operation.signal.aborted) return;
        logger.error("Failed to start contextual NFC write", error, {
          category: "nfc",
          action: "contextualWrite",
        });
        toast.error(t(START_FAILED_KEYS[action]));
      } finally {
        if (operationRef.current === operation) {
          inFlightRef.current = false;
          if (getVerifyError() === null) {
            operationRef.current = null;
            setActive(false);
          }
        }
      }
    },
    [enabled, write, getVerifyError, t],
  );

  const retry = useCallback(async () => {
    const operation = operationRef.current;
    if (!operation || inFlightRef.current || endingRef.current) return;
    inFlightRef.current = true;
    try {
      await retryWrite();
    } finally {
      if (operationRef.current === operation) {
        inFlightRef.current = false;
        if (getVerifyError() === null) {
          operationRef.current = null;
          setActive(false);
        }
      }
    }
  }, [retryWrite, getVerifyError]);

  const state: ReaderActivityState = !active
    ? "idle"
    : verifyError
      ? "error"
      : retapRequired
        ? "attention"
        : "waiting";
  return {
    state,
    active,
    externalWriteActive,
    /** Tag data from the last completed operation; null while one is pending. */
    result,
    start,
    cancel,
    retry,
    // Ready-made props for ReaderActivityControl and MediaDetailsModal.
    activeLabel: retapRequired
      ? t("spinner.retapTag")
      : t("spinner.holdTagReader"),
    errorMessage: verifyError ? t("spinner.verifyFailedRetry") : undefined,
    onCancel: () => void cancel(),
    onRetry: () => void retry(),
  };
}
