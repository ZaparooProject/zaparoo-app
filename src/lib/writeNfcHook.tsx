import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { CheckIcon, WarningIcon } from "./images";
import {
  cancelSession,
  eraseTag,
  formatTag,
  makeReadOnly,
  readRaw,
  writeTag,
  Result,
  Status
} from "./nfc";
import { CoreAPI } from "./coreApi.ts";

interface WriteNfcHook {
  write: (action: WriteAction, text?: string) => Promise<void>;
  end: () => Promise<void>;
  writing: boolean;
  result: null | Result;
  status: null | Status;
}

export enum WriteMethod {
  Auto = "auto",
  LocalNFC = "local",
  RemoteReader = "remote"
}

export enum WriteAction {
  Write = "write",
  Read = "read",
  Format = "format",
  Erase = "erase",
  MakeReadOnly = "makeReadOnly"
}

function coreWrite(text: string, signal?: AbortSignal): Promise<Result> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      resolve({
        status: Status.Cancelled,
        info: {
          rawTag: null,
          tag: null
        }
      });
      return;
    }

    let wasAborted = false;

    const abortHandler = () => {
      wasAborted = true;
      reject(new Error("Write operation cancelled"));
    };

    signal?.addEventListener('abort', abortHandler);

    CoreAPI.write({ text })
      .then(() => {
        signal?.removeEventListener('abort', abortHandler);
        if (!wasAborted) {
          resolve({
            status: Status.Success,
            info: {
              rawTag: null,
              tag: null
            }
          });
        }
      })
      .catch((e) => {
        signal?.removeEventListener('abort', abortHandler);
        // Only reject if not aborted - abort handler already rejected it
        if (!wasAborted) {
          reject(e);
        }
      });
  });
}

async function determineWriteMethod(preferredMethod: WriteMethod, preferRemoteWriter: boolean): Promise<WriteMethod> {
  if (preferredMethod !== WriteMethod.Auto) {
    return preferredMethod;
  }

  // Auto-detection logic based on user preference and capabilities
  const isNativePlatform = Capacitor.isNativePlatform();
  const hasRemoteWriter = await CoreAPI.hasWriteCapableReader();

  // If user prefers remote writer and it's available, use it
  if (preferRemoteWriter && hasRemoteWriter) {
    return WriteMethod.RemoteReader;
  }

  // If on native platform and has NFC, use local (unless user prefers remote)
  if (isNativePlatform) {
    try {
      const nfcAvailable = await Nfc.isAvailable();
      if (nfcAvailable.nfc) {
        return WriteMethod.LocalNFC;
      }
    } catch (error) {
      console.log("NFC availability check failed:", error);
    }
  }

  // Fallback to remote reader if available
  if (hasRemoteWriter) {
    return WriteMethod.RemoteReader;
  }

  // Default fallback (will likely fail, but maintains existing behavior)
  return isNativePlatform ? WriteMethod.LocalNFC : WriteMethod.RemoteReader;
}

