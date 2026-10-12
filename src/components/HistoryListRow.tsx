import type { ReactNode } from "react";
import classNames from "classnames";
import { useTactilePress } from "@/hooks/useTactilePress";
import { RowSelectionChevron } from "@/components/RowSelectionChevron";

interface HistoryListRowProps {
  leading?: ReactNode;
  title: ReactNode;
  meta: ReactNode;
  details?: ReactNode;
  action: ReactNode;
  /** Page lists align row content with the page title; sheets keep padding. */
  flush?: boolean;
  /**
   * Makes the row open details, as the Library's rows do: everything but the
   * trailing action is one control, marked by a chevron at the far end.
   */
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
        { "px-3": !flush, relative: onSelect !== undefined },
      )}
    >
      {onSelect ? (
        <button
          type="button"
          // The control's hit area is the whole row (`after`); the action
          // sits above it and the chevron lets clicks through to it.
          className="focus-visible:ring-ring focus-visible:ring-offset-background -m-1 flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md p-1 text-left after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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
      <div className={classNames("shrink-0", { "relative z-[1]": onSelect })}>
        {action}
      </div>
      {onSelect && <RowSelectionChevron selected={false} />}
    </li>
  );
}
