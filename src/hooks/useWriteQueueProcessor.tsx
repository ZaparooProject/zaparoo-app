import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { useStatusStore } from "../lib/store";
import { WriteAction } from "@/lib/writeNfcHook";
import { Status } from "@/lib/nfc.ts";

interface UseWriteQueueProcessorProps {
  nfcWriter: {
    write: (action: WriteAction, content: string) => void;
    end: () => void;
    status: Status | null;
  };
  setWriteOpen: (open: boolean) => void;
}

export function useWriteQueueProcessor({
  nfcWriter,
  setWriteOpen
}: UseWriteQueueProcessorProps) {
  const { t } = useTranslation();
  const writeQueue = useStatusStore((state) => state.writeQueue);
  const setWriteQueue = useStatusStore((state) => state.setWriteQueue);

  const isProcessingRef = useRef(false);

  useEffect(() => {
    if (writeQueue === "" || isProcessingRef.current) {
      return;
    }

    isProcessingRef.current = true;
    const currentWriteValue = writeQueue;
    setWriteQueue("");
    nfcWriter.end();

    const maxRetries = 10;
    const retryInterval = 500;
    let retryCount = 0;

    setTimeout(() => {
      const checkNfcAndWrite = () => {
        Promise.all([Nfc.isAvailable()])
          .then(([availableResult]) => {
            if (!availableResult.nfc) {
              toast.error((to) => (
                <span
                  className="flex grow flex-col"
                  onClick={() => toast.dismiss(to.id)}
                >
                  {t("write.nfcNotSupported")}
                </span>
              ));
              isProcessingRef.current = false;
              return;
            }

            console.log("Processing NFC write:", currentWriteValue);
            setWriteOpen(true);
            nfcWriter.write(WriteAction.Write, currentWriteValue);
            isProcessingRef.current = false;
          })
          .catch((e) => {
            if (retryCount < maxRetries) {
              retryCount++;
              console.log(
                `NFC not ready, retrying (${retryCount}/${maxRetries})...`
              );
              setTimeout(checkNfcAndWrite, retryInterval);
            } else {
              toast.error((to) => (
                <span
                  className="flex grow flex-col"
                  onClick={() => toast.dismiss(to.id)}
                >
                  {e.message}
                </span>
              ));
              isProcessingRef.current = false;
            }
          });
      };

      checkNfcAndWrite();
    }, 1000);
  }, [writeQueue, nfcWriter, t, setWriteQueue, setWriteOpen]);
}
