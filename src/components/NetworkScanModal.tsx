import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  getDiscoveredDeviceIdentity,
  useNetworkScan,
  type DiscoveredDevice,
} from "@/hooks/useNetworkScan";
import { EmptyState } from "@/components/wui/EmptyState";
import { formatDeviceEndpoint, isValidHost } from "@/lib/devices/endpoint";
import type { DiscoveredDeviceRegistration } from "@/lib/devices/deviceRegistry";
import { SlideModal } from "./SlideModal";
import { DeviceRow } from "./DeviceRow";

export type SelectedScanDevice = DiscoveredDeviceRegistration;

interface NetworkScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDevice: (device: SelectedScanDevice) => void;
}

function toRegistration(
  device: DiscoveredDevice,
): DiscoveredDeviceRegistration {
  return {
    discoveryId: device.deviceId,
    hostname: device.hostname,
    addresses: device.addresses,
    port: device.port,
    name: device.name,
    platform: device.platform,
    version: device.version,
  };
}

/**
 * The address shown for a scan result.
 *
 * Prefer the DNS-SD hostname so the row reads the same as the record the
 * registry will create for it; services without a hostname still show an IP.
 */
function displayAddress(device: DiscoveredDevice): string {
  const host = device.hostname?.replace(/\.+$/, "") || device.address;
  if (!isValidHost(host)) return device.address;
  return formatDeviceEndpoint(host, device.port).address;
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
    onSelectDevice(toRegistration(device));
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
                key={getDiscoveredDeviceIdentity(device)}
                entry={{
                  address: displayAddress(device),
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
