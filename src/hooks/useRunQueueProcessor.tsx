import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { useStatusStore } from "../lib/store";
import { TokenResponse } from "@/lib/models.ts";
import { App } from "@capacitor/app";

interface UseRunQueueProcessorProps {
  launcherAccess: boolean;
  setLastToken: (token: TokenResponse) => void;
  setProPurchaseModalOpen: (open: boolean) => void;
  runToken: (
    uid: string,
    text: string,
    launcherAccess: boolean,
    connected: boolean,
    setLastToken: (token: TokenResponse) => void,
    setProPurchaseModalOpen: (open: boolean) => void,
    unsafe?: boolean
  ) => Promise<boolean>;
}

export function useRunQueueProcessor({
  launcherAccess,
  setLastToken,
  setProPurchaseModalOpen,
  runToken
}: UseRunQueueProcessorProps) {
  const { t } = useTranslation();
  const runQueue = useStatusStore((state) => state.runQueue);
  const setRunQueue = useStatusStore((state) => state.setRunQueue);
  const getConnected = () => useStatusStore.getState().connected;
  const isProcessingRef = useRef(false);

  const lastProcessedRef = useRef(0);

  const processQueue = useCallback(
    (queueData: { value: string; unsafe: boolean } | null) => {
      if (!queueData || isProcessingRef.current) {
        return;
      }

      isProcessingRef.current = true;

      const currentRunValue = { ...queueData };

      setRunQueue(null);

      lastProcessedRef.current = Date.now();

      const maxRetries = 10;
      const retryInterval = 500;
      let retryCount = 0;

      const attemptRun = () => {
        const currentConnected = getConnected();

        if (currentConnected) {
          console.log("Processing run queue:", currentRunValue.value);
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
              console.log("runQueue success", success);
              isProcessingRef.current = false;
            })
            .catch((e) => {
              console.error("runQueue error", e);
              isProcessingRef.current = false;
            });
        } else if (retryCount < maxRetries) {
          retryCount++;
          console.log(
            `Device not connected, retrying (${retryCount}/${maxRetries})...`
          );
          setTimeout(attemptRun, retryInterval);
        } else {
          console.error("Failed to connect to device after multiple attempts");
          toast.error(t("create.custom.failMsg"));
          isProcessingRef.current = false;
        }
      };

      attemptRun();
    },
    [
      launcherAccess,
      runToken,
      setLastToken,
      setProPurchaseModalOpen,
      setRunQueue,
      t
    ]
  );

  // Listen for URL opens and process directly
  useEffect(() => {
    App.addListener("appUrlOpen", (event) => {
      const url = new URL(event.url);
      const path = url.pathname;

      if (path === "/run") {
        const params = new URLSearchParams(url.search);
        const value = params.get("v");

        if (value) {
          // Check if we've processed this recently (debounce)
          const now = Date.now();
          if (now - lastProcessedRef.current > 1000) {
            console.log("URL listener processing run:", value);
            processQueue({ value, unsafe: true });
          }
        }
      }
    });
  }, [processQueue]);

  useEffect(() => {
    processQueue(runQueue);
  }, [
    launcherAccess,
    runQueue,
    setLastToken,
    setProPurchaseModalOpen,
    setRunQueue,
    runToken,
    t,
    processQueue
  ]);

  return { processQueue };
}
