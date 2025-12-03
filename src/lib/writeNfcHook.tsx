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
  Status,
} from "./nfc";
import { CoreAPI } from "./coreApi.ts";
import { logger } from "./logger";

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
  RemoteReader = "remote",
}

export enum WriteAction {
  Write = "write",
  Read = "read",
  Format = "format",
  Erase = "erase",
  MakeReadOnly = "makeReadOnly",
}

function coreWrite(text: string, signal?: AbortSignal): Promise<Result> {
  if (signal?.aborted) {
    return Promise.resolve({
      status: Status.Cancelled,
      info: {
        rawTag: null,
        tag: null,
      },
    });
  }

  return CoreAPI.write({ text }, signal)
    .then((result) => {
      // Check if the result indicates cancellation
      if (result && typeof result === "object" && "cancelled" in result) {
        return {
          status: Status.Cancelled,
          info: {
            rawTag: null,
            tag: null,
          },
        };
      } else {
        return {
          status: Status.Success,
          info: {
            rawTag: null,
            tag: null,
          },
        };
      }
    })
    .catch((e) => {
      throw e;
    });
}

async function determineWriteMethod(
  preferredMethod: WriteMethod,
  preferRemoteWriter: boolean,
): Promise<WriteMethod> {
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
      logger.error("NFC availability check failed:", error, {
        category: "nfc",
        action: "determineWriteMethod",
        severity: "warning",
      });
    }
  }

  // Fallback to remote reader if available
  if (hasRemoteWriter) {
    return WriteMethod.RemoteReader;
  }

  // Default fallback (will likely fail, but maintains existing behavior)
  return isNativePlatform ? WriteMethod.LocalNFC : WriteMethod.RemoteReader;
}

export function useNfcWriter(
  writeMethod: WriteMethod = WriteMethod.Auto,
  preferRemoteWriter: boolean = false,
): WriteNfcHook {
  const [writing, setWriting] = useState(false);
  const [result, setResult] = useState<null | Result>(null);
  const [status, setStatus] = useState<null | Status>(null);
  const [currentWriteMethod, setCurrentWriteMethod] =
    useState<WriteMethod | null>(null);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);

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
            logger.error("No text provided to write", {
              category: "nfc",
              action: "writeValidation",
            });
            return;
          }

          const selectedWriteMethod = await determineWriteMethod(
            writeMethod,
            preferRemoteWriter,
          );
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
            logger.error("Format is only supported on Android", {
              category: "nfc",
              action: "formatPlatformCheck",
              platform: Capacitor.getPlatform(),
              severity: "warning",
            });
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
          setWriting(false);
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
                  <span className="text-success pr-1">
                    <CheckIcon size="24" />
                  </span>
                ),
                duration: showMs,
              },
            );
            setResult(result);
            setStatus(Status.Success);
          }
        })
        .catch((e: Error) => {
          setWriting(false);
          logger.error("NFC write operation failed", e, {
            category: "nfc",
            action: action,
            writeMethod: currentWriteMethod,
          });
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
                <span className="text-error pr-1">
                  <WarningIcon size="24" />
                </span>
              ),
              duration: showMs,
            },
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
            logger.error("Failed to cancel remote write:", error, {
              category: "nfc",
              action: "cancelRemoteWrite",
            });
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
    status,
  };
}
