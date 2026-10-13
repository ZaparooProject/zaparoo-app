import classNames from "classnames";

interface ProgressBarProps {
  /** Accessible name for the bar. */
  label: string;
  /** Fill width from 0 to 100. Omit for a full-width indeterminate bar. */
  percent?: number;
  /** Value announced to assistive technology, when one is known. */
  valueNow?: number;
  /** Pulse the indeterminate bar while work is actively running. */
  pulse?: boolean;
  /** Show the empty track, for known progress that has not started. */
  empty?: boolean;
}

const FILL = "border-background bg-primary h-[8px] rounded-full border";

/** The media database and scraper progress bar. */
export function ProgressBar({
  label,
  percent,
  valueNow,
  pulse = false,
  empty = false,
}: ProgressBarProps) {
  return (
    <div
      role="progressbar"
      aria-valuenow={valueNow}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="border-border bg-background h-[10px] w-full rounded-full border border-solid"
    >
      {/* Distinct nodes prevent iOS WebKit from retaining the solid determinate layer when pulsing begins. */}
      {empty ? null : percent !== undefined ? (
        <div
          key="determinate"
          className={classNames(FILL, "border-solid")}
          style={{
            width: `${Math.min(100, Math.max(0, percent)).toFixed(2)}%`,
          }}
        />
      ) : (
        <div
          key="indeterminate"
          className={classNames(FILL, "w-full border-solid", {
            "animate-pulse": pulse,
          })}
        />
      )}
    </div>
  );
}
