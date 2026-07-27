import { ReactNode } from "react";
import classNames from "classnames";

export type BadgeVariant =
  | "default"
  | "pro"
  | "success"
  | "warning"
  | "error"
  | "info";

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  "aria-hidden"?: boolean;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "border-white/10 bg-white/20 text-white",
  pro: "border-amber-500/30 bg-amber-500/20 text-amber-300",
  success: "border-green-500/30 bg-green-500/20 text-green-400",
  warning: "border-yellow-500/30 bg-yellow-500/20 text-yellow-400",
  error: "border-red-500/30 bg-red-500/20 text-red-400",
  info: "border-blue-500/30 bg-blue-500/20 text-blue-400",
};

export function Badge({
  variant = "default",
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={classNames(
        "inline-flex shrink-0 items-center rounded-full border border-solid px-2.5 py-1 text-xs font-medium",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
