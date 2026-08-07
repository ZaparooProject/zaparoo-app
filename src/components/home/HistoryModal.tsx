import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { memo } from "react";
import { EmptyState } from "@/components/wui/EmptyState";
import { Button } from "@/components/wui/Button";
import { CoreAPI } from "@/lib/coreApi";
import { RepeatIcon } from "@/lib/images";
import { logger } from "@/lib/logger";
import type { HistoryResponse, HistoryResponseEntry } from "@/lib/models";
import { useStatusStore } from "@/lib/store";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import { SlideModal } from "../SlideModal";
import { CopyButton } from "../CopyButton";
import { errorColor } from "../ScanSpinner";

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  historyData: HistoryResponse | undefined;
}

export const HistoryModal = memo(function HistoryModal({
  isOpen,
  onClose,
  historyData,
}: HistoryModalProps) {
  const { t } = useTranslation();
  const connected = useStatusStore((state) => state.connected);

  const replayScan = (item: HistoryResponseEntry) => {
    void CoreAPI.run({
      type: item.type,
      uid: item.uid,
      text: item.text,
      data: item.data,
    }).catch((error) => {
      logger.error("Failed to replay scan", error, {
        category: "api",
        action: "replayScan",
        severity: "error",
      });
      showRateLimitedErrorToast(t("scan.historyReplayError"));
    });
  };

  const isEmpty =
    !!historyData && (!historyData.entries || historyData.entries.length === 0);

  return (
    <SlideModal isOpen={isOpen} close={onClose} title={t("scan.historyTitle")}>
      {isEmpty && <EmptyState title={t("scan.history.empty")} />}
      {historyData && !isEmpty && (
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
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
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
                  <Button
                    icon={<RepeatIcon size="20" />}
                    variant="outline"
                    size="sm"
                    aria-label={t("scan.historyReplay")}
                    disabled={
                      !connected ||
                      (item.uid === "" && item.text === "" && item.data === "")
                    }
                    onClick={() => replayScan(item)}
                  />
                </div>
              </div>
            ))}
        </div>
      )}
    </SlideModal>
  );
});
