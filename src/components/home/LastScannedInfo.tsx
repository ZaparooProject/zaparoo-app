import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { TokenResponse, ScanResult } from "@/lib/models";
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
          <span>
            {lastToken.uid === "" && lastToken.text === ""
              ? t("none")
              : new Date(lastToken.scanTime).toLocaleString()}
          </span>
        </p>
        {lastToken.uid !== lastToken.text && (
          <p style={{ wordBreak: "break-all" }}>
            {t("scan.lastScannedUid", { uid: "" })}
            <span>
              {lastToken.uid === "" || lastToken.uid === "__api__" ? (
                t("none")
              ) : (
                <>
                  {lastToken.uid}
                  <CopyButton text={lastToken.uid} className="ml-1" />
                </>
              )}
            </span>
          </p>
        )}
        <p style={{ wordBreak: "break-all" }}>
          {t("scan.lastScannedText", { text: "" })}
          <span>
            {lastToken.text === "" ? (
              t("none")
            ) : (
              <>
                {lastToken.text}
                <CopyButton text={lastToken.text} className="ml-1" />
              </>
            )}
          </span>
        </p>
      </div>
    </section>
  );
}
