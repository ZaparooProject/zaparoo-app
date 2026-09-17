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
      className="text-foreground flex min-h-12 items-center justify-between gap-4 select-none"
      onClick={handleContainerClick}
      onKeyDown={handleContainerKeyDown}
      role={hasDisabledClickHandler ? "button" : undefined}
      tabIndex={hasDisabledClickHandler ? 0 : undefined}
    >
      <span className="flex min-w-0 flex-1 items-center gap-1">
        <label
          htmlFor={inputId}
          className="cursor-pointer text-sm leading-6 font-medium"
        >
          {props.label}
        </label>
        {props.suffix}
      </span>
      {props.loading ? (
        <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
      ) : (
        /* eslint-disable-next-line jsx-a11y/label-has-associated-control -- Label wraps and is associated with input via htmlFor */
        <label
          htmlFor={inputId}
          className="relative flex size-12 shrink-0 cursor-pointer items-center justify-center"
        >
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
              "wui-toggle-track",
              "block",
              "h-6",
              "w-11",
              "rounded-full",
              "border",
              "border-solid",
              "peer-focus-visible:ring-2",
              "peer-focus-visible:ring-ring",
              "peer-focus-visible:ring-offset-2",
              "peer-focus-visible:ring-offset-background",
              {
                "border-bd-outline": !props.disabled,
                "border-foreground-disabled": props.disabled,
              },
            )}
          ></div>
          <div className="wui-toggle-thumb pointer-events-none"></div>
        </label>
      )}
    </div>
  );
}
