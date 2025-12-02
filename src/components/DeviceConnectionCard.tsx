import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRightIcon } from "lucide-react";
import { useConnection } from "../hooks/useConnection";
import { CoreAPI, getDeviceAddress } from "../lib/coreApi";
import { Card } from "./wui/Card";
import { Button } from "./wui/Button";
import { TextInput } from "./wui/TextInput";
import { ConnectionStatusDisplay } from "./ConnectionStatusDisplay";

interface DeviceConnectionCardProps {
  address: string;
  setAddress: (address: string) => void;
  onAddressChange: (address: string) => void;
  connectionError: string;
  hasDeviceHistory: boolean;
  onHistoryClick: () => void;
}

export function DeviceConnectionCard({
  address,
  setAddress,
  onAddressChange,
  connectionError,
  hasDeviceHistory,
  onHistoryClick,
}: DeviceConnectionCardProps) {
  const { t } = useTranslation();
  const { isConnected } = useConnection();

  // Fetch version info when connected
  const { data: version, isLoading: isVersionLoading } = useQuery({
    queryKey: ["version", address],
    queryFn: () => CoreAPI.version(),
    enabled: isConnected && !!address,
  });

  // Settings page shows version/platform info as subtitle
  const connectedSubtitle = version
    ? `${version.platform} (${/^\d+\.\d+\.\d+/.test(version.version) ? "v" : ""}${version.version})`
    : undefined;

  return (
    <section aria-labelledby="device-connection-heading">
      <Card>
        <div className="flex flex-col gap-3">
          {/* Device address input */}
          <TextInput
            label={t("settings.device")}
            placeholder="192.168.1.23"
            value={address}
            setValue={setAddress}
            saveValue={onAddressChange}
            onKeyUp={(e) => {
              if (e.key === "Enter" && address !== getDeviceAddress()) {
                onAddressChange(address);
              }
            }}
          />

          {/* Connection status row */}
          <ConnectionStatusDisplay
            connectionError={connectionError}
            connectedSubtitle={connectedSubtitle}
            connectedSubtitleLoading={isVersionLoading}
            action={
              <Button
                icon={<ArrowLeftRightIcon size="24" />}
                variant="text"
                onClick={onHistoryClick}
                aria-label={t("settings.deviceHistory")}
                disabled={!hasDeviceHistory}
              />
            }
          />
        </div>
      </Card>
    </section>
  );
}
