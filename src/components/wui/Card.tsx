import React from "react";
import classNames from "classnames";
import { useHapticPress } from "@/hooks/useHapticPress";

export function Card(props: {
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
  /** Marks a card inside another interactive element, such as a link. */
  pressable?: boolean;
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!props.disabled && props.onClick) {
        props.onClick();
      }
    }
  };

  const isClickable = props.onClick && !props.disabled;
  const isPressable =
    (props.onClick !== undefined || props.pressable) && !props.disabled;
  const handleHapticPress = useHapticPress("light", isPressable);

  return (
    <div
      className={classNames(
        "drop-shadow",
        "rounded-xl",
        "border",
        "border-solid",
        "p-3",
        "border-[rgba(255,255,255,0.13)]",
        {
          "text-foreground-disabled": props.disabled,
          "bg-card-pattern": !props.disabled,
          "focus-visible:ring-offset-background cursor-pointer focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:outline-none":
            isClickable,
        },
        props.className,
      )}
      onClick={() => !props.disabled && props.onClick && props.onClick()}
      onPointerUp={isPressable ? handleHapticPress : undefined}
      role={props.onClick ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
      aria-disabled={props.onClick && props.disabled ? true : undefined}
    >
      {props.children}
    </div>
  );
}
