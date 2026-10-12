import classNames from "classnames";
import { ReactElement, memo } from "react";
import { useTactilePress } from "@/hooks/useTactilePress";

interface HeaderButtonProps {
  onClick?: () => void;
  icon: ReactElement;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  "aria-label"?: string;
  "aria-expanded"?: boolean;
  className?: string;
}

export const HeaderButton = memo(function HeaderButton(
  props: HeaderButtonProps,
) {
  const { pressed, shouldFireClick, handlers } = useTactilePress({
    disabled: props.disabled,
    hasOnClick: props.onClick !== undefined,
  });

  return (
    <button
      type="button"
      data-pressed={pressed}
      aria-pressed={
        props["aria-expanded"] === undefined ? props.active : undefined
      }
      aria-expanded={props["aria-expanded"]}
      className={classNames(
        "wui-header-button flex cursor-pointer touch-manipulation items-center justify-center transition-colors duration-100",
        {
          "text-primary": props.active && !props.disabled,
          "text-muted-foreground hover:text-foreground":
            !props.active && !props.disabled,
          "text-muted-foreground cursor-not-allowed": props.disabled,
          "text-muted-foreground": pressed,
        },
        props.className,
      )}
      disabled={props.disabled}
      title={props.title}
      aria-label={props["aria-label"] ?? props.title}
      onClick={() => {
        // Only trigger click if this wasn't a scroll gesture
        if (shouldFireClick() && props.onClick) {
          props.onClick();
        }
      }}
      {...handlers}
    >
      <span
        className="wui-header-button-content flex items-center justify-center"
        aria-hidden="true"
      >
        {props.icon}
      </span>
    </button>
  );
});
