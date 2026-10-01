import type { ReactElement } from "react";
import { useEffect, useRef } from "react";
import classNames from "classnames";
import { NfcIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAnnouncer } from "@/components/A11yAnnouncer";
import {
  Button,
  type ButtonLayout,
  type ButtonReaderState,
} from "@/components/wui/Button";

export type ReaderActivityState = "idle" | ButtonReaderState;

interface ReaderActivityControlProps {
  state: ReaderActivityState;
  idleLabel: string;
  activeLabel: string;
  activeAriaLabel?: string;
  icon: ReactElement;
  onStart: () => void;
  onCancel: () => void;
  onRetry?: () => void;
  errorMessage?: string;
  variant?: "fill" | "secondary" | "outline";
  intent?: "default" | "primary" | "destructive";
  size?: "default" | "sm" | "lg";
  layout?: ButtonLayout;
  className?: string;
  buttonClassName?: string;
  showCancelHint?: boolean;
  disabled?: boolean;
  readerIconSize?: number;
  announceStateChanges?: boolean;
}

export function ReaderActivityControl({
  state,
  idleLabel,
  activeLabel,
  activeAriaLabel,
  icon,
  onStart,
  onCancel,
  onRetry,
  errorMessage,
  variant = "fill",
  intent = "primary",
  size = "default",
  layout = "inline",
  className,
  buttonClassName,
  showCancelHint = true,
  disabled = false,
  readerIconSize = 20,
  announceStateChanges = true,
}: ReaderActivityControlProps) {
  const { t } = useTranslation();
  const { announce } = useAnnouncer();
  const previousState = useRef<ReaderActivityState>("idle");

  useEffect(() => {
    if (state === previousState.current) return;
    previousState.current = state;
    if (!announceStateChanges) return;
    if (state === "waiting" || state === "attention") {
      announce(activeLabel, "assertive");
    } else if (state === "error" && errorMessage) {
      announce(errorMessage, "assertive");
    }
  }, [activeLabel, announce, announceStateChanges, errorMessage, state]);

  const readerIcon = <NfcIcon size={readerIconSize} />;
  const active = state === "waiting" || state === "attention";
  const statusText =
    state === "error"
      ? t("spinner.verifyFailed")
      : active && showCancelHint
        ? t("reader.pressAgainToCancel")
        : "";

  return (
    <div className={classNames("w-full", className)}>
      {state === "error" ? (
        <div className="wui-reader-actions grid w-full grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2">
          <div
            className="wui-reader-button-shell min-w-0"
            data-reader-state="error"
          >
            <Button
              label={t("scan.retry")}
              icon={readerIcon}
              readerState="error"
              readerStatus={statusText}
              intent="destructive"
              size={size}
              layout={layout}
              className={classNames("min-h-18 w-full", buttonClassName)}
              onClick={onRetry ?? onStart}
            />
          </div>
          <Button
            label={t("nav.cancel")}
            variant="outline"
            className="min-h-18 w-full min-w-0"
            onClick={onCancel}
          />
        </div>
      ) : (
        <div
          className="wui-reader-button-shell"
          data-reader-state={active ? state : undefined}
        >
          <Button
            label={active ? activeLabel : idleLabel}
            aria-label={
              active ? (activeAriaLabel ?? t("reader.cancelAction")) : idleLabel
            }
            aria-pressed={active || undefined}
            aria-busy={active || undefined}
            icon={active ? readerIcon : icon}
            readerState={active ? state : undefined}
            readerStatus={statusText || undefined}
            variant={variant}
            intent={intent}
            size={size}
            layout={layout}
            className={classNames("min-h-18 w-full", buttonClassName)}
            disabled={disabled}
            onClick={active ? onCancel : onStart}
          />
        </div>
      )}
    </div>
  );
}
