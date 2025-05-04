import classNames from "classnames";
import { useState } from "react";

interface ButtonProps {
  onClick?: () => void;
  label?: string;
  variant?: "fill" | "outline" | "text";
  size?: "default" | "sm" | "lg";
  icon?: JSX.Element;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
}

export function Button(props: ButtonProps) {
  const variant = props.variant || "fill";
  const size = props.size || "default";
  const [isPressed, setIsPressed] = useState(false);

  return (
    <button
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
        "touch-none",
        // Size variants
        {
          // Small size
          "py-1": size === "sm",
          "text-sm": size === "sm",
          // Default size
          "py-1.5": size === "default",
          // Large size
          "py-2": size === "lg",
          "text-lg": size === "lg"
        },
        // Icon-only button sizes
        {
          "h-8 w-8 min-w-8 px-1.5": !props.label && props.icon && size === "sm",
          "h-10 w-10 min-w-10 px-1.5":
            !props.label && props.icon && size === "default",
          "h-12 w-12 min-w-12 px-2": !props.label && props.icon && size === "lg"
        },
        // Label padding
        {
          "px-4": props.label && size === "sm",
          "px-6": props.label && size === "default",
          "px-8": props.label && size === "lg"
        },
        // Rounded corners
        {
          "rounded-full": !props.label && props.icon,
          "rounded-[16px]": props.label && size === "sm",
          "rounded-[20px]": props.label && size === "default",
          "rounded-[24px]": props.label && size === "lg"
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
          "text-[#fff]": !props.disabled,
          "opacity-80": isPressed && !props.disabled
        },
        props.className
      )}
      disabled={props.disabled}
      autoFocus={props.autoFocus}
      onClick={() => !props.disabled && props.onClick && props.onClick()}
      onTouchStart={() => setIsPressed(true)}
      onTouchEnd={() => setIsPressed(false)}
      onTouchCancel={() => setIsPressed(false)}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
    >
      {props.icon}
      {props.label}
    </button>
  );
}
