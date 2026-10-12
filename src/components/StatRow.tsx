import type { ReactNode } from "react";

interface StatRowProps {
  label: string;
  /** The value, or a skeleton while it is pending. */
  children: ReactNode;
  /** Spoken form of the value when its visible form is abbreviated. */
  valueLabel?: string;
}

/**
 * A muted label with its value right-aligned, used in settings status wells.
 * Long translated labels and values wrap instead of overflowing the panel.
 */
export function StatRow({ label, children, valueLabel }: StatRowProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 text-sm">
      <span className="text-muted-foreground max-w-full wrap-anywhere">
        {label}
      </span>
      <span
        className="max-w-full text-right wrap-anywhere"
        aria-label={valueLabel}
      >
        {children}
      </span>
    </div>
  );
}
