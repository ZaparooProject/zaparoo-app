import type { ReactNode } from "react";
import classNames from "classnames";
import { useTactilePress } from "@/hooks/useTactilePress";

interface HistoryListRowProps {
  leading?: ReactNode;
  title: ReactNode;
  meta: ReactNode;
  details?: ReactNode;
  action: ReactNode;
  /** Page lists align row content with the page title; sheets keep padding. */
  flush?: boolean;
  /** Makes the leading artwork and text one control that opens details. */
  onSelect?: () => void;
  selectLabel?: string;
}

/** Shared row geometry for scan, played-media, and search history. */
export function HistoryListRow({
  leading,
  title,
  meta,
  details,
  action,
  flush = false,
  onSelect,
  selectLabel,
}: HistoryListRowProps) {
  const tactilePress = useTactilePress({ hasOnClick: onSelect !== undefined });
  const text = (
    <div className="min-w-0 flex-1">
      <div className="text-foreground flex min-w-0 items-start gap-1 font-medium">
        {title}
      </div>
      <div className="text-muted-foreground mt-1 text-sm">{meta}</div>
      {details && (
        <div className="text-muted-foreground mt-1 text-xs">{details}</div>
      )}
    </div>
  );
  return (
    <li
      className={classNames(
        "border-border flex items-center gap-3 border-b border-solid py-3 last:border-b-0",
        { "px-3": !flush },
      )}
    >
      {onSelect ? (
        <button
          type="button"
          className="focus-visible:ring-ring focus-visible:ring-offset-background [@media(hover:hover)_and_(pointer:fine)]:hover:bg-surface-highlight -m-1 flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md p-1 text-left focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          aria-label={selectLabel}
          onClick={() => {
            if (tactilePress.shouldFireClick()) onSelect();
          }}
          {...tactilePress.handlers}
        >
          {leading}
          {text}
        </button>
      ) : (
        <>
          {leading}
          {text}
        </>
      )}
      <div className="shrink-0">{action}</div>
    </li>
  );
}
