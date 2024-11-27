import classNames from "classnames";
import { ScanResult } from "../lib/models";
import { DownIcon, SettingsIcon, WarningIcon } from "../lib/images";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { useEffect, useState } from "react";
import { Card } from "./wui/Card";
import { Button } from "./wui/Button";
import { useTranslation } from "react-i18next";

export const successColor = "#00FF29";
export const errorColor = "#FF7E92";

export function ScanSpinner(props: {
  status: ScanResult;
  spinning?: boolean;
  write?: boolean;
}) {
  const [nfcSupported, setNfcSupported] = useState(true);
  const [nfcEnabled, setNfcEnabled] = useState(true);

  const { t } = useTranslation();

  useEffect(() => {
    if (import.meta.env.PROD) {
      Nfc.isSupported().then((available) => {
        setNfcSupported(available.isSupported);
      });

      Nfc.isEnabled().then((enabled) => {
        setNfcEnabled(enabled.isEnabled);
      });
    }
  }, []);

  if (!nfcSupported) {
    return (
      <Card className="mx-2 mb-2">
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="px-1.5 text-error">
            <WarningIcon size="24" />
          </div>
          <div className="flex flex-grow flex-col text-left">
            <span className="font-semibold">
              {t("spinner.notSupportedLabel")}
            </span>
            <span className="text-sm">{t("spinner.notSupportedSub")}</span>
          </div>
        </div>
      </Card>
    );
  }

  if (!nfcEnabled) {
    return (
      <Card className="mx-2 mb-5">
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="px-1.5 text-error">
            <WarningIcon size="24" />
          </div>
          <div className="flex flex-grow flex-col text-left">
            <span className="font-semibold">
              {t("spinner.nfcDisabledLabel")}
            </span>
            <span className="text-sm">{t("spinner.nfcDisabledSub")}</span>
          </div>
          <Button
            icon={<SettingsIcon size="24" />}
            variant="text"
            onClick={() => Nfc.openSettings()}
          />
        </div>
      </Card>
    );
  }

  return (
    <div>
      <p className="text-3xl">
        {props.write
          ? t("spinner.holdTag")
          : props.spinning
            ? t("spinner.scanning")
            : t("spinner.pressToScan")}
      </p>
      <div className="flex h-[25px] justify-center">
        {!props.spinning && <DownIcon size="24" />}
      </div>
      <div className="flex justify-center pt-1">
        <div
          style={{
            borderColor:
              props.status === ScanResult.Success
                ? successColor
                : props.status === ScanResult.Error
                  ? errorColor
                  : "",
            animation: props.spinning ? "spinner 20s infinite linear" : "none"
          }}
          className={classNames(
            "flex",
            `h-[95px]`,
            `w-[95px]`,
            "items-center",
            "justify-center",
            "rounded-[16px]",
            "border-[3px]",
            "border-solid",
            "border-primary",
            "drop-shadow-[0_0_20px_var(--color-primary)]"
          )}
        >
          <div
            style={{
              borderColor:
                props.status === ScanResult.Success
                  ? successColor
                  : props.status === ScanResult.Error
                    ? errorColor
                    : "",
              animation: props.spinning ? "spinner 30s infinite linear" : "none"
            }}
            className={classNames(
              "flex",
              `h-[69px]`,
              `w-[69px]`,
              "items-center",
              "justify-center",
              "rounded-[16px]",
              "border-[3px]",
              "border-solid",
              "border-primary"
            )}
          >
            <div
              style={{
                borderColor:
                  props.status === ScanResult.Success
                    ? successColor
                    : props.status === ScanResult.Error
                      ? errorColor
                      : "",
                animation: props.spinning
                  ? "spinner 40s infinite linear"
                  : "none"
              }}
              className={classNames(
                "flex",
                `h-[51px]`,
                `w-[51px]`,
                "items-center",
                "justify-center",
                "rounded-[16px]",
                "border-[3px]",
                "border-solid",
                "border-primary"
              )}
            >
              <div
                className="h-7 w-7 rounded-full bg-bd-outline"
                style={{
                  display: props.spinning ? "none" : "block",
                  opacity: 0,
                  filter: "blur(2px)",
                  animation: !props.spinning
                    ? "attention 5s infinite linear"
                    : "none"
                }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
