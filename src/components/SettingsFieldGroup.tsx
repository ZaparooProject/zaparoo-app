import type { ReactNode } from "react";

interface SettingsFieldGroupProps {
  legend: string;
  /** The inputs that share the legend, laid out in one row. */
  children: ReactNode;
  /** Optional hint beneath the inputs. */
  hint?: ReactNode;
}

/**
 * A labelled row of related inputs, such as hours and minutes. A legend is not
 * a flex item, so its spacing is a margin rather than the row's gap; the
 * fieldset opts out of its min-content width so narrow panels can shrink it.
 */
export function SettingsFieldGroup({
  legend,
  children,
  hint,
}: SettingsFieldGroupProps) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex gap-2">{children}</div>
      {hint}
    </fieldset>
  );
}
