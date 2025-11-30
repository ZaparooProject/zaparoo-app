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
    <div className="p-3">
      <div className="flex flex-row items-center justify-between">
        <p className="font-bold text-gray-400 capitalize">
          {t("scan.lastScannedHeading")}
        </p>
      </div>
      <div
        className={classNames({
          color: scanStatus === ScanResult.Success ? successColor : "",
        })}
      >
        <p>
          {t("scan.lastScannedTime", {
            time:
              lastToken.uid === "" && lastToken.text === ""
                ? "-"
                : new Date(lastToken.scanTime).toLocaleString(),
          })}
        </p>
        {lastToken.uid !== lastToken.text && (
          <p style={{ wordBreak: "break-all" }}>
            {t("scan.lastScannedUid", {
              uid:
                lastToken.uid === "" || lastToken.uid === "__api__"
                  ? "-"
                  : lastToken.uid,
            })}
            {lastToken.uid !== "" && lastToken.uid !== "__api__" && (
              <CopyButton text={lastToken.uid} className="ml-1" />
            )}
          </p>
        )}
        <p style={{ wordBreak: "break-all" }}>
          {t("scan.lastScannedText", {
            text: lastToken.text === "" ? "-" : lastToken.text,
          })}
          {lastToken.text !== "" && (
            <CopyButton text={lastToken.text} className="ml-1" />
          )}
        </p>
      </div>
    </div>
  );
}
