import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { ArrowLeftRightIcon, SearchIcon } from "lucide-react";
import { useConnection } from "@/hooks/useConnection";
import { getDeviceAddress } from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";
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
  onScanClick?: () => void;
}

export function DeviceConnectionCard({
  address,
  setAddress,
  onAddressChange,
  connectionError,
  hasDeviceHistory,
  onHistoryClick,
  onScanClick,
}: DeviceConnectionCardProps) {
  const { t } = useTranslation();
  const { isConnected } = useConnection();

  const savedAddress = getDeviceAddress();
  const coreVersion = useStatusStore((state) => state.coreVersion);
  const corePlatform = useStatusStore((state) => state.corePlatform);
  const coreVersionPending = useStatusStore(
    (state) => state.coreVersionPending,
  );

  const versionLabel =
    coreVersion !== null
      ? `${/^\d+\.\d+\.\d+/.test(coreVersion) ? "v" : ""}${coreVersion}`
      : undefined;
  const connectedSubtitle = versionLabel
    ? corePlatform
      ? `${corePlatform} (${versionLabel})`
      : versionLabel
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
            saveDisabled={address === savedAddress}
            autoComplete="off"
            onKeyUp={(e) => {
              if (e.key === "Enter" && address !== savedAddress) {
                onAddressChange(address);
              }
            }}
          />

          {/* Connection status row */}
          <ConnectionStatusDisplay
            connectionError={connectionError}
            connectedSubtitle={connectedSubtitle}
            connectedSubtitleLoading={isConnected && coreVersionPending}
            action={
              <div className="flex items-center gap-1">
                {/* Network scan button - only on native platforms */}
                {Capacitor.isNativePlatform() && onScanClick && (
                  <Button
                    icon={<SearchIcon size="24" />}
                    variant="text"
                    onClick={onScanClick}
                    aria-label={t("settings.networkScan.title")}
                  />
                )}
                <Button
                  icon={<ArrowLeftRightIcon size="24" />}
                  variant="text"
                  onClick={onHistoryClick}
                  aria-label={t("settings.deviceHistory")}
                  disabled={!hasDeviceHistory}
                />
              </div>
            }
          />
        </div>
      </Card>
    </section>
  );
}
