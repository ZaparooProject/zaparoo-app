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

/** A visible action owns its write until it settles or its context is dismissed. */
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
    async (text: string) => {
      const globalState = useStatusStore.getState();
      if (
        !enabled ||
        !text ||
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
        // A deliberate write takes over from Home's continuous read session.
        if (sessionManager.isScanning) {
          await cancelSession();
          if (!(await waitForSessionRelease())) throw new NfcSessionBusyError();
        }
        if (operation.signal.aborted) return;
        await write(WriteAction.Write, text);
      } catch (error) {
        if (operation.signal.aborted) return;
        logger.error("Failed to start contextual NFC write", error, {
          category: "nfc",
          action: "contextualWrite",
        });
        toast.error(t("spinner.writeFailed"));
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
  return { state, active, externalWriteActive, start, cancel, retry };
}
