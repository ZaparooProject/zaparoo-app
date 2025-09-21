import { useState } from "react";
import {
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  ShareIcon,
  WifiIcon,
  GlobeIcon,
  MessageCircleIcon,
  FileTextIcon
} from "lucide-react";
import toast from "react-hot-toast";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/wui/Button";
import { Result } from "@/lib/nfc";

interface ReadTabProps {
  result: Result | null;
  onScan: () => void;
  isScanning: boolean;
}

export function ReadTab({ result, onScan, isScanning }: ReadTabProps) {
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
    if (text.startsWith("http")) return <GlobeIcon size={16} className="text-blue-500" />;
    if (text.startsWith("wifi:")) return <WifiIcon size={16} className="text-green-500" />;
    if (text.includes("@")) return <MessageCircleIcon size={16} className="text-purple-500" />;
    return <FileTextIcon size={16} className="text-gray-500" />;
  };

  const { tag, rawTag } = result?.info || { tag: null, rawTag: null };

  return (
    <div className="p-4 space-y-6">
      {/* Scan Button */}
      <Button
        onClick={onScan}
        label={isScanning ? "Scanning..." : "Scan Tag"}
        disabled={isScanning}
        className="w-full"
      />

      {/* Basic Information Card */}
      <div className="bg-background-secondary/50 rounded-2xl p-4 space-y-4">
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

        <div className="space-y-3">
          <div>
            <Label htmlFor="uid">UID</Label>
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 bg-background/50 rounded-lg px-3 py-2 text-sm font-mono">
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
            <div className="flex items-start gap-2 mt-1">
              <div className="flex-1 bg-background/50 rounded-lg px-3 py-2">
                {tag?.text ? (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      {getContentTypeIcon(tag.text)}
                      <span className="text-xs text-foreground-secondary">
                        {tag.text.startsWith("http") && "URL"}
                        {tag.text.startsWith("wifi:") && "WiFi Credentials"}
                        {tag.text.includes("@") && !tag.text.startsWith("http") && "Email"}
                        {!tag.text.startsWith("http") && !tag.text.startsWith("wifi:") && !tag.text.includes("@") && "Text"}
                      </span>
                    </div>
                    <div className="text-sm break-all">
                      {tag.text}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-foreground-secondary">-</div>
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
      <div className="bg-background-secondary/50 rounded-2xl p-4 space-y-4">
        <h3 className="text-lg font-semibold">Technical Details</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Writable</Label>
            <div className="text-sm mt-1">
              {rawTag?.isWritable !== undefined ? (
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  rawTag.isWritable
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}>
                  {rawTag.isWritable ? "Yes" : "No"}
                </span>
              ) : (
                <span className="text-foreground-secondary">-</span>
              )}
            </div>
          </div>

          <div>
            <Label>Max Size</Label>
            <div className="text-sm mt-1 font-mono">
              {rawTag?.maxSize ? `${rawTag.maxSize} bytes` : "-"}
            </div>
          </div>

          <div>
            <Label>Can Make Read-Only</Label>
            <div className="text-sm mt-1">
              {rawTag?.canMakeReadOnly !== undefined ? (
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  rawTag.canMakeReadOnly
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}>
                  {rawTag.canMakeReadOnly ? "Yes" : "No"}
                </span>
              ) : (
                <span className="text-foreground-secondary">-</span>
              )}
            </div>
          </div>

          <div>
            <Label>Manufacturer Code</Label>
            <div className="text-sm mt-1 font-mono">
              {rawTag?.manufacturerCode !== undefined ? rawTag.manufacturerCode : "-"}
            </div>
          </div>

          <div className="col-span-2">
            <Label>Technology Types</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {rawTag?.techTypes ? (
                rawTag.techTypes.map((tech, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
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
              <div className="space-y-2 mt-2">
                {rawTag.message.records.map((record, index) => (
                  <div key={index} className="bg-background/50 rounded-lg p-3">
                    <div className="text-sm font-medium mb-2">Record {index + 1}</div>
                    <div className="text-xs space-y-1">
                      <div><span className="font-medium">TNF:</span> {record.tnf}</div>
                      {record.type && record.type.length > 0 && (
                        <div><span className="font-medium">Type:</span> {record.type[0].toString(16)}</div>
                      )}
                      {record.payload && (
                        <div>
                          <span className="font-medium">Payload:</span>
                          <div className="mt-1 font-mono text-xs break-all">
                            {showRawData
                              ? record.payload.map(byte => byte.toString(16).padStart(2, '0')).join(' ')
                              : record.payload.map(byte => String.fromCharCode(byte)).join('')
                            }
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <Button
                icon={showRawData ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                label={showRawData ? "Hide Hex" : "Show Hex"}
                onClick={() => setShowRawData(!showRawData)}
                size="sm"
                variant="outline"
                className="mt-2"
              />
            </>
          ) : (
            <div className="text-sm text-foreground-secondary mt-2">-</div>
          )}
        </div>
      </div>

      {/* Low-Level Tag Data Card */}
      <div className="bg-background-secondary/50 rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Low-Level Tag Data</h3>
          <Button
            icon={showRawData ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            label={showRawData ? "Hide Hex" : "Show Hex"}
            onClick={() => setShowRawData(!showRawData)}
            size="sm"
            variant="outline"
          />
        </div>

        <div className="space-y-3">
          {/* Tag ID */}
          <div>
              <Label>Tag ID (UID)</Label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 bg-background/50 rounded-lg px-3 py-2 text-sm font-mono">
                  {rawTag?.id ? (
                    showRawData
                      ? rawTag.id.map(byte => byte.toString(16).padStart(2, '0')).join(' ')
                      : rawTag.id.map(byte => byte.toString(16).padStart(2, '0')).join('')
                  ) : "-"}
                </code>
                {rawTag?.id && (
                  <Button
                    icon={<CopyIcon size={16} />}
                    onClick={() => copyToClipboard(rawTag.id!.map(byte => byte.toString(16).padStart(2, '0')).join(''), "Tag ID")}
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
              <div className="text-sm mt-1 font-mono bg-background/50 rounded-lg px-3 py-2">
                {rawTag?.atqa ? (
                  showRawData
                    ? rawTag.atqa.map(byte => byte.toString(16).padStart(2, '0')).join(' ')
                    : `0x${rawTag.atqa.map(byte => byte.toString(16).padStart(2, '0')).join('')}`
                ) : "-"}
              </div>
            </div>

            {/* SAK bytes (Android NFC-A) */}
            <div>
              <Label>SAK/SEL_RES (NFC-A)</Label>
              <div className="text-sm mt-1 font-mono bg-background/50 rounded-lg px-3 py-2">
                {rawTag?.sak ? (
                  showRawData
                    ? rawTag.sak.map(byte => byte.toString(16).padStart(2, '0')).join(' ')
                    : `0x${rawTag.sak.map(byte => byte.toString(16).padStart(2, '0')).join('')}`
                ) : "-"}
              </div>
            </div>

            {/* Application Data (NFC-B) */}
            <div>
              <Label>Application Data (NFC-B)</Label>
              <div className="text-sm mt-1 font-mono bg-background/50 rounded-lg px-3 py-2">
                {rawTag?.applicationData ? (
                  showRawData
                    ? rawTag.applicationData.map(byte => byte.toString(16).padStart(2, '0')).join(' ')
                    : `0x${rawTag.applicationData.map(byte => byte.toString(16).padStart(2, '0')).join('')}`
                ) : "-"}
              </div>
            </div>

            {/* Historical Bytes (ISO-DEP) */}
            <div>
              <Label>Historical Bytes (ISO-DEP)</Label>
              <div className="text-sm mt-1 font-mono bg-background/50 rounded-lg px-3 py-2">
                {rawTag?.historicalBytes ? (
                  showRawData
                    ? rawTag.historicalBytes.map(byte => byte.toString(16).padStart(2, '0')).join(' ')
                    : `0x${rawTag.historicalBytes.map(byte => byte.toString(16).padStart(2, '0')).join('')}`
                ) : "-"}
              </div>
            </div>

            {/* Manufacturer bytes (NFC-F) */}
            <div>
              <Label>Manufacturer (NFC-F)</Label>
              <div className="text-sm mt-1 font-mono bg-background/50 rounded-lg px-3 py-2">
                {rawTag?.manufacturer ? (
                  showRawData
                    ? rawTag.manufacturer.map(byte => byte.toString(16).padStart(2, '0')).join(' ')
                    : `0x${rawTag.manufacturer.map(byte => byte.toString(16).padStart(2, '0')).join('')}`
                ) : "-"}
              </div>
            </div>

            {/* System Code (NFC-F) */}
            <div>
              <Label>System Code (NFC-F)</Label>
              <div className="text-sm mt-1 font-mono bg-background/50 rounded-lg px-3 py-2">
                {rawTag?.systemCode ? (
                  showRawData
                    ? rawTag.systemCode.map(byte => byte.toString(16).padStart(2, '0')).join(' ')
                    : `0x${rawTag.systemCode.map(byte => byte.toString(16).padStart(2, '0')).join('')}`
                ) : "-"}
              </div>
            </div>
        </div>
      </div>
    </div>
  );
}