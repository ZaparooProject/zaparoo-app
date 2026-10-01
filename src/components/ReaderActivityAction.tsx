import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { NfcIcon } from "lucide-react";
import { Button } from "@/components/wui/Button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useAnnouncer } from "@/components/A11yAnnouncer";
import { CreateIcon } from "@/lib/images";
import type { ReaderActivityState } from "@/components/ReaderActivityControl";

function messageKey(state: ReaderActivityState) {
  return state === "error"
    ? "spinner.verifyFailedRetry"
    : state === "attention"
      ? "spinner.retapTag"
      : "spinner.holdTagReader";
}

/** Reader interaction sized and captioned like the other action-rail buttons. */
export function ReaderActivityAction({
  state,
  label,
  idleAriaLabel,
  preparing = false,
  preparingLabel,
  disabled = false,
  busy = false,
  onStart,
  onCancel,
  onRetry,
}: {
  state: ReaderActivityState;
  label: string;
  idleAriaLabel?: string;
  preparing?: boolean;
  preparingLabel?: string;
  disabled?: boolean;
  busy?: boolean;
  onStart: () => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const { announce } = useAnnouncer();
  const previousState = useRef<ReaderActivityState>("idle");
  useEffect(() => {
    if (previousState.current === state) return;
    previousState.current = state;
    if (state !== "idle") announce(t(messageKey(state)), "assertive");
  }, [state, t, announce]);
  const waiting = state === "waiting" || state === "attention";

  return (
    <Button
      label={
        waiting ? t("nav.cancel") : state === "error" ? t("scan.retry") : label
      }
      labelAlternatives={[label, t("nav.cancel"), t("scan.retry")]}
      aria-label={
        waiting
          ? t("reader.cancelAction")
          : state === "error"
            ? t("scan.retry")
            : preparing
              ? (preparingLabel ?? t("loading"))
              : (idleAriaLabel ?? label)
      }
      aria-pressed={waiting || undefined}
      aria-busy={waiting || preparing || undefined}
      icon={
        preparing ? (
          <LoadingSpinner size={20} decorative />
        ) : state === "idle" ? (
          <CreateIcon size="20" />
        ) : (
          <NfcIcon size={20} />
        )
      }
      variant="text"
      layout="responsive"
      className="wui-reader-action whitespace-nowrap"
      readerState={state === "idle" ? undefined : state}
      disabled={state === "idle" && (disabled || preparing || busy)}
      disabledAppearance={preparing || busy ? "busy" : "unavailable"}
      onClick={waiting ? onCancel : state === "error" ? onRetry : onStart}
    />
  );
}

/** Only re-tap and verification recovery need instructions beyond the caption. */
export function ReaderActivityStatus({
  state,
  onCancel,
}: {
  state: ReaderActivityState;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  if (state !== "attention" && state !== "error") return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <p
        className={
          state === "error"
            ? "text-error min-w-0 flex-1"
            : "text-muted-foreground min-w-0 flex-1"
        }
      >
        {t(messageKey(state))}
      </p>
      {state === "error" && (
        <Button label={t("nav.cancel")} variant="text" onClick={onCancel} />
      )}
    </div>
  );
}
