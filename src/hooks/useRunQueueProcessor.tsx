import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { useStatusStore } from "../lib/store";
import { usePreferencesStore } from "../lib/preferencesStore";
import { runToken } from "../lib/tokenOperations.tsx";
import { logger } from "../lib/logger";

export function useRunQueueProcessor() {
  const { t } = useTranslation();
  const runQueue = useStatusStore((state) => state.runQueue);
  const setRunQueue = useStatusStore((state) => state.setRunQueue);
  const setLastToken = useStatusStore((state) => state.setLastToken);
  const setProPurchaseModalOpen = useStatusStore((state) => state.setProPurchaseModalOpen);
  const launcherAccess = usePreferencesStore((state) => state.launcherAccess);
  const getConnected = () => useStatusStore.getState().connected;
  const isProcessingRef = useRef(false);

  const processQueue = useCallback(
    (queueData: { value: string; unsafe: boolean } | null) => {
      if (!queueData || isProcessingRef.current) {
        return;
      }

      isProcessingRef.current = true;

      const currentRunValue = { ...queueData };

      setRunQueue(null);

      const maxRetries = 10;
      const retryInterval = 500;
      let retryCount = 0;

      const attemptRun = () => {
        const currentConnected = getConnected();

        if (currentConnected) {
          logger.log("Processing run queue:", currentRunValue.value);
          runToken(
            "",
            currentRunValue.value,
            launcherAccess,
            currentConnected,
            setLastToken,
            setProPurchaseModalOpen,
            currentRunValue.unsafe
          )
            .then((success: boolean) => {
              logger.log("runQueue success", success);
              isProcessingRef.current = false;
            })
            .catch((e) => {
              logger.error("runQueue error", e, {
                category: "queue",
                action: "runQueue",
                tokenValue: currentRunValue.value.slice(0, 50)
              });
              isProcessingRef.current = false;
            });
        } else if (retryCount < maxRetries) {
          retryCount++;
          logger.log(
            `Device not connected, retrying (${retryCount}/${maxRetries})...`
          );
          setTimeout(attemptRun, retryInterval);
        } else {
          logger.error("Failed to connect to device after multiple attempts", {
            category: "connection",
            action: "runQueue",
            maxRetries
          });
          toast.error(t("create.custom.failMsg"));
          isProcessingRef.current = false;
        }
      };

      attemptRun();
    },
    [
      launcherAccess,
      setLastToken,
      setProPurchaseModalOpen,
      setRunQueue,
      t
    ]
  );

  useEffect(() => {
    processQueue(runQueue);
  }, [
    launcherAccess,
    runQueue,
    setLastToken,
    setProPurchaseModalOpen,
    setRunQueue,
    t,
    processQueue
  ]);

  return { processQueue };
}
