import React from "react";
import classNames from "classnames";

export function Card(props: {
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!props.disabled && props.onClick) {
        props.onClick();
      }
    }
  };

  const isClickable = props.onClick && !props.disabled;

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
          "bg-card-pattern": !props.disabled
        },
        props.className
      )}
      onClick={() => !props.disabled && props.onClick && props.onClick()}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
    >
      {props.children}
    </div>
  );
}
