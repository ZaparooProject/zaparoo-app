import classNames from "classnames";
import { ReactElement, useState, memo, useRef } from "react";

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
  const [isPressed, setIsPressed] = useState(false);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const hasMoved = useRef(false);

  return (
    <button
      type="button"
      data-pressed={isPressed}
      aria-pressed={props.active}
      aria-expanded={props["aria-expanded"]}
      className={classNames(
        "wui-header-button flex cursor-pointer touch-manipulation items-center justify-center transition-colors duration-100",
        {
          "text-primary": props.active && !props.disabled,
          "text-muted-foreground hover:text-foreground":
            !props.active && !props.disabled,
          "text-muted-foreground cursor-not-allowed": props.disabled,
          "text-muted-foreground": isPressed && !props.disabled,
        },
        props.className,
      )}
      disabled={props.disabled}
      title={props.title}
      aria-label={props["aria-label"] ?? props.title}
      onClick={() => {
        // Only trigger click if this wasn't a scroll gesture
        if (!hasMoved.current && !props.disabled && props.onClick) {
          props.onClick();
        }
      }}
      onTouchStart={(e) => {
        if (props.disabled) return;
        const touch = e.touches[0];
        if (!touch) return;
        touchStartPos.current = { x: touch.clientX, y: touch.clientY };
        hasMoved.current = false;
        setIsPressed(true);
      }}
      onTouchMove={(e) => {
        if (props.disabled || !touchStartPos.current) return;
        const touch = e.touches[0];
        if (!touch) return;
        const deltaX = Math.abs(touch.clientX - touchStartPos.current.x);
        const deltaY = Math.abs(touch.clientY - touchStartPos.current.y);

        // If moved more than 10px, consider it a scroll gesture
        if (deltaX > 10 || deltaY > 10) {
          hasMoved.current = true;
          setIsPressed(false);
        }
      }}
      onTouchEnd={() => {
        if (props.disabled) return;
        setIsPressed(false);
        // Reset after a short delay to allow click to process
        setTimeout(() => {
          hasMoved.current = false;
          touchStartPos.current = null;
        }, 100);
      }}
      onTouchCancel={() => {
        if (props.disabled) return;
        setIsPressed(false);
        hasMoved.current = false;
        touchStartPos.current = null;
      }}
      onMouseDown={() => !props.disabled && setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
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
