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
  default: "border-border bg-surface-inset text-foreground",
  pro: "border-warning/30 bg-warning-wash text-warning",
  success: "border-success/30 bg-success-wash text-success",
  warning: "border-warning/30 bg-warning-wash text-warning",
  error: "border-error/30 bg-error-wash text-error",
  info: "border-primary/30 bg-primary-wash text-primary",
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
        "inline-flex shrink-0 items-center rounded-sm border border-solid px-2 py-0.5 text-xs font-medium",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
