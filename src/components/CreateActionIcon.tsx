import type { ReactNode } from "react";

/** The neutral inset tile that leads a menu-like action card. */
export function CreateActionIcon(props: { icon: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="border-border bg-surface-inset text-muted-foreground inset-shadow-material flex size-11 shrink-0 items-center justify-center rounded-lg border"
    >
      {props.icon}
    </span>
  );
}
