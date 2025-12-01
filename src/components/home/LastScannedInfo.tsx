import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { TokenResponse, ScanResult } from "../../lib/models";
import { successColor } from "../ScanSpinner";
import { CopyButton } from "../CopyButton";

interface LastScannedInfoProps {
  lastToken: TokenResponse;
  scanStatus: ScanResult;
}

export function LastScannedInfo({
  lastToken,
  scanStatus,
}: LastScannedInfoProps) {
  const { t } = useTranslation();

  return (
    <section className="p-3" aria-labelledby="last-scanned-heading">
      <div className="flex flex-row items-center justify-between">
        <h2
          id="last-scanned-heading"
          className="font-bold text-gray-400 capitalize"
        >
          {t("scan.lastScannedHeading")}
        </h2>
      </div>
      <div
        className={classNames({
          color: scanStatus === ScanResult.Success ? successColor : "",
        })}
      >
        <p>
          {t("scan.lastScannedTime", { time: "" })}
          {lastToken.uid === "" && lastToken.text === "" ? (
            <>
              <span aria-hidden="true">—</span>
              <span className="sr-only">{t("none")}</span>
            </>
          ) : (
            new Date(lastToken.scanTime).toLocaleString()
          )}
        </p>
        {lastToken.uid !== lastToken.text && (
          <p style={{ wordBreak: "break-all" }}>
            {t("scan.lastScannedUid", { uid: "" })}
            {lastToken.uid === "" || lastToken.uid === "__api__" ? (
              <>
                <span aria-hidden="true">—</span>
                <span className="sr-only">{t("none")}</span>
              </>
            ) : (
              <>
                {lastToken.uid}
                <CopyButton text={lastToken.uid} className="ml-1" />
              </>
            )}
          </p>
        )}
        <p style={{ wordBreak: "break-all" }}>
          {t("scan.lastScannedText", { text: "" })}
          {lastToken.text === "" ? (
            <>
              <span aria-hidden="true">—</span>
              <span className="sr-only">{t("none")}</span>
            </>
          ) : (
            <>
              {lastToken.text}
              <CopyButton text={lastToken.text} className="ml-1" />
            </>
          )}
        </p>
      </div>
    </section>
  );
}
