import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Button } from "@/components/wui/Button";
import { ModalActionBar } from "@/components/wui/ModalActionBar";
import { SlideModal } from "@/components/SlideModal";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { CoreAPI, isRequestCancelledError, logRunFailure } from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";
import { ZAP_BUTTON_ICON_COMPONENTS } from "@/components/home/zapButtonIcons";
import type { ZapButton } from "@/lib/zapLayout";

const SIZE_CLASS = {
  small: "min-h-[4.5rem]",
  medium: "min-h-[4.5rem]",
  large: "min-h-32",
} as const;

/** The button as it looks, without the behaviour of running anything. */
export function ZapButtonFace({
  button,
  disabled = false,
  running = false,
  onClick,
}: {
  button: ZapButton;
  disabled?: boolean;
  /** The script is executing: the button is held and shows it is working. */
  running?: boolean;
  onClick?: () => void;
}) {
  const { t } = useTranslation();
  const Icon = button.icon ? ZAP_BUTTON_ICON_COMPONENTS[button.icon] : null;
  const label = button.label || undefined;

  return (
    <Button
      variant={
        button.style === "secondary"
          ? "secondary"
          : button.style === "destructive"
            ? "outline"
            : "fill"
      }
      intent={
        button.style === "primary"
          ? "primary"
          : button.style === "destructive"
            ? "destructive"
            : undefined
      }
      shape="square"
      layout={button.size === "large" ? "stacked" : "inline"}
      className={`zap-button-face h-full w-full max-w-none ${SIZE_CLASS[button.size]}`}
      icon={
        running ? (
          <LoadingSpinner decorative size={button.size === "large" ? 28 : 20} />
        ) : Icon ? (
          <Icon size={button.size === "large" ? 28 : 20} />
        ) : undefined
      }
      label={label}
      aria-label={label ?? t("zapLayout.buttonUnnamed")}
      disabled={disabled || running}
      disabledAppearance={running ? "busy" : undefined}
      aria-busy={running || undefined}
      onClick={onClick}
    />
  );
}

/** A custom button on the Zap page: pressing it runs its ZapScript. */
export function ZapButtonWidget({ button }: { button: ZapButton }) {
  const { t } = useTranslation();
  const connected = useStatusStore((state) => state.connected);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const name = button.label || t("zapLayout.buttonUnnamed");

  // Core answers once the script has finished, so the button is held and shows
  // it is working until then; that also stops a second press starting another.
  const run = () => {
    setRunning(true);
    CoreAPI.run({ uid: "", text: button.script })
      .catch((error) => {
        // A cancelled request only means Core stopped waiting, so the script
        // may still have run; it is not reported as a failure.
        if (!isRequestCancelledError(error)) {
          toast.error(t("create.custom.failMsg"));
        }
        logRunFailure("Zap button run failed:", error, {
          action: "runZapButton",
        });
      })
      .finally(() => {
        if (mounted.current) setRunning(false);
      });
  };

  return (
    <>
      <ZapButtonFace
        button={button}
        disabled={!connected || button.script === ""}
        running={running}
        onClick={() => (button.confirm ? setConfirming(true) : run())}
      />
      <SlideModal
        isOpen={confirming}
        close={() => setConfirming(false)}
        title={t("zapLayout.confirmRunTitle", { name })}
        footer={
          <ModalActionBar
            secondaryAction={
              <Button
                variant="secondary"
                label={t("nav.cancel")}
                onClick={() => setConfirming(false)}
              />
            }
            primaryAction={
              <Button
                intent="primary"
                label={t("zapLayout.confirmRun")}
                onClick={() => {
                  setConfirming(false);
                  run();
                }}
              />
            }
          />
        }
      >
        {null}
      </SlideModal>
    </>
  );
}
