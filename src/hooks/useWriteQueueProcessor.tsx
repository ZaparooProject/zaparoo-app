import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Capacitor } from "@capacitor/core";
import { WriteAction, useNfcWriter, WriteMethod } from "@/lib/writeNfcHook";
import { useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { CoreAPI } from "@/lib/coreApi";
import { logger } from "@/lib/logger";

interface UseWriteQueueProcessorReturn {
  reset: () => void;
}

export function useWriteQueueProcessor(): UseWriteQueueProcessorReturn {
  const { t } = useTranslation();
  const writeQueue = useStatusStore((state) => state.writeQueue);
  const setWriteQueue = useStatusStore((state) => state.setWriteQueue);
  const setWriteOpen = useStatusStore((state) => state.setWriteOpen);
  const connected = useStatusStore((state) => state.connected);
  const preferRemoteWriter = usePreferencesStore(
    (state) => state.preferRemoteWriter,
  );
  // Use cached NFC availability from app hydration to avoid async calls
  const nfcAvailable = usePreferencesStore((state) => state.nfcAvailable);
  const nfcWriter = useNfcWriter(WriteMethod.Auto, preferRemoteWriter);

  const isProcessingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (writeQueue === "" || isProcessingRef.current) {
      return;
    }

    isProcessingRef.current = true;
    const currentWriteValue = writeQueue;
    setWriteQueue("");

    // Only call end() if there's an active write operation
    if (nfcWriter.status !== null) {
      nfcWriter.end().catch((e) => {
        logger.error("NFC writer end failed:", e, {
          category: "nfc",
          action: "endWriter",
        });
      });
    }

    const maxRetries = 10;
    const retryInterval = 500;
    let retryCount = 0;

    const checkWriteCapabilityAndWrite = async () => {
      try {
        let hasWriteCapability = false;

        // Use cached NFC availability (already checked during app hydration)
        // This avoids an async Capacitor call that could delay processing
        if (Capacitor.isNativePlatform() && nfcAvailable) {
          hasWriteCapability = true;
        }

        // Only check remote readers if:
        // 1. Local NFC is not available, AND
        // 2. We're connected to a device (to avoid timeout on cold start)
        if (!hasWriteCapability && connected) {
          hasWriteCapability = await CoreAPI.hasWriteCapableReader();
        }

        if (!hasWriteCapability) {
          toast.error(t("write.noWriteMethodAvailable"));
          isProcessingRef.current = false;
          return;
        }

        logger.log("Processing NFC write:", currentWriteValue);
        setWriteOpen(true);
        await nfcWriter.write(WriteAction.Write, currentWriteValue);
        isProcessingRef.current = false;
      } catch (error) {
        logger.error("Write capability check failed:", error, {
          category: "nfc",
          action: "checkWriteCapability",
        });
        throw error;
      }
    };

    const checkNfcAndWrite = () => {
      checkWriteCapabilityAndWrite().catch((e) => {
        if (retryCount < maxRetries) {
          retryCount++;
          logger.log(
            `NFC not ready, retrying (${retryCount}/${maxRetries})...`,
          );
          timeoutRef.current = setTimeout(checkNfcAndWrite, retryInterval);
        } else {
          logger.error("NFC write failed after retries", e, {
            category: "nfc",
            action: "writeQueue",
            retryCount,
            maxRetries,
          });
          toast.error(e.message);
          isProcessingRef.current = false;
        }
      });
    };

    // Process immediately - NFC availability is already checked during app hydration
    checkNfcAndWrite();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [
    writeQueue,
    nfcWriter,
    t,
    setWriteQueue,
    setWriteOpen,
    nfcAvailable,
    connected,
  ]);

  const reset = () => {
    isProcessingRef.current = false;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  return { reset };
}
