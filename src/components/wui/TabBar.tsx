import classNames from "classnames";
import {
  useRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";

type TabBarRole = "radio" | "tab";

export interface TabBarOption<T extends string> {
  value: T;
  label: ReactNode;
  id?: string;
}

export function getTabBarTabId(value: string, prefix = "tab"): string {
  const safeValue = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  return `${prefix}-${safeValue}`;
}

export function getTabBarPanelId(tabId: string): string {
  return `tabpanel-${tabId}`;
}

interface TabBarProps<T extends string> {
  label: string;
  options: TabBarOption<T>[];
  value: T;
  onChange: (next: T) => void;
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
  role = "radio",
  layout = "grid",
  containerProps,
}: TabBarProps<T>) {
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
        "gap-1 rounded-md border border-solid border-white/15 p-1",
        layout === "grid" ? "grid" : "flex",
        className,
      )}
      style={{
        ...(layout === "grid"
          ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }
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
            aria-checked={role === "radio" ? active : undefined}
            aria-selected={role === "tab" ? active : undefined}
            aria-controls={role === "tab" ? panelId : undefined}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={classNames(
              "cursor-pointer rounded-sm px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              "focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none",
              layout === "scroll" && "shrink-0",
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
  );
}
