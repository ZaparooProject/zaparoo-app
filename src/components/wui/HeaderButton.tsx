import classNames from "classnames";
import { ReactElement, useState, memo, useRef } from "react";

interface HeaderButtonProps {
  onClick?: () => void;
  icon: ReactElement;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  "aria-label"?: string;
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
      className={classNames(
        "flex",
        "items-center",
        "justify-center",
        "h-8",
        "w-8",
        "min-w-8",
        "cursor-pointer",
        "transition-all",
        "duration-100",
        "active:scale-95",
        "touch-manipulation",
        "rounded-full",
        {
          // Active state (when modal is open, etc.)
          "text-[#00E0FF]": props.active && !props.disabled,
          // Normal state - using explicit colors instead of opacity for better contrast
          "text-gray-300 hover:text-white": !props.active && !props.disabled,
          // Disabled state - using explicit gray that meets WCAG contrast
          "cursor-not-allowed text-gray-500": props.disabled,
          // Pressed state
          "text-gray-400": isPressed && !props.disabled,
        },
        props.className,
      )}
      disabled={props.disabled}
      title={props.title}
      aria-label={props["aria-label"]}
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
      {props.icon}
    </button>
  );
});
