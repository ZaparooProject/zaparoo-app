import classNames from "classnames";
import { ReactElement, useState, memo, useRef, forwardRef } from "react";
import { useHapticPress } from "@/hooks/useHapticPress";

export type ButtonLayout = "inline" | "stacked" | "responsive";

interface ButtonProps {
  onClick?: () => void;
  label?: string;
  variant?: "fill" | "secondary" | "outline" | "text";
  /** Square icon controls align with fields; standalone controls stay round. */
  shape?: "round" | "square";
  size?: "default" | "sm" | "lg";
  layout?: ButtonLayout;
  /** Semantic intent controls haptics and visible destructive treatment. */
  intent?: "default" | "primary" | "destructive";
  icon?: ReactElement;
  disabled?: boolean;
  className?: string;
  /** Accessible label for screen readers (required for icon-only buttons) */
  "aria-label"?: string;
  /** Mark as decorative (removes from tab order and accessibility tree) */
  decorative?: boolean;
  /** Indicates whether the button represents an active toggle state */
  "aria-pressed"?: boolean;
  /** Indicates whether the controlled element is expanded */
  "aria-expanded"?: boolean;
  /** ID of the element controlled by this button */
  "aria-controls"?: string;
}

export const Button = memo(
  forwardRef<HTMLButtonElement, ButtonProps>(function Button(props, ref) {
    const variant = props.variant || "fill";
    const size = props.size || "default";
    const layout = props.layout || "inline";
    const [isPressed, setIsPressed] = useState(false);
    const touchStartPos = useRef<{ x: number; y: number } | null>(null);
    const hasMoved = useRef(false);
    const hapticStyle =
      props.intent === "destructive"
        ? "heavy"
        : props.intent === "primary"
          ? "medium"
          : "light";
    const handleHapticPress = useHapticPress(
      hapticStyle,
      !props.disabled && !props.decorative && props.onClick !== undefined,
    );

    return (
      <button
        ref={ref}
        data-variant={variant}
        data-intent={props.intent ?? "default"}
        data-size={size}
        data-icon-only={!props.label && !!props.icon}
        data-shape={props.shape ?? "round"}
        data-pressed={isPressed && !props.disabled}
        aria-label={
          props.decorative ? undefined : props["aria-label"] || props.label
        }
        aria-hidden={props.decorative || undefined}
        aria-pressed={props["aria-pressed"]}
        aria-expanded={props["aria-expanded"]}
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
          // Only trigger click if this wasn't a scroll gesture
          if (!hasMoved.current && !props.disabled && props.onClick) {
            props.onClick();
          }
        }}
        onPointerUp={(event) => {
          if (!hasMoved.current) {
            handleHapticPress(event);
          }
        }}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          if (!touch) return;
          touchStartPos.current = { x: touch.clientX, y: touch.clientY };
          hasMoved.current = false;
          setIsPressed(true);
        }}
        onTouchMove={(e) => {
          if (touchStartPos.current) {
            const touch = e.touches[0];
            if (!touch) return;
            const deltaX = Math.abs(touch.clientX - touchStartPos.current.x);
            const deltaY = Math.abs(touch.clientY - touchStartPos.current.y);

            // If moved more than 10px, consider it a scroll gesture
            if (deltaX > 10 || deltaY > 10) {
              hasMoved.current = true;
              setIsPressed(false);
            }
          }
        }}
        onTouchEnd={() => {
          setIsPressed(false);
          // Reset after a short delay to allow click to process
          setTimeout(() => {
            hasMoved.current = false;
            touchStartPos.current = null;
          }, 100);
        }}
        onTouchCancel={() => {
          setIsPressed(false);
          hasMoved.current = false;
          touchStartPos.current = null;
        }}
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        onMouseLeave={() => setIsPressed(false)}
      >
        {props.icon && (
          <span className="flex shrink-0 items-center" aria-hidden="true">
            {props.icon}
          </span>
        )}
        {props.label}
      </button>
    );
  }),
);
