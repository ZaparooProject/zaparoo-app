import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useNetworkScan, DiscoveredDevice } from "@/hooks/useNetworkScan";
import { SlideModal } from "./SlideModal";
import { Card } from "./wui/Card";

interface NetworkScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDevice: (address: string) => void;
}

function DeviceCard({
  device,
  onSelect,
}: {
  device: DiscoveredDevice;
  onSelect: () => void;
}) {
  const { t } = useTranslation();

  // Build connection string: use just IP if default port, otherwise IP:port
  const connectionString =
    device.port === 7497 ? device.address : `${device.address}:${device.port}`;

  return (
    <Card onClick={onSelect} className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="font-medium">{device.name}</span>
        {device.platform && (
          <span className="text-foreground-muted text-sm">
            {device.platform}
          </span>
        )}
      </div>
      <div className="text-foreground-muted text-sm">{connectionString}</div>
      {device.version && (
        <div className="text-foreground-muted text-xs">
          {t("settings.networkScan.version", { version: device.version })}
        </div>
      )}
    </Card>
  );
}

export function NetworkScanModal({
  isOpen,
  onClose,
  onSelectDevice,
}: NetworkScanModalProps) {
  const { t } = useTranslation();
  const { devices, isScanning, error, startScan, stopScan } = useNetworkScan();

  // Start scanning when modal opens, stop when it closes
  useEffect(() => {
    if (isOpen) {
      startScan();
    } else {
      stopScan();
    }
  }, [isOpen, startScan, stopScan]);

  const handleSelectDevice = (device: DiscoveredDevice) => {
    // Build connection string
    const connectionString =
      device.port === 7497
        ? device.address
        : `${device.address}:${device.port}`;

    stopScan();
    onSelectDevice(connectionString);
    onClose();
  };

  const handleClose = () => {
    stopScan();
    onClose();
  };

  return (
    <SlideModal
      isOpen={isOpen}
      close={handleClose}
      title={t("settings.networkScan.title")}
    >
      <div className="flex flex-col gap-3 pt-2">
        {/* Scanning indicator */}
        {isScanning && devices.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <Loader2 className="text-foreground-muted h-8 w-8 animate-spin" />
            <p className="text-foreground-muted">
              {t("settings.networkScan.searching")}
            </p>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="py-4 text-center">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Device list */}
        {devices.length > 0 && (
          <div className="flex flex-col gap-2">
            {devices.map((device) => (
              <DeviceCard
                key={device.address}
                device={device}
                onSelect={() => handleSelectDevice(device)}
              />
            ))}
          </div>
        )}

        {/* Scanning indicator when we have results */}
        {isScanning && devices.length > 0 && (
          <div className="flex items-center justify-center gap-2 py-2">
            <Loader2 className="text-foreground-muted h-4 w-4 animate-spin" />
            <p className="text-foreground-muted text-sm">
              {t("settings.networkScan.stillSearching")}
            </p>
          </div>
        )}

        {/* No devices found - only shows if scan fails to start */}
        {!isScanning && !error && devices.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <p className="text-foreground-muted">
              {t("settings.networkScan.noDevices")}
            </p>
          </div>
        )}
      </div>
    </SlideModal>
  );
}
