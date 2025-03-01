import classNames from "classnames";

interface ButtonProps {
  onClick?: () => void;
  label?: string;
  variant?: "fill" | "outline" | "text";
  icon?: JSX.Element;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
}

export function Button(props: ButtonProps) {
  const variant = props.variant || "fill";

  return (
    <button
      className={classNames(
        "flex",
        "flex-row",
        "items-center",
        "justify-center",
        "py-1.5",
        "font-medium",
        "gap-2",
        "tracking-[0.1px]",
        "cursor-pointer",
        {
          "w-10": !props.label && props.icon,
          "h-10": !props.label && props.icon,
          "px-1.5": !props.label && props.icon,
          "px-6": props.label || !props.icon,
          "rounded-full": !props.label && props.icon,
          "rounded-[20px]": props.label || !props.icon,
          "min-w-10": !props.label && props.icon
        },
        {
          "bg-button-pattern": variant === "fill" && !props.disabled,
          border: variant === "fill" || variant === "outline",
          "border-solid": variant === "fill" || variant === "outline",
          "border-bd-filled": variant === "fill" && !props.disabled,
          "border-bd-outline": variant === "outline" && !props.disabled,
          "border-foreground-disabled": props.disabled,
          "text-foreground-disabled": props.disabled,
          "text-[#fff]": !props.disabled
        },
        props.className
      )}
      disabled={props.disabled}
      autoFocus={props.autoFocus}
      onClick={() => !props.disabled && props.onClick && props.onClick()}
    >
      {props.icon}
      {props.label}
    </button>
  );
}
