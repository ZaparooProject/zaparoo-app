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

  const readerIcon = (
    <NfcIcon className="wui-reader-signal" size={readerIconSize} />
  );
  const active = state === "waiting" || state === "attention";
  const statusText =
    state === "error"
      ? t("spinner.verifyFailed")
      : active && showCancelHint
        ? t("reader.pressAgainToCancel")
        : "";

  return (
    <div className={classNames("flex flex-col gap-1", className)}>
      {state === "error" ? (
        <div className="mx-auto flex w-full max-w-80 gap-2">
          <div
            className="wui-reader-button-shell min-w-0 flex-1"
            data-reader-state="error"
          >
            <Button
              label={t("scan.retry")}
              icon={readerIcon}
              readerState="error"
              intent="destructive"
              className={classNames("w-full", buttonClassName)}
              onClick={onRetry ?? onStart}
            />
          </div>
          <Button
            label={t("nav.cancel")}
            variant="outline"
            className="min-w-0 flex-1"
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
            variant={variant}
            intent={intent}
            size={size}
            layout={layout}
            className={classNames("w-full", buttonClassName)}
            disabled={disabled}
            onClick={active ? onCancel : onStart}
          />
        </div>
      )}
      <span
        className={classNames(
          "min-h-5 text-center text-xs leading-5",
          statusText ? "text-muted-foreground" : "invisible",
          state === "error" && "text-error",
        )}
        aria-hidden="true"
      >
        {statusText || "\u00a0"}
      </span>
    </div>
  );
}
