import classNames from "classnames";
import { ReactElement } from "react";
import { useHaptics } from "@/hooks/useHaptics";

interface ToggleChipProps {
  label?: string;
  icon?: ReactElement;
  state: boolean;
  setState: (state: boolean) => void;
  disabled?: boolean;
  compact?: boolean;
  /** Accessible label for screen readers (required for icon-only toggles) */
  "aria-label"?: string;
}

export function ToggleChip(props: ToggleChipProps) {
  const { impact } = useHaptics();

  return (
    <button
      type="button"
      disabled={props.disabled}
      aria-pressed={props.state}
      aria-label={props["aria-label"] || props.label}
      className={classNames(
        "min-h-12",
        "flex",
        "flex-row",
        "items-center",
        "justify-center",
        "py-1",
        "text-sm font-semibold",
        "gap-2",
        "tracking-[0.1px]",
        "border",
        "border-solid",
        "bg-surface-inset",
        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-ring",
        "focus-visible:ring-offset-2",
        "focus-visible:ring-offset-background",
        {
          "w-12": !props.label && props.icon,
          "h-12": !props.label && props.icon,
          "px-1.5": !props.label && props.icon,
          "px-4": props.compact && (props.label || !props.icon),
          "px-6": !props.compact && (props.label || !props.icon),
          "rounded-full": !props.label && props.icon,
          "rounded-[4px]": props.label || !props.icon,
        },
        {
          "bg-primary-wash shadow-inner": props.state && !props.disabled,
          "text-primary": props.state && !props.disabled,
          "border-primary": props.state && !props.disabled,
          "border-bd-outline": !props.state && !props.disabled,
          "border-foreground-disabled": props.disabled,
          "text-foreground-disabled": props.disabled,
        },
      )}
      onClick={() => {
        if (!props.disabled) {
          impact("light");
          props.setState(!props.state);
        }
      }}
    >
      {props.icon}
      {props.label}
    </button>
  );
}
