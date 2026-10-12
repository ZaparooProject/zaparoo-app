import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { DelayedLoading } from "@/components/DelayedLoading";
import { InlineLoading } from "@/components/InlineLoading";
import { Button } from "@/components/wui/Button";
import { EmptyState } from "@/components/wui/EmptyState";

interface HistoryQueryStateProps {
  /** Nothing can be requested and there is nothing cached to show. */
  offline: boolean;
  isPending: boolean;
  isError: boolean;
  /** A previous response is still available to show beside a failed refresh. */
  hasData: boolean;
  isEmpty: boolean;
  emptyTitle: string;
  onRetry: () => void;
  children: ReactNode;
}

/**
 * The offline, loading, failed and empty states shared by the History sheet
 * and the history pages, so a failed request never reads as "still loading".
 */
export function HistoryQueryState({
  offline,
  isPending,
  isError,
  hasData,
  isEmpty,
  emptyTitle,
  onRetry,
  children,
}: HistoryQueryStateProps) {
  const { t } = useTranslation();

  if (offline) {
    return <EmptyState title={t("settings.notConnected")} />;
  }
  if (isError && !hasData) {
    return (
      <EmptyState
        title={t("scan.historyLoadError")}
        action={
          <Button variant="outline" label={t("scan.retry")} onClick={onRetry} />
        }
      />
    );
  }
  if (isPending) {
    return (
      <DelayedLoading>
        <InlineLoading />
      </DelayedLoading>
    );
  }
  return (
    <>
      {isError && (
        <p role="alert" className="text-error mb-3 text-sm">
          {t("scan.historyLoadError")}
        </p>
      )}
      {isEmpty ? <EmptyState title={emptyTitle} /> : children}
    </>
  );
}
