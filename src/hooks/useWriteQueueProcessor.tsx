import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Capacitor } from "@capacitor/core";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { WriteAction } from "@/lib/writeNfcHook";
import { Status } from "@/lib/nfc.ts";
import { useStatusStore } from "../lib/store";
import { CoreAPI } from "../lib/coreApi";

interface UseWriteQueueProcessorProps {
  nfcWriter: {
    write: (action: WriteAction, content: string) => Promise<void>;
    end: () => Promise<void>;
    status: Status | null;
  };
  setWriteOpen: (open: boolean) => void;
}

interface UseWriteQueueProcessorReturn {
  reset: () => void;
}

export function useWriteQueueProcessor({
  nfcWriter,
  setWriteOpen
}: UseWriteQueueProcessorProps): UseWriteQueueProcessorReturn {
  const { t } = useTranslation();
  const writeQueue = useStatusStore((state) => state.writeQueue);
  const setWriteQueue = useStatusStore((state) => state.setWriteQueue);

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
      nfcWriter.end().catch(console.error);
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
            console.log("NFC availability check failed:", error);
          }
        }

        // Check remote readers if local NFC not available
        if (!hasWriteCapability) {
          hasWriteCapability = await CoreAPI.hasWriteCapableReader();
        }

        if (!hasWriteCapability) {
          toast.error((to) => (
            <span
              className="flex grow flex-col cursor-pointer"
              onClick={() => toast.dismiss(to.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
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

        console.log("Processing NFC write:", currentWriteValue);
        setWriteOpen(true);
        await nfcWriter.write(WriteAction.Write, currentWriteValue);
        isProcessingRef.current = false;
      } catch (error) {
        console.error("Write capability check failed:", error);
        throw error;
      }
    };

    const checkNfcAndWrite = () => {
      checkWriteCapabilityAndWrite()
        .catch((e) => {
          if (retryCount < maxRetries) {
            retryCount++;
            console.log(
              `NFC not ready, retrying (${retryCount}/${maxRetries})...`
            );
            timeoutRef.current = setTimeout(checkNfcAndWrite, retryInterval);
          } else {
            toast.error((to) => (
              <span
                className="flex grow flex-col cursor-pointer"
                onClick={() => toast.dismiss(to.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
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
