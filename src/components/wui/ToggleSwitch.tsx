import classNames from "classnames";
import React, { useId } from "react";
import { useHaptics } from "@/hooks/useHaptics";
import { Skeleton } from "@/components/ui/skeleton";

export function ToggleSwitch(props: {
  label: string | React.ReactNode;
  value: boolean | undefined;
  setValue: (value: boolean) => void;
  disabled?: boolean;
  /** Help control rendered outside the checkbox label. */
  help?: React.ReactNode;
  /** Content rendered after the label, outside the clickable label area */
  suffix?: React.ReactNode;
  /** When true, shows a skeleton placeholder instead of the toggle */
  loading?: boolean;
  /** Let long labels/help and the switch wrap when their panel is narrow. */
  reflow?: boolean;
}) {
  const { impact } = useHaptics();
  const inputId = useId();

  return (
    <div
      className={classNames(
        "text-foreground flex min-h-12 items-center justify-between gap-4 select-none",
        { "flex-wrap": props.reflow },
      )}
    >
      <span
        className={classNames(
          "flex min-w-0 items-center gap-1",
          props.reflow ? "flex-[1_1_8rem] flex-wrap" : "flex-1",
        )}
      >
        <label
          htmlFor={inputId}
          className={classNames(
            "cursor-pointer text-sm leading-6 font-medium",
            { "min-w-0 wrap-anywhere": props.reflow },
          )}
        >
          {props.label}
        </label>
        {props.help}
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
            )}
          ></div>
          <div className="wui-toggle-thumb pointer-events-none"></div>
        </label>
      )}
    </div>
  );
}
