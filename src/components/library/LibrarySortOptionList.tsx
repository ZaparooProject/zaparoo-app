import { CheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { handleRadioGroupKeyDown } from "@/lib/radioGroup";
import { useHapticPress } from "@/hooks/useHapticPress";

/** The Library's established sort list: full-width radio rows with a check. */
export function LibrarySortOptionList<T extends string>(props: {
  label: string;
  options: ReadonlyArray<{ value: T; labelKey: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  const { t } = useTranslation();
  const handleHapticPress = useHapticPress();

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{props.label}</h2>
      <div
        role="radiogroup"
        aria-label={props.label}
        onKeyDown={handleRadioGroupKeyDown}
        tabIndex={-1}
      >
        {props.options.map((option, index) => {
          const selected = props.value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              className={classNames(
                "focus-visible:ring-ring flex min-h-12 w-full items-center justify-between gap-3 px-2 py-3 text-left focus-visible:ring-2 focus-visible:outline-none",
                {
                  "border-border border-b": index < props.options.length - 1,
                  "bg-surface-inset": selected,
                },
              )}
              onPointerUp={handleHapticPress}
              onClick={() => props.onChange(option.value)}
            >
              <span>{t(option.labelKey)}</span>
              {selected && <CheckIcon size={20} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
