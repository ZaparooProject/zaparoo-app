import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { QrCodeIcon } from "lucide-react";
import { ScanSpinner } from "../ScanSpinner";
import { Button } from "../wui/Button";
import { ScanResult } from "../../lib/models";

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

  return (
    <>
      {Capacitor.isNativePlatform() ? (
        <div className="mt-8 mb-9 text-center">
          <div onClick={onScanButton}>
            <ScanSpinner status={scanStatus} spinning={scanSession} />
          </div>
        </div>
      ) : (
        <div className="mt-8"></div>
      )}

      {connected && Capacitor.isNativePlatform() && (
        <div className="mb-4 flex justify-center">
          <Button
            variant="text"
            onClick={onCameraScan}
            label={t("scan.cameraMode")}
            icon={<QrCodeIcon />}
          />
        </div>
      )}
    </>
  );
}
