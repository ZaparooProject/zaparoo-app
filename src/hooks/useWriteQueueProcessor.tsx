import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Capacitor } from "@capacitor/core";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { WriteAction, useNfcWriter, WriteMethod } from "@/lib/writeNfcHook";
import { useStatusStore } from "../lib/store";
import { usePreferencesStore } from "../lib/preferencesStore";
import { CoreAPI } from "../lib/coreApi";
import { logger } from "../lib/logger";

interface UseWriteQueueProcessorReturn {
  reset: () => void;
}

export function useWriteQueueProcessor(): UseWriteQueueProcessorReturn {
  const { t } = useTranslation();
  const writeQueue = useStatusStore((state) => state.writeQueue);
  const setWriteQueue = useStatusStore((state) => state.setWriteQueue);
  const setWriteOpen = useStatusStore((state) => state.setWriteOpen);
  const preferRemoteWriter = usePreferencesStore(
    (state) => state.preferRemoteWriter,
  );
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

        // Check local NFC if on native platform
        if (Capacitor.isNativePlatform()) {
          try {
            const nfcAvailable = await Nfc.isAvailable();
            hasWriteCapability = nfcAvailable.nfc;
          } catch (error) {
            logger.error("NFC availability check failed:", error, {
              category: "nfc",
              action: "checkAvailability",
              severity: "warning",
            });
          }
        }

        // Check remote readers if local NFC not available
        if (!hasWriteCapability) {
          hasWriteCapability = await CoreAPI.hasWriteCapableReader();
        }

        if (!hasWriteCapability) {
          toast.error((to) => (
            <span
              className="flex grow cursor-pointer flex-col"
              onClick={() => toast.dismiss(to.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toast.dismiss(to.id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              {t("write.noWriteMethodAvailable")}
            </span>
          ));
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
          toast.error((to) => (
            <span
              className="flex grow cursor-pointer flex-col"
              onClick={() => toast.dismiss(to.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toast.dismiss(to.id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              {e.message}
            </span>
          ));
          isProcessingRef.current = false;
        }
      });
    };

    timeoutRef.current = setTimeout(checkNfcAndWrite, 1000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [writeQueue, nfcWriter, t, setWriteQueue, setWriteOpen]);

  const reset = () => {
    isProcessingRef.current = false;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  return { reset };
}
