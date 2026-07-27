import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { ConnectionState, RunQueueItem, useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { runToken } from "@/lib/tokenOperations.tsx";
import { logger } from "@/lib/logger";
import { useHaptics } from "@/hooks/useHaptics";

// How long a queued launch may wait for a CONNECTED transition before failing.
const CONNECT_DEADLINE_MS = 30000;

export interface UseRunQueueProcessorReturn {
  pendingConfirm: RunQueueItem | null;
  confirmRun: () => void;
  cancelConfirm: () => void;
}

export function useRunQueueProcessor(): UseRunQueueProcessorReturn {
  const { t } = useTranslation();
  const { notification } = useHaptics();
  const runQueue = useStatusStore((state) => state.runQueue);
  const setRunQueue = useStatusStore((state) => state.setRunQueue);
  const setLastToken = useStatusStore((state) => state.setLastToken);
  const setProPurchaseModalOpen = useStatusStore(
    (state) => state.setProPurchaseModalOpen,
  );
  const launcherAccess = usePreferencesStore((state) => state.launcherAccess);

  const [pendingConfirm, setPendingConfirm] = useState<RunQueueItem | null>(
    null,
  );
  const isProcessingRef = useRef(false);
  // Confirmed or queued items waiting while another launch is in flight
  const backlogRef = useRef<RunQueueItem[]>([]);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const deadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Self-reference so finish() can chain to a backlogged launch
  const executeRunRef = useRef<(item: RunQueueItem) => void>(() => {});

  const clearWait = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    if (deadlineRef.current) {
      clearTimeout(deadlineRef.current);
      deadlineRef.current = null;
    }
  }, []);

  const executeRun = useCallback(
    (item: RunQueueItem) => {
      if (isProcessingRef.current) {
        backlogRef.current.push(item);
        return;
      }
      isProcessingRef.current = true;

      const finish = () => {
        clearWait();
        isProcessingRef.current = false;
        // Pick up a launch that arrived while this one was in flight
        const next = backlogRef.current.shift();
        if (next) {
          executeRunRef.current(next);
        }
      };

      const run = () => {
        logger.log("Processing run queue:", item.value.slice(0, 50));
        runToken(
          "",
          item.value,
          launcherAccess,
          true, // connected - we only run once CONNECTED
          setLastToken,
          setProPurchaseModalOpen,
          item.unsafe,
          false, // override
          true, // canQueueCommands
          true, // requiresLaunch - queue items are deliberate launch actions
        )
          .then((success: boolean) => {
            // false means the launch was blocked (e.g. Pro purchase modal
            // opened) or failed with its own user feedback - not a success
            logger.log(
              success ? "runQueue launch succeeded" : "runQueue launch blocked",
            );
          })
          .catch((e) => {
            logger.error("runQueue error", e, {
              category: "queue",
              action: "runQueue",
              tokenValue: item.value.slice(0, 50),
            });
          })
          .finally(finish);
      };

      if (
        useStatusStore.getState().connectionState === ConnectionState.CONNECTED
      ) {
        run();
        return;
      }

      // Wait for the CONNECTED transition instead of polling; fail after a
      // single overall deadline so queued launches never wedge.
      logger.log("Device not connected, waiting for connection...");
      unsubscribeRef.current = useStatusStore.subscribe((state) => {
        if (
          state.connectionState === ConnectionState.CONNECTED &&
          unsubscribeRef.current
        ) {
          clearWait();
          run();
        }
      });
      deadlineRef.current = setTimeout(() => {
        logger.error("Failed to connect to device before launch deadline", {
          category: "connection",
          action: "runQueue",
        });
        notification("error");
        toast.error(t("create.custom.failMsg"));
        finish();
      }, CONNECT_DEADLINE_MS);
    },
    [
      clearWait,
      launcherAccess,
      notification,
      setLastToken,
      setProPurchaseModalOpen,
      t,
    ],
  );

  const confirmRun = useCallback(() => {
    if (!pendingConfirm) {
      return;
    }
    const item = pendingConfirm;
    setPendingConfirm(null);
    executeRun(item);
  }, [pendingConfirm, executeRun]);

  const cancelConfirm = useCallback(() => {
    setPendingConfirm(null);
  }, []);

  useEffect(() => {
    executeRunRef.current = executeRun;
  }, [executeRun]);

  useEffect(() => {
    if (!runQueue) {
      return;
    }
    const item = runQueue;

    // Consume the queue outside the synchronous effect body so the state
    // updates (clearing the queue, opening the confirm modal) don't cascade
    // renders mid-effect. The store check makes StrictMode double-invocation
    // and stale microtasks safe: only the first consumer sees the item.
    queueMicrotask(() => {
      if (useStatusStore.getState().runQueue !== item) {
        return;
      }
      setRunQueue(null);

      if (item.source === "deepLink") {
        // Untrusted URL trigger - ask the user before launching. A newer link
        // replaces any confirmation still awaiting an answer.
        setPendingConfirm(item);
        return;
      }

      executeRunRef.current(item);
    });
  }, [runQueue, setRunQueue]);

  useEffect(() => {
    return () => {
      clearWait();
    };
  }, [clearWait]);

  return { pendingConfirm, confirmRun, cancelConfirm };
}
