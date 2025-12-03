import classNames from "classnames";
import { ReactElement, useState, memo, useRef, forwardRef } from "react";
import { useHaptics } from "@/hooks/useHaptics";

interface ButtonProps {
  onClick?: () => void;
  label?: string;
  variant?: "fill" | "outline" | "text";
  size?: "default" | "sm" | "lg";
  /** Semantic intent for haptic feedback: default (light), primary (medium), destructive (heavy) */
  intent?: "default" | "primary" | "destructive";
  icon?: ReactElement;
  disabled?: boolean;
  className?: string;
  /** Accessible label for screen readers (required for icon-only buttons) */
  "aria-label"?: string;
  /** Mark as decorative (removes from tab order and accessibility tree) */
  decorative?: boolean;
  /** Indicates whether the controlled element is expanded */
  "aria-expanded"?: boolean;
  /** ID of the element controlled by this button */
  "aria-controls"?: string;
}

export const Button = memo(
  forwardRef<HTMLButtonElement, ButtonProps>(function Button(props, ref) {
    const variant = props.variant || "fill";
    const size = props.size || "default";
    const [isPressed, setIsPressed] = useState(false);
    const touchStartPos = useRef<{ x: number; y: number } | null>(null);
    const hasMoved = useRef(false);
    const { impact } = useHaptics();

    return (
      <button
        ref={ref}
        aria-label={
          props.decorative ? undefined : props["aria-label"] || props.label
        }
        aria-hidden={props.decorative || undefined}
        aria-expanded={props["aria-expanded"]}
        aria-controls={props["aria-controls"]}
        tabIndex={props.decorative ? -1 : undefined}
        className={classNames(
          "flex",
          "flex-row",
          "items-center",
          "justify-center",
          "font-medium",
          "gap-2",
          "tracking-[0.1px]",
          "cursor-pointer",
          "transition-all",
          "duration-100",
          "active:scale-95",
          "touch-manipulation",
          "focus-visible:outline-none",
          "focus-visible:ring-2",
          "focus-visible:ring-white/50",
          "focus-visible:ring-offset-2",
          "focus-visible:ring-offset-background",
          // Size variants
          {
            // Small size
            "py-1": size === "sm",
            "text-sm": size === "sm",
            // Default size
            "py-1.5": size === "default",
            // Large size
            "py-2": size === "lg",
            "text-lg": size === "lg",
          },
          // Icon-only button sizes
          {
            "h-8 w-8 min-w-8 px-1.5":
              !props.label && props.icon && size === "sm",
            "h-10 w-10 min-w-10 px-1.5":
              !props.label && props.icon && size === "default",
            "h-12 w-12 min-w-12 px-2":
              !props.label && props.icon && size === "lg",
          },
          // Label padding
          {
            "px-4": props.label && size === "sm",
            "px-6": props.label && size === "default",
            "px-8": props.label && size === "lg",
          },
          // Rounded corners
          {
            "rounded-full": !props.label && props.icon,
            "rounded-[16px]": props.label && size === "sm",
            "rounded-[20px]": props.label && size === "default",
            "rounded-[24px]": props.label && size === "lg",
          },
          // Variants and states
          {
            "bg-button-pattern": variant === "fill" && !props.disabled,
            border: variant === "fill" || variant === "outline",
            "border-solid": variant === "fill" || variant === "outline",
            "border-bd-filled": variant === "fill" && !props.disabled,
            "border-bd-outline": variant === "outline" && !props.disabled,
            "border-foreground-disabled": props.disabled,
            "text-foreground-disabled": props.disabled,
            "text-white": !props.disabled,
            "opacity-80": isPressed && !props.disabled,
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
        onTouchStart={(e) => {
          const touch = e.touches[0];
          if (!touch) return;
          touchStartPos.current = { x: touch.clientX, y: touch.clientY };
          hasMoved.current = false;
          setIsPressed(true);
          if (!props.disabled) {
            const hapticStyle =
              props.intent === "destructive"
                ? "heavy"
                : props.intent === "primary"
                  ? "medium"
                  : "light";
            impact(hapticStyle);
          }
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
        {props.icon}
        {props.label}
      </button>
    );
  }),
);
