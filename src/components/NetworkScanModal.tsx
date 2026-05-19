import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useNetworkScan, DiscoveredDevice } from "@/hooks/useNetworkScan";
import { SlideModal } from "./SlideModal";
import { DeviceRow } from "./DeviceRow";
import { EmptyState } from "./wui/EmptyState";

export interface SelectedScanDevice {
  address: string;
  name?: string;
  platform?: string;
  version?: string;
}

interface NetworkScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDevice: (device: SelectedScanDevice) => void;
}

function buildConnectionString(device: DiscoveredDevice): string {
  // Default Zaparoo port — drop it from the displayed/connect string.
  return device.port === 7497
    ? device.address
    : `${device.address}:${device.port}`;
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
    stopScan();
    onSelectDevice({
      address: buildConnectionString(device),
      name: device.name,
      platform: device.platform,
      version: device.version,
    });
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
            <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
            <p className="text-muted-foreground">
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
              <DeviceRow
                key={device.address}
                entry={{
                  address: buildConnectionString(device),
                  name: device.name,
                  platform: device.platform,
                  version: device.version,
                }}
                onSelect={() => handleSelectDevice(device)}
              />
            ))}
          </div>
        )}

        {/* Scanning indicator when we have results */}
        {isScanning && devices.length > 0 && (
          <div className="flex items-center justify-center gap-2 py-2">
            <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
            <p className="text-muted-foreground text-sm">
              {t("settings.networkScan.stillSearching")}
            </p>
          </div>
        )}

        {/* No devices found - only shows if scan fails to start */}
        {!isScanning && !error && devices.length === 0 && (
          <EmptyState title={t("settings.networkScan.noDevices")} />
        )}
      </div>
    </SlideModal>
  );
}
