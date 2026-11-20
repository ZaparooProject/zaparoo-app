import { useId } from "react";
import { useTranslation } from "react-i18next";
import { CopyButton } from "@/components/CopyButton";
import { Card } from "@/components/wui/Card";
import { EmptyState } from "@/components/wui/EmptyState";
import { formatAppDateTime } from "@/lib/formatDate";
import { useStatusStore } from "@/lib/store";

/**
 * Optional Zap page widget: the most recent token, from the phone's own scan
 * or a reader on the connected device. A scan that launches nothing (launch on
 * scan off, or no device connected) reaches no history, so this is the only
 * place its ID shows.
 */
export function LastScanned() {
  const { t } = useTranslation();
  const headingId = useId();
  const lastToken = useStatusStore((state) => state.lastToken);

  // Core reports "__api__" for a token that came from an API call, not a tag.
  const uid = lastToken.uid === "__api__" ? "" : lastToken.uid;
  const primaryValue = lastToken.text || uid;
  const time = lastToken.scanTime
    ? formatAppDateTime(lastToken.scanTime)
    : null;
  const showUidDetail = uid !== "" && lastToken.text !== "";

  return (
    <section aria-labelledby={headingId}>
      <h2
        id={headingId}
        className="text-muted-foreground mb-2 font-bold capitalize"
      >
        {t("scan.lastScannedHeading")}
      </h2>
      <Card>
        {primaryValue === "" ? (
          // Same frame before the first scan, so the widget does not appear
          // and disappear.
          <EmptyState size="compact" title={t("scan.lastScannedEmpty")} />
        ) : (
          <div className="min-w-0">
            <div className="text-foreground flex min-w-0 items-start gap-1 font-medium">
              <span className="min-w-0 break-all">{primaryValue}</span>
              <CopyButton
                text={primaryValue}
                className="shrink-0 translate-y-0 self-center"
              />
            </div>
            {time && (
              <div className="text-muted-foreground mt-1 text-sm">{time}</div>
            )}
            {showUidDetail && (
              <div className="text-muted-foreground mt-1 flex items-start gap-1 text-xs">
                <span className="break-all">
                  {t("scan.lastScannedUid", { uid })}
                </span>
                <CopyButton
                  text={uid}
                  className="shrink-0 translate-y-0 self-center"
                />
              </div>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}
