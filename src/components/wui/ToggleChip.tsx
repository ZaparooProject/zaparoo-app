import classNames from "classnames";
import { ReactElement } from "react";

interface ToggleChipProps {
  label?: string;
  icon?: ReactElement;
  state: boolean;
  setState: (state: boolean) => void;
  disabled?: boolean;
}

export function ToggleChip(props: ToggleChipProps) {
  return (
    <button
      className={classNames(
        "flex",
        "flex-row",
        "items-center",
        "justify-center",
        "py-1",
        "font-medium",
        "gap-2",
        "tracking-[0.1px]",
        "border",
        "border-solid",
        "bg-background",
        {
          "w-10": !props.label && props.icon,
          "h-10": !props.label && props.icon,
          "px-1.5": !props.label && props.icon,
          "px-6": props.label || !props.icon,
          "rounded-full": !props.label && props.icon,
          "rounded-[8px]": props.label || !props.icon
        },
        {
          "bg-button-pattern": props.state && !props.disabled,
          "border-bd-filled": props.state && !props.disabled,
          "border-bd-outline": !props.state && !props.disabled,
          "border-foreground-disabled": props.disabled,
          "text-foreground-disabled": props.disabled
        }
      )}
      onClick={() => !props.disabled && props.setState(!props.state)}
    >
      {props.icon}
      {props.label}
    </button>
  );
}
