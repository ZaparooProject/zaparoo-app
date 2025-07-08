import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { CameraIcon } from "lucide-react";
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
        <div className="mb-9 mt-8 text-center">
          <div onClick={onScanButton}>
            <ScanSpinner status={scanStatus} spinning={scanSession} />
          </div>
        </div>
      ) : (
        <div className="mt-8"></div>
      )}

      {connected && Capacitor.isNativePlatform() && (
        <div className="mb-3">
          <Button
            className="w-full"
            variant="outline"
            onClick={onCameraScan}
            label={t("scan.cameraMode")}
            icon={<CameraIcon />}
          />
        </div>
      )}
    </>
  );
}