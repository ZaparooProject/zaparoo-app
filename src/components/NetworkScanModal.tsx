import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  getDiscoveredDeviceIdentity,
  useNetworkScan,
  type DiscoveredDevice,
} from "@/hooks/useNetworkScan";
import { EmptyState } from "@/components/wui/EmptyState";
import { credentialStore, normalizeDeviceKey } from "@/lib/crypto/credentials";
import { SlideModal } from "./SlideModal";
import { DeviceRow } from "./DeviceRow";

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

function formatConnectionString(host: string, port: number): string {
  const formattedHost = host.includes(":") ? `[${host}]` : host;
  return port === 7497 ? formattedHost : `${formattedHost}:${port}`;
}

function buildConnectionString(device: DiscoveredDevice): string {
  // Prefer the DNS-SD hostname so one saved pairing survives interface and
  // DHCP address changes. Services without a hostname still connect by IP.
  return formatConnectionString(device.hostname || device.address, device.port);
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
    const address = buildConnectionString(device);

    if (device.hostname) {
      // Before 1.12, scan selections were saved by IP. Register that key as a
      // one-shot fallback so selecting the new stable hostname preserves the
      // existing pairing and migrates it on the first credential lookup.
      credentialStore.registerFallback(
        normalizeDeviceKey(address),
        normalizeDeviceKey(formatConnectionString(device.address, device.port)),
      );
    }

    onSelectDevice({
      address,
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
                key={getDiscoveredDeviceIdentity(device)}
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
