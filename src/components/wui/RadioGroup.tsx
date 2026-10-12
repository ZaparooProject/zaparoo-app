import classNames from "classnames";
import { useId, type ReactNode } from "react";
import { handleRadioGroupKeyDown } from "@/lib/radioGroup";

interface RadioGroupProps<T extends string> {
  label: string;
  labelHidden?: boolean;
  /**
   * A string renders as visible supporting text below the choices; a node
   * (such as `SettingHelp`) renders beside the label instead.
   */
  help?: ReactNode;
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
  /** Inline is reserved for two short choices without conditional form fields. */
  layout?: "stack" | "inline";
}

export function RadioGroup<T extends string>({
  label,
  labelHidden = false,
  help,
  options,
  value,
  onChange,
  disabled = false,
  layout = "stack",
}: RadioGroupProps<T>) {
  const labelId = useId();
  const helpId = useId();
  const selectedIndex = options.findIndex((option) => option.value === value);
  const inline = layout === "inline" && options.length === 2;
  const helpText = typeof help === "string" ? help : undefined;
  const helpNode = typeof help === "string" ? undefined : help;

  return (
    <div className="wui-field wui-radio-field min-w-0">
      <div
        className={classNames("flex items-center gap-1", {
          "wui-field-label": !labelHidden,
        })}
      >
        <span
          id={labelId}
          className={classNames("text-sm font-medium", {
            "sr-only": labelHidden,
          })}
        >
          {label}
        </span>
        {helpNode}
      </div>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        tabIndex={-1}
        aria-describedby={helpText ? helpId : undefined}
        onKeyDown={handleRadioGroupKeyDown}
        data-layout={inline ? "inline" : "stack"}
        className="wui-radio-options"
      >
        {options.map((option, index) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              tabIndex={
                !disabled && (active || (selectedIndex === -1 && index === 0))
                  ? 0
                  : -1
              }
              onClick={() => onChange(option.value)}
              className={classNames(
                "focus-visible:ring-ring flex min-h-12 max-w-full cursor-pointer items-start gap-3 rounded-sm py-3 text-left text-sm leading-6 font-medium focus-visible:ring-2 focus-visible:outline-none",
                inline && "shrink-0 grow basis-auto",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <span
                aria-hidden="true"
                className={classNames(
                  "wui-radio-indicator mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                  active ? "border-primary text-primary" : "border-input",
                )}
              >
                {active && (
                  <span className="size-2.5 rounded-full bg-current" />
                )}
              </span>
              <span className="min-w-0 break-words">{option.label}</span>
            </button>
          );
        })}
      </div>
      {helpText && (
        <span
          id={helpId}
          className="wui-field-help text-muted-foreground mt-1 text-sm"
        >
          {helpText}
        </span>
      )}
    </div>
  );
}
