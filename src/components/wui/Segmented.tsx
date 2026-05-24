import classNames from "classnames";
import { useRef, type KeyboardEvent } from "react";

interface SegmentedProps<T extends string> {
  label: string;
  labelHidden?: boolean;
  help?: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}

export function Segmented<T extends string>({
  label,
  labelHidden = false,
  help,
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusAndSelect = (index: number) => {
    const target = options[index];
    if (!target) return;
    onChange(target.value);
    buttonRefs.current[index]?.focus();
  };

  const onKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusAndSelect((index + 1) % options.length);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusAndSelect((index - 1 + options.length) % options.length);
        break;
      case "Home":
        event.preventDefault();
        focusAndSelect(0);
        break;
      case "End":
        event.preventDefault();
        focusAndSelect(options.length - 1);
        break;
    }
  };

  return (
    <div className="flex flex-col">
      <label className={labelHidden ? "sr-only" : "mb-1 block"}>{label}</label>
      <div
        role="radiogroup"
        aria-label={label}
        className="border-bd-outline grid gap-1 rounded-md border border-solid p-1"
        style={{
          gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        }}
      >
        {options.map((option, index) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={classNames(
                "cursor-pointer rounded-sm py-1.5 text-sm font-medium transition-colors",
                "focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none",
                {
                  "bg-button-pattern text-white": active,
                  "text-muted-foreground": !active,
                },
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {help && (
        <span className="text-muted-foreground mt-1 text-sm">{help}</span>
      )}
    </div>
  );
}
