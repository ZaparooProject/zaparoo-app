import classNames from "classnames";
import {
  useRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { getTabBarPanelId, getTabBarTabId } from "./tabBarIds";

type TabBarRole = "radio" | "tab";

export interface TabBarOption<T extends string> {
  value: T;
  label: ReactNode;
  id?: string;
}

interface TabBarProps<T extends string> {
  label: string;
  options: TabBarOption<T>[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
  role?: TabBarRole;
  layout?: "grid" | "scroll";
  containerProps?: HTMLAttributes<HTMLDivElement> & {
    ref?: Ref<HTMLDivElement>;
  };
}

export function TabBar<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  role = "radio",
  layout = "grid",
  containerProps,
}: TabBarProps<T>) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);

  const focusAndSelect = (index: number) => {
    const target = options[index];
    if (!target || disabled) return;
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

  const {
    className,
    style: containerStyle,
    ...restContainerProps
  } = containerProps ?? {};

  return (
    <div
      role={role === "tab" ? "tablist" : "radiogroup"}
      aria-label={label}
      className={classNames(
        "border-border bg-surface-inset gap-1 rounded-lg border border-solid p-1.5 shadow-inner",
        layout === "grid" ? "grid" : "flex",
        className,
      )}
      style={{
        ...(layout === "grid"
          ? {
              gridTemplateColumns:
                "repeat(auto-fit, minmax(min(100%, 4rem), 1fr))",
            }
          : {}),
        ...containerStyle,
      }}
      {...restContainerProps}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        const tabId = option.id ?? getTabBarTabId(option.value);
        const panelId = getTabBarPanelId(tabId);
        return (
          <button
            key={option.value}
            id={role === "tab" ? tabId : undefined}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role={role}
            disabled={disabled}
            aria-checked={role === "radio" ? active : undefined}
            aria-selected={role === "tab" ? active : undefined}
            aria-controls={role === "tab" ? panelId : undefined}
            tabIndex={
              !disabled && (active || (selectedIndex === -1 && index === 0))
                ? 0
                : -1
            }
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={classNames(
              "min-h-12 min-w-0 cursor-pointer rounded-md border border-transparent px-2 py-2 text-center text-sm leading-snug font-semibold break-words transition-colors",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
              layout === "scroll" && "shrink-0 whitespace-nowrap",
              role === "tab" && "uppercase",
              {
                "border-border bg-surface-raised text-foreground shadow-[0_2px_0_var(--surface-base),inset_0_1px_0_var(--material-highlight)]":
                  active,
                "text-muted-foreground hover:bg-foreground/5": !active,
                "cursor-not-allowed opacity-60": disabled,
              },
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
