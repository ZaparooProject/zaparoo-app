import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { useContextualNfcWrite } from "@/hooks/useContextualNfcWrite";
import {
  ReaderActivityAction,
  ReaderActivityStatus,
} from "@/components/ReaderActivityAction";
import { Button } from "@/components/wui/Button";
import { ModalActionRail } from "@/components/wui/ModalActionRail";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { PlayIcon } from "@/lib/images";

type ContextualWriteActivity = ReturnType<typeof useContextualNfcWrite>;

/**
 * The action rail shared by every surface that writes its own value in place:
 * neighbouring actions, the latching Write action, and recovery status.
 */
export function ContextualWriteRail(props: {
  "aria-label": string;
  activity: ContextualWriteActivity;
  /** Why Write cannot start, besides another write already being active. */
  writeDisabled: boolean;
  /** Another action on this surface is in flight. */
  busy?: boolean;
  preparing?: boolean;
  preparingLabel?: string;
  onWrite: () => void;
  /** Rail actions before Write. */
  children?: ReactNode;
  /** Rail actions after Write. */
  trailingActions?: ReactNode;
  primaryAction?: ReactNode;
}) {
  const { t } = useTranslation();
  const { activity } = props;
  return (
    <ModalActionRail
      aria-label={props["aria-label"]}
      readerAction
      status={
        activity.state === "attention" || activity.state === "error" ? (
          <ReaderActivityStatus
            state={activity.state}
            onCancel={() => void activity.cancel()}
          />
        ) : undefined
      }
      actions={
        <>
          {props.children}
          <ReaderActivityAction
            state={activity.state}
            label={t("library.writeAction")}
            idleAriaLabel={t("library.write")}
            preparing={props.preparing}
            preparingLabel={props.preparingLabel}
            busy={props.busy}
            disabled={
              props.writeDisabled ||
              Boolean(props.busy) ||
              activity.externalWriteActive
            }
            onStart={props.onWrite}
            onCancel={() => void activity.cancel()}
            onRetry={() => void activity.retry()}
          />
          {props.trailingActions}
        </>
      }
      primaryAction={props.primaryAction}
    />
  );
}

/** Primary launch action beside a contextual write. */
export function LaunchButton(props: {
  label: string;
  launching: boolean;
  /** The launch target or live connection is absent. */
  unavailable: boolean;
  /** Another action on this surface temporarily owns the device. */
  busy: boolean;
  onLaunch: () => void;
}) {
  const { t } = useTranslation();
  const locked = props.launching || props.busy;
  return (
    <Button
      label={props.label}
      aria-label={props.launching ? t("library.launching") : props.label}
      icon={
        props.launching ? (
          <LoadingSpinner size={20} decorative />
        ) : (
          <PlayIcon size="20" />
        )
      }
      intent="primary"
      disabled={props.unavailable || locked}
      disabledAppearance={locked ? "busy" : "unavailable"}
      onClick={props.onLaunch}
    />
  );
}