export function useNfcWriter(writeMethod: WriteMethod = WriteMethod.Auto, preferRemoteWriter: boolean = false): WriteNfcHook {
  const [writing, setWriting] = useState(false);
  const [result, setResult] = useState<null | Result>(null);
  const [status, setStatus] = useState<null | Status>(null);
  const [currentWriteMethod, setCurrentWriteMethod] = useState<WriteMethod | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const { t } = useTranslation();

  useEffect(() => {
    return () => {
      cancelSession();
      setResult(null);
      setWriting(false);
      setStatus(null);
    };
  }, []);

  return {
    write: async (action: WriteAction, text?: string) => {
      // Clear any previous state before starting a new write operation
      setStatus(null);
      setResult(null);
      setWriting(false);

      // Clean up any existing AbortController before creating new one
      if (abortController && !abortController.signal.aborted) {
        abortController.abort();
      }

      // Create new AbortController for this write operation
      const controller = new AbortController();
      setAbortController(controller);

      let actionFunc = readRaw;
      let toastSuccess = t("spinner.writeSuccess");
      let toastFailed = t("spinner.writeFailed");

      switch (action) {
        case WriteAction.Write: {
          if (!text) {
            console.error("No text provided to write");
            return;
          }

          const selectedWriteMethod = await determineWriteMethod(writeMethod, preferRemoteWriter);
          setCurrentWriteMethod(selectedWriteMethod);

          if (selectedWriteMethod === WriteMethod.LocalNFC) {
            actionFunc = () => writeTag(text);
          } else {
            actionFunc = () => coreWrite(text, controller.signal);
          }

          toastSuccess = t("spinner.writeSuccess");
          toastFailed = t("spinner.writeFailed");

          break;
        }
        case WriteAction.Read:
          actionFunc = readRaw;
          toastSuccess = t("spinner.readSuccess");
          toastFailed = t("spinner.readFailed");
          break;
        case WriteAction.Format:
          if (Capacitor.getPlatform() !== "android") {
            console.error("Format is only supported on Android");
            return;
          }
          actionFunc = formatTag;
          toastSuccess = t("spinner.formatSuccess");
          toastFailed = t("spinner.formatFailed");
          break;
        case WriteAction.Erase:
          actionFunc = eraseTag;
          toastSuccess = t("spinner.eraseSuccess");
          toastFailed = t("spinner.eraseFailed");
          break;
        case WriteAction.MakeReadOnly:
          actionFunc = makeReadOnly;
          toastSuccess = t("spinner.makeReadOnlySuccess");
          toastFailed = t("spinner.makeReadOnlyFailed");
          break;
      }

      setWriting(true);
      actionFunc()
        .then((result) => {
          if (result.status === Status.Cancelled) {
            setStatus(Status.Cancelled);
          } else {
            let showMs = 2000;
            if (Capacitor.getPlatform() === "ios") {
              showMs += 4000;
            }
            toast.success(
              (to) => (
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
                <span
                  className="flex grow flex-col"
                  onClick={() => toast.dismiss(to.id)}
                >
                  <span>{toastSuccess}</span>
                </span>
              ),
              {
                id: "writeSuccess",
                icon: (
                  <span className="pr-1 text-success">
                    <CheckIcon size="24" />
                  </span>
                ),
                duration: showMs
              }
            );
            setResult(result);
            setStatus(Status.Success);
          }
        })
        .catch((e: Error) => {
          let showMs = 4000;
          if (Capacitor.getPlatform() === "ios") {
            showMs += 4000;
          }
          toast.error(
            (to) => (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
              <span
                className="flex grow flex-col"
                onClick={() => toast.dismiss(to.id)}
              >
                <span>{toastFailed}</span>
                <span>{e.message}</span>
              </span>
            ),
            {
              icon: (
                <span className="pr-1 text-error">
                  <WarningIcon size="24" />
                </span>
              ),
              duration: showMs
            }
          );
          setStatus(Status.Error);
        });
    },
    end: async () => {
      // Cancel pending write requests FIRST while pendingWriteId is still valid
      if (currentWriteMethod !== null) {
        CoreAPI.cancelWrite();

        // Then cancel based on the current write method being used
        if (currentWriteMethod === WriteMethod.RemoteReader) {
          // CoreAPI.cancelWrite() already calls readersWriteCancel(), but we can add extra safety
          try {
            await CoreAPI.readersWriteCancel();
          } catch (error) {
            console.error("Failed to cancel remote write:", error);
          }
        } else {
          // For local NFC or when method is unknown, use the existing cancellation
          await cancelSession();
        }
      }

      // Abort promise operations AFTER cancelling API requests
      if (abortController && !abortController.signal.aborted) {
        abortController.abort();
      }

      setCurrentWriteMethod(null);
      setAbortController(null);
      setStatus(null);
      setWriting(false);
    },
    writing,
    result,
    status
  };
}
