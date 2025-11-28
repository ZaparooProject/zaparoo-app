import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { Camera } from "lucide-react";
import { ScanSpinner } from "../ScanSpinner";
import { Button } from "../wui/Button";
import { ScanResult } from "../../lib/models";
import { usePreferencesStore } from "../../lib/preferencesStore";

/** Get screen reader announcement for current scan state */
function getScanStatusAnnouncement(
  scanSession: boolean,
  scanStatus: ScanResult,
  t: (key: string) => string
): string {
  if (scanSession) {
    return t("scan.statusScanning");
  }
  if (scanStatus === ScanResult.Success) {
    return t("scan.statusSuccess");
  }
  if (scanStatus === ScanResult.Error) {
    return t("scan.statusError");
  }
  return "";
}

interface ScanControlsProps {
  scanSession: boolean;
  scanStatus: ScanResult;
  connected: boolean;
  onScanButton: () => void;
  onCameraScan: () => void;
}

export function ScanControls({
  scanSession,
  scanStatus,
  connected,
  onScanButton,
  onCameraScan
}: ScanControlsProps) {
  const { t } = useTranslation();
  const nfcAvailable = usePreferencesStore((state) => state.nfcAvailable);
  const cameraAvailable = usePreferencesStore((state) => state.cameraAvailable);

  const statusAnnouncement = getScanStatusAnnouncement(scanSession, scanStatus, t);

  return (
    <>
      {/* Screen reader announcement for scan status changes */}
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {statusAnnouncement}
      </div>

      {Capacitor.isNativePlatform() && nfcAvailable ? (
        <div className="mt-8 mb-9 text-center">
          <div
            onClick={onScanButton}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onScanButton();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={t("scan.pressToScan")}
            className="inline-block cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-4 focus-visible:ring-offset-background"
          >
            <ScanSpinner status={scanStatus} spinning={scanSession} />
          </div>
        </div>
      ) : (
        <div className="mt-8"></div>
      )}

      {connected && Capacitor.isNativePlatform() && cameraAvailable && (
        <div className="mb-4 flex justify-center">
          <Button
            variant="text"
            onClick={onCameraScan}
            label={t("scan.cameraMode")}
            icon={<Camera size={20} />}
          />
        </div>
      )}
    </>
  );
}
