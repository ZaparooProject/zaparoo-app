import { ReactNode, memo } from "react";
import classNames from "classnames";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  size?: "compact" | "default";
  className?: string;
}

export const EmptyState = memo(function EmptyState({
  icon,
  title,
  description,
  action,
  size = "default",
  className,
}: EmptyStateProps) {
  const hasSecondary = !!description || !!action;

  return (
    <div
      role="status"
      className={classNames(
        "flex flex-col items-center justify-center text-center",
        icon ? "gap-3" : "gap-2",
        { "py-4": size === "compact", "py-8": size === "default" },
        className,
      )}
    >
      {icon && <span className="text-foreground-hint">{icon}</span>}
      <p
        className={classNames({
          "text-foreground font-medium": hasSecondary,
          "text-muted-foreground": !hasSecondary,
        })}
      >
        {title}
      </p>
      {description && (
        <p className="text-muted-foreground text-sm">{description}</p>
      )}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
});
