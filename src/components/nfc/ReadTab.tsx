import { useState } from "react";
import {
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  ShareIcon,
  WifiIcon,
  GlobeIcon,
  MessageCircleIcon,
  FileTextIcon,
  NfcIcon
} from "lucide-react";
import toast from "react-hot-toast";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/wui/Button";
import { Result } from "@/lib/nfc";

interface ReadTabProps {
  result: Result | null;
  onScan: () => void;
}

export function ReadTab({ result, onScan }: ReadTabProps) {
  const [showRawData, setShowRawData] = useState(false);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const shareTagData = async () => {
    if (!result?.info?.tag) return;

    const shareData = {
      title: "NFC Tag Data",
      text: `UID: ${result.info.tag.uid}\nText: ${result.info.tag.text}`
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        copyToClipboard(shareData.text, "Tag data");
      }
    } else {
      copyToClipboard(shareData.text, "Tag data");
    }
  };

  const getContentTypeIcon = (text: string) => {
    if (text.startsWith("http"))
      return <GlobeIcon size={16} className="text-blue-500" />;
    if (text.startsWith("wifi:"))
      return <WifiIcon size={16} className="text-green-500" />;
    if (text.includes("@"))
      return <MessageCircleIcon size={16} className="text-purple-500" />;
    return <FileTextIcon size={16} className="text-gray-500" />;
  };

  const { tag, rawTag } = result?.info || { tag: null, rawTag: null };

  return (
    <div className="space-y-4 px-2 pt-6">
      {/* Scan Button */}
      <Button
        onClick={onScan}
        icon={<NfcIcon size={16} />}
        label="Scan tag"
        className="w-full"
      />

      {/* Basic Information Card */}
      <div className="bg-background-secondary/50 space-y-4 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Tag Information</h3>
          {tag && (
            <Button
              icon={<ShareIcon size={16} />}
              onClick={shareTagData}
              size="sm"
              variant="outline"
              className="!px-3"
            />
          )}
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="uid">UID</Label>
            <div className="mt-1 flex items-center gap-2">
              <code className="bg-background/50 flex-1 rounded-lg px-3 py-2 font-mono text-sm">
                {tag?.uid || "-"}
              </code>
              {tag?.uid && (
                <Button
                  icon={<CopyIcon size={16} />}
                  onClick={() => copyToClipboard(tag.uid, "UID")}
                  size="sm"
                  variant="outline"
                  className="!px-3"
                />
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="content">Content</Label>
            <div className="mt-1 flex items-start gap-2">
              <div className="bg-background/50 flex-1 rounded-lg px-3 py-2">
                {tag?.text ? (
                  <>
                    <div className="mb-2 flex items-center gap-2">
                      {getContentTypeIcon(tag.text)}
                      <span className="text-foreground-secondary text-xs">
                        {tag.text.startsWith("http") && "URL"}
                        {tag.text.startsWith("wifi:") && "WiFi Credentials"}
                        {tag.text.includes("@") &&
                          !tag.text.startsWith("http") &&
                          "Email"}
                        {!tag.text.startsWith("http") &&
                          !tag.text.startsWith("wifi:") &&
                          !tag.text.includes("@") &&
                          "Text"}
                      </span>
                    </div>
                    <div className="text-sm break-all">{tag.text}</div>
                  </>
                ) : (
                  <div className="text-foreground-secondary text-sm">-</div>
                )}
              </div>
              {tag?.text && (
                <Button
                  icon={<CopyIcon size={16} />}
                  onClick={() => copyToClipboard(tag.text, "Content")}
                  size="sm"
                  variant="outline"
                  className="!px-3"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Technical Details Card */}
      <div className="bg-background-secondary/50 space-y-4 rounded-2xl p-4">
        <h3 className="text-lg font-semibold">Technical Details</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Writable</Label>
            <div className="mt-1 text-sm">
              {rawTag?.isWritable !== undefined ? (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                    rawTag.isWritable
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {rawTag.isWritable ? "Yes" : "No"}
                </span>
              ) : (
                <span className="text-foreground-secondary">-</span>
              )}
            </div>
          </div>

          <div>
            <Label>Max Size</Label>
            <div className="mt-1 font-mono text-sm">
              {rawTag?.maxSize ? `${rawTag.maxSize} bytes` : "-"}
            </div>
          </div>

          <div>
            <Label>Can Make Read-Only</Label>
            <div className="mt-1 text-sm">
              {rawTag?.canMakeReadOnly !== undefined ? (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                    rawTag.canMakeReadOnly
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {rawTag.canMakeReadOnly ? "Yes" : "No"}
                </span>
              ) : (
                <span className="text-foreground-secondary">-</span>
              )}
            </div>
          </div>

          <div>
            <Label>Manufacturer Code</Label>
            <div className="mt-1 font-mono text-sm">
              {rawTag?.manufacturerCode !== undefined
                ? rawTag.manufacturerCode
                : "-"}
            </div>
          </div>

          <div className="col-span-2">
            <Label>Technology Types</Label>
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
          <Label>NDEF Records ({rawTag?.message?.records?.length || 0})</Label>
          {rawTag?.message?.records && rawTag.message.records.length > 0 ? (
            <>
              <div className="mt-1 space-y-2">
                {rawTag.message.records.map((record, index) => (
                  <div key={index} className="bg-background/50 rounded-lg p-3">
                    <div className="mb-2 text-sm font-medium">
                      Record {index + 1}
                    </div>
                    <div className="space-y-1 text-xs">
                      <div>
                        <span className="font-medium">TNF:</span> {record.tnf}
                      </div>
                      {record.type && record.type.length > 0 && (
                        <div>
                          <span className="font-medium">Type:</span>{" "}
                          {record.type[0].toString(16)}
                        </div>
                      )}
                      {record.payload && (
                        <div>
                          <span className="font-medium">Payload:</span>
                          <div className="mt-1 font-mono text-xs break-all">
                            {showRawData
                              ? record.payload
                                  .map((byte) =>
                                    byte.toString(16).padStart(2, "0")
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
                label={showRawData ? "Hide Hex" : "Show Hex"}
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
        <h3 className="text-lg font-semibold">Low-Level Tag Data</h3>

        <div className="space-y-4">
          {/* Tag ID */}
          <div>
            <Label>Tag ID (UID)</Label>
            <div className="mt-1 flex items-center gap-2">
              <code className="bg-background/50 flex-1 rounded-lg px-3 py-2 font-mono text-sm">
                {rawTag?.id
                  ? showRawData
                    ? rawTag.id
                        .map((byte) => byte.toString(16).padStart(2, "0"))
                        .join(" ")
                    : rawTag.id
                        .map((byte) => byte.toString(16).padStart(2, "0"))
                        .join("")
                  : "-"}
              </code>
              {rawTag?.id && (
                <Button
                  icon={<CopyIcon size={16} />}
                  onClick={() =>
                    copyToClipboard(
                      rawTag
                        .id!.map((byte) => byte.toString(16).padStart(2, "0"))
                        .join(""),
                      "Tag ID"
                    )
                  }
                  size="sm"
                  variant="outline"
                  className="!px-3"
                />
              )}
            </div>
          </div>

          {/* ATQA bytes (Android NFC-A) */}
          <div>
            <Label>ATQA/SENS_RES (NFC-A)</Label>
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
            <Label>SAK/SEL_RES (NFC-A)</Label>
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
            <Label>Application Data (NFC-B)</Label>
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
            <Label>Historical Bytes (ISO-DEP)</Label>
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
            <Label>Manufacturer (NFC-F)</Label>
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
            <Label>System Code (NFC-F)</Label>
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
