import classNames from "classnames";
import { ReactElement, memo, forwardRef } from "react";
import { useTactilePress } from "@/hooks/useTactilePress";

export type ButtonLayout = "inline" | "stacked" | "responsive";
export type ButtonDisabledAppearance = "unavailable" | "busy";
export type ButtonReaderState = "waiting" | "attention" | "error";

export interface ButtonProps {
  onClick?: () => void;
  label?: string;
  variant?: "fill" | "secondary" | "outline" | "ghost" | "text";
  /** Square icon controls align with fields; standalone controls stay round. */
  shape?: "round" | "square";
  size?: "default" | "sm" | "lg";
  layout?: ButtonLayout;
  /** Semantic intent controls haptics and visible destructive/pro treatment. */
  intent?: "default" | "primary" | "destructive" | "pro";
  icon?: ReactElement;
  disabled?: boolean;
  /**
   * unavailable: recessed control whose prerequisite is absent.
   * busy: temporarily locked control that retains its normal material, faded.
   */
  disabledAppearance?: ButtonDisabledAppearance;
  /** Illuminated latched state for an active physical reader interaction. */
  readerState?: ButtonReaderState;
  className?: string;
  /** Accessible label for screen readers (required for icon-only buttons) */
  "aria-label"?: string;
  /** Mark as decorative (removes from tab order and accessibility tree) */
  decorative?: boolean;
  /** Indicates whether the button represents an active toggle state */
  "aria-pressed"?: boolean;
  /** Indicates whether the controlled element is expanded */
  "aria-expanded"?: boolean;
  /** Indicates that the action is waiting on an asynchronous interaction. */
  "aria-busy"?: boolean;
  /** ID of the element controlled by this button */
  "aria-controls"?: string;
}

export const Button = memo(
  forwardRef<HTMLButtonElement, ButtonProps>(function Button(props, ref) {
    const variant = props.variant || "fill";
    const size = props.size || "default";
    const layout = props.layout || "inline";
    const { pressed, shouldFireClick, handlers } = useTactilePress({
      intent: props.intent,
      disabled: props.disabled,
      decorative: props.decorative,
      hasOnClick: props.onClick !== undefined,
    });

    return (
      <button
        ref={ref}
        data-variant={variant}
        data-intent={props.intent ?? "default"}
        data-size={size}
        data-icon-only={!props.label && !!props.icon}
        data-shape={props.shape ?? "round"}
        data-disabled-appearance={props.disabledAppearance ?? "unavailable"}
        data-reader-state={props.readerState}
        data-pressed={pressed}
        aria-label={
          props.decorative ? undefined : props["aria-label"] || props.label
        }
        aria-hidden={props.decorative || undefined}
        aria-pressed={props["aria-pressed"]}
        aria-expanded={props["aria-expanded"]}
        aria-busy={props["aria-busy"]}
        aria-controls={props["aria-controls"]}
        tabIndex={props.decorative ? -1 : undefined}
        className={classNames(
          "wui-button flex min-h-12 min-w-12 shrink-0 touch-manipulation items-center justify-center border border-solid border-transparent text-sm font-bold tracking-wider uppercase",
          "disabled:cursor-not-allowed",
          {
            "flex-row gap-2": layout === "inline",
            "flex-col gap-1": layout === "stacked",
            "flex-col gap-1 sm:flex-row sm:gap-2": layout === "responsive",
            "cursor-pointer": !props.disabled && !props.decorative,
            "px-4 py-2": props.label && size === "sm" && layout === "inline",
            "px-5 py-3":
              props.label && size === "default" && layout === "inline",
            "px-7 py-3.5 text-base":
              props.label && size === "lg" && layout === "inline",
            "px-2 py-2": props.label && layout !== "inline",
            "size-12 p-2": !props.label && size !== "lg",
            "size-14 p-3": !props.label && size === "lg",
          },
          props.className,
        )}
        disabled={props.disabled}
        onClick={() => {
          if (shouldFireClick() && props.onClick) {
            props.onClick();
          }
        }}
        {...handlers}
      >
        {props.icon && (
          <span
            className="wui-button-icon flex shrink-0 items-center"
            aria-hidden="true"
          >
            {props.icon}
          </span>
        )}
        {props.label}
      </button>
    );
  }),
);
