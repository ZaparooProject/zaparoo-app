import classNames from "classnames";
import { useTranslation } from "react-i18next";

interface ReaderStatusRowProps {
  name: string;
  connected: boolean;
  /** Extra detail shown after the state, such as a driver or scan mode. */
  detail?: string;
  /** Marks the reader responsible for the media currently running. */
  holdingMedia?: boolean;
}

/**
 * One reader's state. Shared by the home reader strip and reader settings so
 * the two never drift into different row styles.
 */
export function ReaderStatusRow({
  name,
  connected,
  detail,
  holdingMedia,
}: ReaderStatusRowProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <span
        className={classNames(
          "h-2 w-2 shrink-0 rounded-full",
          connected ? "bg-green-500" : "bg-red-500",
        )}
        aria-hidden="true"
      />
      <span className="text-foreground min-w-0 truncate">{name}</span>
      <span className="text-muted-foreground shrink-0 text-sm">
        {holdingMedia
          ? t("scan.readerHolding")
          : connected
            ? t("scan.connectedHeading")
            : t("settings.notConnected")}
      </span>
      {detail && (
        <span className="text-muted-foreground ml-auto shrink-0 truncate text-sm">
          {detail}
        </span>
      )}
    </div>
  );
}
