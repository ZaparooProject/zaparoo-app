import classNames from "classnames";
import { useId } from "react";
import { handleRadioGroupKeyDown } from "@/lib/radioGroup";

interface RadioGroupProps<T extends string> {
  label: string;
  labelHidden?: boolean;
  help?: string;
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

  return (
    <div className="flex min-w-0 flex-col">
      <span
        id={labelId}
        className={classNames("mb-2 text-sm font-medium", {
          "sr-only": labelHidden,
        })}
      >
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        tabIndex={-1}
        aria-describedby={help ? helpId : undefined}
        onKeyDown={handleRadioGroupKeyDown}
        className={classNames(
          "flex",
          inline ? "flex-wrap gap-x-6" : "flex-col",
        )}
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
                disabled && "cursor-not-allowed opacity-60",
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
      {help && (
        <span id={helpId} className="text-muted-foreground mt-1 text-sm">
          {help}
        </span>
      )}
    </div>
  );
}
