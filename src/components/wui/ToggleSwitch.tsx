import classNames from "classnames";
import React, { useId } from "react";
import { useHaptics } from "@/hooks/useHaptics";
import { Skeleton } from "@/components/ui/skeleton";

export function ToggleSwitch(props: {
  label: string | React.ReactNode;
  value: boolean | undefined;
  setValue: (value: boolean) => void;
  disabled?: boolean;
  onDisabledClick?: () => void;
  /** Content rendered after the label, outside the clickable label area */
  suffix?: React.ReactNode;
  /** When true, shows a skeleton placeholder instead of the toggle */
  loading?: boolean;
}) {
  const { impact } = useHaptics();
  const inputId = useId();
  const hasDisabledClickHandler = props.disabled && props.onDisabledClick;

  const handleContainerClick = hasDisabledClickHandler
    ? (e: React.MouseEvent) => {
        e.preventDefault();
        props.onDisabledClick!();
      }
    : undefined;

  const handleContainerKeyDown = hasDisabledClickHandler
    ? (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onDisabledClick!();
        }
      }
    : undefined;

  return (
    <div
      className="text-foreground flex cursor-pointer items-center justify-between select-none"
      onClick={handleContainerClick}
      onKeyDown={handleContainerKeyDown}
      role={hasDisabledClickHandler ? "button" : undefined}
      tabIndex={hasDisabledClickHandler ? 0 : undefined}
    >
      <span className="flex items-center">
        <label htmlFor={inputId} className="cursor-pointer">
          {props.label}
        </label>
        {props.suffix}
      </span>
      {props.loading ? (
        <Skeleton className="h-8 w-[51px] rounded-full" />
      ) : (
        /* eslint-disable-next-line jsx-a11y/label-has-associated-control -- Label wraps and is associated with input via htmlFor */
        <label htmlFor={inputId} className="relative cursor-pointer">
          <input
            id={inputId}
            type="checkbox"
            className="peer sr-only"
            checked={props.value}
            disabled={props.disabled}
            onChange={(e) => {
              if (props.disabled) {
                return;
              }

              impact("medium");
              props.setValue(e.target.checked);
            }}
          />
          <div
            className={classNames(
              "block",
              "h-8",
              "w-[51px]",
              "rounded-full",
              "border",
              "border-solid",
              {
                "bg-button-pattern": props.value && !props.disabled,
                "bg-background": !props.value && !props.disabled,
                "border-bd-outline": !props.disabled,
                "border-foreground-disabled": props.disabled,
              },
            )}
          ></div>
          <div
            className={classNames(
              "dot",
              "bg-bd-outline",
              "peer-checked:bg-white",
              "absolute",
              "left-1.5",
              "top-2",
              "h-4",
              "w-4",
              "rounded-full",
              "transition",
              "peer-checked:left-0",
              "peer-checked:top-1",
              "peer-checked:h-6",
              "peer-checked:w-6",
              "peer-checked:translate-x-full",
              {
                "peer-checked:bg-foreground-disabled": props.disabled,
                "pointer-events-none": props.disabled,
                "bg-white": !props.disabled,
                "bg-foreground-disabled": props.disabled,
              },
            )}
          ></div>
        </label>
      )}
    </div>
  );
}
