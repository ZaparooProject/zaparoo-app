import type { ReactElement } from "react";
import { useEffect, useRef } from "react";
import classNames from "classnames";
import { useTranslation } from "react-i18next";
import { TriangleAlertIcon } from "lucide-react";
import { NfcIcon } from "@/lib/images";
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
  /** Announced when the control enters the error state. */
  errorMessage?: string;
  /** Visible status inside the Retry face. Defaults to the verify failure. */
  errorText?: string;
  /** Replaces Retry, for an error with a better way forward. Cancel stays. */
  errorAction?: { label: string; onClick: () => void };
  /** Icon while waiting. Defaults to the NFC reader icon. */
  activeIcon?: ReactElement;
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
  errorText,
  errorAction,
  activeIcon,
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

  const readerIcon = activeIcon ?? <NfcIcon size={readerIconSize} />;
  const active = state === "waiting" || state === "attention";
  const statusText =
    state === "error"
      ? (errorText ?? t("spinner.verifyFailed"))
      : active && showCancelHint
        ? t("reader.pressAgainToCancel")
        : "";

  return (
    <div className={classNames("w-full", className)}>
      {state === "error" ? (
        <div className="wui-reader-actions wui-action-grid w-full">
          <div
            className="wui-reader-button-shell min-w-0"
            data-reader-state="error"
          >
            {/* The way forward keeps the colour of the button it replaces.
                The icon and the reason carry the error; red would read as
                the way out. */}
            <Button
              label={errorAction?.label ?? t("scan.retry")}
              icon={<TriangleAlertIcon size={readerIconSize} aria-hidden />}
              readerState="error"
              readerStatus={statusText}
              variant={variant}
              intent={intent}
              size={size}
              layout={layout}
              className={classNames("min-h-18 w-full", buttonClassName)}
              onClick={errorAction?.onClick ?? onRetry ?? onStart}
            />
          </div>
          <Button
            label={t("nav.cancel")}
            variant="secondary"
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
