import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { memo } from "react";
import { SlideModal } from "../SlideModal";
import { CopyButton } from "../CopyButton";
import { errorColor } from "../ScanSpinner";

interface HistoryEntry {
  uid: string;
  text: string;
  time: string;
  success: boolean;
}

interface HistoryData {
  entries: HistoryEntry[];
}

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  historyData: HistoryData | undefined;
}

export const HistoryModal = memo(function HistoryModal({
  isOpen,
  onClose,
  historyData,
}: HistoryModalProps) {
  const { t } = useTranslation();

  return (
    <SlideModal isOpen={isOpen} close={onClose} title={t("scan.historyTitle")}>
      {historyData && (
        <div>
          {historyData.entries &&
            historyData.entries.map((item, i) => (
              <div
                key={i}
                className={classNames("text-sm")}
                style={{
                  color: item.success ? "" : errorColor,
                  borderBottom:
                    i === historyData.entries.length - 1
                      ? ""
                      : "1px solid rgba(255,255,255,0.6)",
                  padding: "0.5rem",
                }}
              >
                <p>
                  {t("scan.lastScannedTime", {
                    time:
                      item.uid === "" && item.text === ""
                        ? "-"
                        : new Date(item.time).toLocaleString(),
                  })}
                </p>
                <p style={{ wordBreak: "break-all" }}>
                  {t("scan.lastScannedUid", {
                    uid:
                      item.uid === "" || item.uid === "__api__"
                        ? "-"
                        : item.uid,
                  })}
                  {item.uid !== "" && item.uid !== "__api__" && (
                    <CopyButton text={item.uid} className="ml-1" />
                  )}
                </p>
                <p style={{ wordBreak: "break-all" }}>
                  {t("scan.lastScannedText", {
                    text: item.text === "" ? "-" : item.text,
                  })}
                  {item.text !== "" && (
                    <CopyButton text={item.text} className="ml-1" />
                  )}
                </p>
              </div>
            ))}
        </div>
      )}
    </SlideModal>
  );
});
