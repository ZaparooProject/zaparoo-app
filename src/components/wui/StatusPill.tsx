import classNames from "classnames";
import { forwardRef, memo, type ReactNode } from "react";
import { useTactilePress } from "@/hooks/useTactilePress";

interface StatusPillProps {
  /** Status indicator, coloured by the caller and never the only cue. */
  dot: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  "aria-label": string;
  "aria-expanded"?: boolean;
  "aria-haspopup"?: "dialog";
  className?: string;
}

export const StatusPill = memo(
  forwardRef<HTMLButtonElement, StatusPillProps>(
    function StatusPill(props, ref) {
      const { pressed, shouldFireClick, handlers } = useTactilePress({
        disabled: props.disabled,
        hasOnClick: true,
      });

      return (
        <button
          ref={ref}
          type="button"
          className={classNames(
            "wui-button wui-status-pill touch-manipulation",
            props.className,
          )}
          data-variant="outline"
          data-intent="default"
          data-pressed={pressed}
          aria-label={props["aria-label"]}
          aria-expanded={props["aria-expanded"]}
          aria-haspopup={props["aria-haspopup"]}
          disabled={props.disabled}
          onClick={() => {
            if (shouldFireClick()) {
              props.onClick();
            }
          }}
          {...handlers}
        >
          <span className="wui-header-button-content flex min-w-0 items-center gap-2">
            <span className="flex shrink-0 items-center" aria-hidden="true">
              {props.dot}
            </span>
            <span className="min-w-0 truncate">{props.label}</span>
          </span>
        </button>
      );
    },
  ),
);
