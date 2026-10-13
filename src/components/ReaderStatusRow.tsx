import classNames from "classnames";
import { useTranslation } from "react-i18next";

interface ReaderStatusRowProps {
  name: string;
  connected: boolean;
  /** Extra detail shown after the state, such as a driver or scan mode. */
  detail?: string;
  /** Marks the reader responsible for the media currently running. */
  holdingMedia?: boolean;
  /** Keep the reader name/state readable in narrow enlarged-text panels. */
  reflow?: boolean;
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
  reflow = false,
}: ReaderStatusRowProps) {
  const { t } = useTranslation();

  return (
    <div
      className={classNames("flex items-center gap-2", { "flex-wrap": reflow })}
    >
      <span
        className={classNames(
          "flex min-w-0 items-center gap-2",
          reflow ? "flex-[1_1_8rem]" : "flex-1",
        )}
      >
        <span
          className={classNames(
            "h-2 w-2 shrink-0 rounded-full",
            connected ? "bg-success" : "bg-error",
          )}
          aria-hidden="true"
        />
        <span
          className={classNames(
            "text-foreground min-w-0 flex-1",
            reflow ? "wrap-anywhere" : "truncate",
          )}
        >
          {name}
        </span>
      </span>
      <span
        className={classNames("text-muted-foreground shrink-0 text-sm", {
          "max-w-full wrap-anywhere": reflow,
        })}
      >
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
