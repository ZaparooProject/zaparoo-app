import { useState } from "react";
import { EyeIcon, EyeOffIcon, ShareIcon, NfcIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Share } from "@capacitor/share";
import toast from "react-hot-toast";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/wui/Button";
import { CopyButton } from "@/components/CopyButton";
import { Result } from "@/lib/nfc";
import { logger } from "@/lib/logger";

interface ReadTabProps {
  result: Result | null;
  onScan: () => void;
}

export function ReadTab({ result, onScan }: ReadTabProps) {
  const { t } = useTranslation();
  const [showRawData, setShowRawData] = useState(false);

  const shareTagData = async () => {
    if (!result?.info?.tag) return;

    const shareText = t("create.nfc.readTab.shareText", {
      uid: result.info.tag.uid,
      text: result.info.tag.text,
    });

    try {
      await Share.share({
        title: t("create.nfc.readTab.shareTitle"),
        text: shareText,
        dialogTitle: t("create.nfc.readTab.shareTitle"),
      });
    } catch (error) {
      logger.error("Failed to share tag data:", error, {
        category: "share",
        action: "shareTagData",
        severity: "warning",
      });
      toast.error(t("shareFailed"));
    }
  };

  const { tag, rawTag } = result?.info || { tag: null, rawTag: null };

  return (
    <div className="space-y-4 px-2 pt-6">
      {/* Scan Button */}
      <Button
        onClick={onScan}
        icon={<NfcIcon size={16} />}
        label={t("create.nfc.readTab.scanTag")}
        className="w-full"
      />

      {/* Basic Information Card */}
      <div className="bg-background-secondary/50 space-y-4 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {t("create.nfc.readTab.tagInformation")}
          </h3>
          {tag && (
            <Button
              icon={<ShareIcon size={16} />}
              onClick={shareTagData}
              size="sm"
              variant="outline"
            />
          )}
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="uid">{t("create.nfc.readTab.uid")}</Label>
            <div className="bg-background/50 mt-1 rounded-lg px-3 py-2 font-mono text-sm">
              {tag?.uid || "-"}
              {tag?.uid && <CopyButton text={tag.uid} className="ml-1" />}
            </div>
          </div>

          <div>
            <Label htmlFor="content">{t("create.nfc.readTab.content")}</Label>
            <div className="bg-background/50 mt-1 rounded-lg px-3 py-2 text-sm break-all">
              {tag?.text || (
                <span className="text-foreground-secondary">-</span>
              )}
              {tag?.text && <CopyButton text={tag.text} className="ml-1" />}
            </div>
          </div>
        </div>
      </div>

      {/* Technical Details Card */}
      <div className="bg-background-secondary/50 space-y-4 rounded-2xl p-4">
        <h3 className="text-lg font-semibold">
          {t("create.nfc.readTab.technicalDetails")}
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>{t("create.nfc.readTab.writable")}</Label>
            <div className="mt-1 text-sm">
              {rawTag?.isWritable !== undefined ? (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                    rawTag.isWritable
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {rawTag.isWritable
                    ? t("create.nfc.readTab.yes")
                    : t("create.nfc.readTab.no")}
                </span>
              ) : (
                <span className="text-foreground-secondary">-</span>
              )}
            </div>
          </div>

          <div>
            <Label>{t("create.nfc.readTab.maxSize")}</Label>
            <div className="mt-1 font-mono text-sm">
              {rawTag?.maxSize
                ? `${rawTag.maxSize} ${t("create.nfc.readTab.bytes")}`
                : "-"}
            </div>
          </div>

          <div>
            <Label>{t("create.nfc.readTab.canMakeReadOnly")}</Label>
            <div className="mt-1 text-sm">
              {rawTag?.canMakeReadOnly !== undefined ? (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                    rawTag.canMakeReadOnly
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {rawTag.canMakeReadOnly
                    ? t("create.nfc.readTab.yes")
                    : t("create.nfc.readTab.no")}
                </span>
              ) : (
                <span className="text-foreground-secondary">-</span>
              )}
            </div>
          </div>

          <div>
            <Label>{t("create.nfc.readTab.manufacturerCode")}</Label>
            <div className="mt-1 font-mono text-sm">
              {rawTag?.manufacturerCode !== undefined
                ? rawTag.manufacturerCode
                : "-"}
            </div>
          </div>

          <div className="col-span-2">
            <Label>{t("create.nfc.readTab.technologyTypes")}</Label>
            <div className="mt-1 flex flex-wrap gap-1">
              {rawTag?.techTypes ? (
                rawTag.techTypes.map((tech, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800"
                  >
                    {tech}
                  </span>
                ))
              ) : (
                <span className="text-foreground-secondary">-</span>
              )}
            </div>
          </div>
        </div>

        <div>
          <Label>
            {t("create.nfc.readTab.ndefRecords", {
              count: rawTag?.message?.records?.length || 0,
            })}
          </Label>
          {rawTag?.message?.records && rawTag.message.records.length > 0 ? (
            <>
              <div className="mt-1 space-y-2">
                {rawTag.message.records.map((record, index) => (
                  <div key={index} className="bg-background/50 rounded-lg p-3">
                    <div className="mb-2 text-sm font-medium">
                      {t("create.nfc.readTab.record", { index: index + 1 })}
                    </div>
                    <div className="space-y-1 text-xs">
                      <div>
                        <span className="font-medium">
                          {t("create.nfc.readTab.tnf")}
                        </span>{" "}
                        {record.tnf}
                      </div>
                      {record.type && record.type.length > 0 && (
                        <div>
                          <span className="font-medium">
                            {t("create.nfc.readTab.type")}
                          </span>{" "}
                          {record.type[0]?.toString(16)}
                        </div>
                      )}
                      {record.payload && (
                        <div>
                          <span className="font-medium">
                            {t("create.nfc.readTab.payload")}
                          </span>
                          <div className="mt-1 font-mono text-xs break-all">
                            {showRawData
                              ? record.payload
                                  .map((byte) =>
                                    byte.toString(16).padStart(2, "0"),
                                  )
                                  .join(" ")
                              : record.payload
                                  .map((byte) => String.fromCharCode(byte))
                                  .join("")}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <Button
                icon={
                  showRawData ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />
                }
                label={
                  showRawData
                    ? t("create.nfc.readTab.hideHex")
                    : t("create.nfc.readTab.showHex")
                }
                onClick={() => setShowRawData(!showRawData)}
                size="sm"
                variant="outline"
                className="mt-4"
              />
            </>
          ) : (
            <div className="text-foreground-secondary mt-1 text-sm">-</div>
          )}
        </div>
      </div>

      {/* Low-Level Tag Data Card */}
      <div className="bg-background-secondary/50 space-y-4 rounded-2xl p-4">
        <h3 className="text-lg font-semibold">
          {t("create.nfc.readTab.lowLevelTagData")}
        </h3>

        <div className="space-y-4">
          {/* Tag ID */}
          <div>
            <Label>{t("create.nfc.readTab.tagId")}</Label>
            <code className="bg-background/50 mt-1 block rounded-lg px-3 py-2 font-mono text-sm">
              {rawTag?.id
                ? showRawData
                  ? rawTag.id
                      .map((byte) => byte.toString(16).padStart(2, "0"))
                      .join(" ")
                  : rawTag.id
                      .map((byte) => byte.toString(16).padStart(2, "0"))
                      .join("")
                : "-"}
              {rawTag?.id && (
                <CopyButton
                  text={rawTag.id
                    .map((byte) => byte.toString(16).padStart(2, "0"))
                    .join("")}
                  className="ml-1"
                />
              )}
            </code>
          </div>

          {/* ATQA bytes (Android NFC-A) */}
          <div>
            <Label>{t("create.nfc.readTab.atqa")}</Label>
            <div className="bg-background/50 mt-1 rounded-lg px-3 py-2 font-mono text-sm">
              {rawTag?.atqa
                ? showRawData
                  ? rawTag.atqa
                      .map((byte) => byte.toString(16).padStart(2, "0"))
                      .join(" ")
                  : `0x${rawTag.atqa.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`
                : "-"}
            </div>
          </div>

          {/* SAK bytes (Android NFC-A) */}
          <div>
            <Label>{t("create.nfc.readTab.sak")}</Label>
            <div className="bg-background/50 mt-1 rounded-lg px-3 py-2 font-mono text-sm">
              {rawTag?.sak
                ? showRawData
                  ? rawTag.sak
                      .map((byte) => byte.toString(16).padStart(2, "0"))
                      .join(" ")
                  : `0x${rawTag.sak.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`
                : "-"}
            </div>
          </div>

          {/* Application Data (NFC-B) */}
          <div>
            <Label>{t("create.nfc.readTab.applicationData")}</Label>
            <div className="bg-background/50 mt-1 rounded-lg px-3 py-2 font-mono text-sm">
              {rawTag?.applicationData
                ? showRawData
                  ? rawTag.applicationData
                      .map((byte) => byte.toString(16).padStart(2, "0"))
                      .join(" ")
                  : `0x${rawTag.applicationData.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`
                : "-"}
            </div>
          </div>

          {/* Historical Bytes (ISO-DEP) */}
          <div>
            <Label>{t("create.nfc.readTab.historicalBytes")}</Label>
            <div className="bg-background/50 mt-1 rounded-lg px-3 py-2 font-mono text-sm">
              {rawTag?.historicalBytes
                ? showRawData
                  ? rawTag.historicalBytes
                      .map((byte) => byte.toString(16).padStart(2, "0"))
                      .join(" ")
                  : `0x${rawTag.historicalBytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`
                : "-"}
            </div>
          </div>

          {/* Manufacturer bytes (NFC-F) */}
          <div>
            <Label>{t("create.nfc.readTab.manufacturer")}</Label>
            <div className="bg-background/50 mt-1 rounded-lg px-3 py-2 font-mono text-sm">
              {rawTag?.manufacturer
                ? showRawData
                  ? rawTag.manufacturer
                      .map((byte) => byte.toString(16).padStart(2, "0"))
                      .join(" ")
                  : `0x${rawTag.manufacturer.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`
                : "-"}
            </div>
          </div>

          {/* System Code (NFC-F) */}
          <div>
            <Label>{t("create.nfc.readTab.systemCode")}</Label>
            <div className="bg-background/50 mt-1 rounded-lg px-3 py-2 font-mono text-sm">
              {rawTag?.systemCode
                ? showRawData
                  ? rawTag.systemCode
                      .map((byte) => byte.toString(16).padStart(2, "0"))
                      .join(" ")
                  : `0x${rawTag.systemCode.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`
                : "-"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
