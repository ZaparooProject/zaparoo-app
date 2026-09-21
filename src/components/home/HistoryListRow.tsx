import type { ReactNode } from "react";

interface HistoryListRowProps {
  leading?: ReactNode;
  title: ReactNode;
  meta: ReactNode;
  details?: ReactNode;
  action: ReactNode;
}

/** Shared history-row geometry for scan events and played media. */
export function HistoryListRow({
  leading,
  title,
  meta,
  details,
  action,
}: HistoryListRowProps) {
  return (
    <li className="border-bd-outline flex items-center gap-3 border-b border-solid p-3 last:border-b-0">
      {leading}
      <div className="min-w-0 flex-1">
        <div className="text-foreground flex min-w-0 items-start gap-1 font-medium">
          {title}
        </div>
        <div className="text-muted-foreground mt-1 text-sm">{meta}</div>
        {details && (
          <div className="text-muted-foreground mt-1 text-xs">{details}</div>
        )}
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}
