import { useEffect, useState } from "react";
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
import toast from "react-hot-toast";
import { CheckIcon, WarningIcon } from "./images";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { CoreAPI } from "./coreApi.ts";

interface WriteNfcHook {
  write: (action: WriteAction, text?: string) => void;
  end: () => void;
  writing: boolean;
  result: null | Result;
  status: null | Status;
}

export enum WriteAction {
  Write = "write",
  Read = "read",
  Format = "format",
  Erase = "erase",
  MakeReadOnly = "makeReadOnly"
}

function coreWrite(text: string): Promise<Result> {
  return new Promise((resolve, reject) => {
    CoreAPI.write({ text })
      .then(() => {
        resolve({
          status: Status.Success,
          info: {
            rawTag: null,
            tag: null
          }
        });
      })
      .catch((e) => {
        reject(e);
      });
  });
}

export function useNfcWriter(): WriteNfcHook {
  const [writing, setWriting] = useState(false);
  const [result, setResult] = useState<null | Result>(null);
  const [status, setStatus] = useState<null | Status>(null);

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
    write: (action: WriteAction, text?: string) => {
      let actionFunc = readRaw;
      let toastSuccess = t("spinner.writeSuccess");
      let toastFailed = t("spinner.writeFailed");

      switch (action) {
        case WriteAction.Write:
          if (!text) {
            console.error("No text provided to write");
            return;
          }

          if (Capacitor.isNativePlatform()) {
            actionFunc = () => writeTag(text);
          } else {
            actionFunc = () => coreWrite(text);
          }

          toastSuccess = t("spinner.writeSuccess");
          toastFailed = t("spinner.writeFailed");

          break;
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
                <span
                  className="flex flex-grow flex-col"
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
        .catch(() => {
          let showMs = 4000;
          if (Capacitor.getPlatform() === "ios") {
            showMs += 4000;
          }
          toast.error(
            (to) => (
              <span
                className="flex flex-grow flex-col"
                onClick={() => toast.dismiss(to.id)}
              >
                <span>{toastFailed}</span>
              </span>
            ),
            {
              id: "writeFailed",
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
    end: () => {
      cancelSession();
      setStatus(null);
    },
    writing,
    result,
    status
  };
}
