import classNames from "classnames";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { ScanResult } from "@/lib/models";
import { DownIcon, SettingsIcon, WarningIcon } from "@/lib/images";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { Card } from "./wui/Card";
import { Button } from "./wui/Button";

export const successColor = "#00FF29";
export const errorColor = "#FF7E92";
export const primaryColor = "#3faeec";
const IDLE_PULSE_DURATION_MS = 15000;

export function ScanSpinner(props: {
  status: ScanResult;
  spinning?: boolean;
  write?: boolean;
  onScan?: () => void;
}) {
  const nfcSupported = usePreferencesStore((state) => state.nfcAvailable);
  const [nfcEnabled, setNfcEnabled] = useState(true);
  // The idle "press to scan" pulse runs briefly after landing or after a scan
  // ends, then holds still: a looping animation keeps the GPU drawing frames
  // for as long as the page is open, which on the always-on Zap page is hours.
  const [idlePulseActive, setIdlePulseActive] = useState(true);
  const [wasSpinning, setWasSpinning] = useState(props.spinning);
  if (props.spinning !== wasSpinning) {
    setWasSpinning(props.spinning);
    if (!props.spinning) setIdlePulseActive(true);
  }

  const { t } = useTranslation();

  useEffect(() => {
    // Only check if NFC is enabled on Android
    if (import.meta.env.PROD && Capacitor.getPlatform() === "android") {
      Nfc.isEnabled().then((enabled) => {
        setNfcEnabled(enabled.isEnabled);
      });
    }
  }, []);

  useEffect(() => {
    if (props.spinning || !idlePulseActive) return;
    const timer = setTimeout(
      () => setIdlePulseActive(false),
      IDLE_PULSE_DURATION_MS,
    );
    return () => clearTimeout(timer);
  }, [props.spinning, idlePulseActive]);

  // NFC not supported - return null to let parent handle graceful degradation
  if (!nfcSupported && Capacitor.isNativePlatform()) {
    return null;
  }

  if (!nfcEnabled) {
    return (
      <Card className="mx-2 mb-5">
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="text-error px-1.5">
            <WarningIcon size="24" />
          </div>
          <div className="flex grow flex-col text-left">
            <span className="font-semibold">
              {t("spinner.nfcDisabledLabel")}
            </span>
            <span className="text-sm">{t("spinner.nfcDisabledSub")}</span>
          </div>
          <Button
            icon={<SettingsIcon size="24" />}
            aria-label={t("spinner.openNfcSettings")}
            variant="text"
            onClick={() => Nfc.openSettings()}
          />
        </div>
      </Card>
    );
  }

  const borderColor =
    props.status === ScanResult.Success
      ? successColor
      : props.status === ScanResult.Error
        ? errorColor
        : primaryColor;
  const rotation = (period: string) =>
    props.spinning ? `spinner ${period} infinite linear` : "none";
  const showIdlePulse = !props.spinning && idlePulseActive;
  // Every layer sits in one grid cell with its own glow, so no filter has an
  // animating descendant. With one glow wrapping the nested layers, the whole
  // filtered group had to be redrawn every frame and the scan animation ran
  // well below the display refresh rate. The layers used to be nested, so
  // their rotations added up: 1/20 + 1/30 = 1/12 turn/s and
  // 1/20 + 1/30 + 1/40 = 13/120 turn/s.
  const square =
    "rounded-[16px] border-[3px] border-solid border-primary drop-shadow-[0_0_20px_var(--color-primary)] [grid-area:1/1]";

  const spinner = (
    <div>
      <p className="text-3xl">
        {props.write
          ? Capacitor.isNativePlatform()
            ? t("spinner.holdTag")
            : t("spinner.holdTagReader")
          : props.spinning
            ? t("spinner.scanning")
            : t("spinner.pressToScan")}
      </p>
      <div className="flex h-[25px] justify-center">
        {!props.spinning && <DownIcon size="24" />}
      </div>
      <div className="flex justify-center pt-1">
        <div className="grid h-[95px] w-[95px] place-items-center">
          <div
            style={{ borderColor, animation: rotation("20s") }}
            className={classNames("h-[95px] w-[95px]", square)}
          />
          <div
            style={{ borderColor, animation: rotation("12s") }}
            className={classNames("h-[69px] w-[69px]", square)}
          />
          <div
            style={{ borderColor, animation: rotation(`${120 / 13}s`) }}
            className={classNames("h-[51px] w-[51px]", square)}
          />
          <div
            className="h-7 w-7 rounded-full [grid-area:1/1]"
            style={{
              display: props.spinning ? "none" : "block",
              backgroundColor: "var(--color-border-outline)",
              opacity: 0,
              filter: "blur(2px)",
              animation: showIdlePulse
                ? "attention 5s infinite linear"
                : "none",
              transformOrigin: "center",
              willChange: showIdlePulse ? "opacity, transform" : undefined,
            }}
          ></div>
        </div>
      </div>
    </div>
  );

  // The idle state wraps the spinner in an inline-block button. Top alignment
  // keeps it off the text baseline so it is the same height as the scanning
  // state and switching between them does not shift the page.
  return props.onScan && !props.spinning ? (
    <button
      type="button"
      onClick={props.onScan}
      aria-label={t("spinner.pressToScan")}
      className="focus-visible:ring-offset-background inline-block cursor-pointer rounded-full align-top focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-4 focus-visible:outline-none"
    >
      {spinner}
    </button>
  ) : (
    spinner
  );
}
