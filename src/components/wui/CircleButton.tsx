import classNames from "classnames";
import { forwardRef, memo, type ReactElement } from "react";
import { useTactilePress } from "@/hooks/useTactilePress";

interface CircleButtonProps {
  icon: ReactElement;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "destructive" | "pro";
  disabled?: boolean;
  className?: string;
  "aria-label": string;
}

/** Canonical raised circular icon action shared with Zaparoo Online. */
export const CircleButton = memo(
  forwardRef<HTMLButtonElement, CircleButtonProps>(
    function CircleButton(props, ref) {
      const variant = props.variant ?? "primary";
      const { pressed, shouldFireClick, handlers } = useTactilePress({
        intent:
          variant === "destructive"
            ? "destructive"
            : variant === "primary" || variant === "pro"
              ? "primary"
              : "default",
        disabled: props.disabled,
        hasOnClick: props.onClick !== undefined,
      });

      return (
        <button
          ref={ref}
          type="button"
          className={classNames(
            "wui-circle-button touch-manipulation",
            props.className,
          )}
          data-variant={variant}
          data-pressed={pressed}
          disabled={props.disabled}
          aria-label={props["aria-label"]}
          onClick={() => {
            if (shouldFireClick()) props.onClick?.();
          }}
          {...handlers}
        >
          <span className="flex items-center justify-center" aria-hidden="true">
            {props.icon}
          </span>
        </button>
      );
    },
  ),
);
