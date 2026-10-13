import classNames from "classnames";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

/** Leading checkbox or radio mark for a selector row. */
export function SelectionIndicator(props: {
  selected: boolean;
  shape: "checkbox" | "radio";
  /** A smaller mark for use inside chips and badges. */
  compact?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={classNames(
        "border-input flex shrink-0 items-center justify-center border-2",
        props.compact ? "size-4" : "size-5",
        props.shape === "checkbox" ? "rounded" : "rounded-full",
        { "bg-primary border-primary": props.selected },
      )}
    >
      {props.selected &&
        (props.shape === "checkbox" ? (
          <CheckIcon
            className={classNames(
              "text-primary-foreground",
              props.compact ? "size-2.5" : "size-3",
            )}
            strokeWidth={props.compact ? 4 : 2}
          />
        ) : (
          <span className="bg-background size-2 rounded-full" />
        ))}
    </span>
  );
}

/** Field-like button that opens a selector modal and shows its selection. */
export function SelectorTrigger(props: {
  text: string;
  /** The text is a placeholder, not a selection. */
  placeholder: boolean;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const disabled = props.disabled ?? false;
  return (
    <button
      onClick={props.onClick}
      className={classNames(
        "wui-input border-input text-foreground flex min-h-12 w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
        {
          "hover:border-foreground-hint": !disabled,
          "cursor-not-allowed opacity-50": disabled,
        },
        props.className,
      )}
      disabled={disabled}
      type="button"
      aria-label={props["aria-label"]}
      aria-labelledby={props["aria-labelledby"]}
    >
      <span
        className={classNames("min-w-0", {
          "text-muted-foreground": props.placeholder,
        })}
      >
        {props.text}
      </span>
      <ChevronDownIcon aria-hidden="true" size={16} className="ml-2 shrink-0" />
    </button>
  );
}
