import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ArrowLeftRightIcon, KeyRoundIcon, SearchIcon } from "lucide-react";
import { useAppUi } from "@/hooks/useAppUi";
import { useActiveDeviceSummary } from "@/hooks/useDevicePresentation";
import { useConnection } from "@/hooks/useConnection";
import {
  activeAddressOf,
  useDeviceRegistry,
} from "@/lib/devices/deviceRegistry";
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
  addressError?: string;
  onScanClick?: () => void;
}

export function DeviceConnectionCard({
  address,
  setAddress,
  onAddressChange,
  connectionError,
  addressError,
  onScanClick,
}: DeviceConnectionCardProps) {
  const { t } = useTranslation();
  const { isConnected, openPairingModal } = useConnection();
  const appUi = useAppUi();

  const savedAddress = useDeviceRegistry(activeAddressOf);
  const coreVersionPending = useStatusStore(
    (state) => state.coreVersionPending,
  );
  const {
    name: activeName,
    deviceDetails,
    clientRoleLabel,
  } = useActiveDeviceSummary();
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
            error={addressError}
            onKeyUp={(e) => {
              if (e.key === "Enter" && address !== savedAddress) {
                onAddressChange(address);
              }
            }}
          />

          {/* Connection status row */}
          <ConnectionStatusDisplay
            headingId="device-connection-heading"
            connectionError={connectionError}
            connectedSubtitle={deviceDetails}
            connectedSubtitleLoading={isConnected && coreVersionPending}
            connectedName={activeName ?? undefined}
            connectedTitleSuffix={clientRoleLabel}
            action={
              <div className="flex items-center gap-1">
                <Button
                  icon={<KeyRoundIcon size="24" />}
                  variant="text"
                  onClick={openPairingModal}
                  aria-label={t("pairing.openPairing")}
                />
                {/* Network scan button - only on native platforms */}
                {appUi.enabled && onScanClick && (
                  <Button
                    icon={<SearchIcon size="24" />}
                    variant="text"
                    onClick={onScanClick}
                    aria-label={t("settings.networkScan.title")}
                  />
                )}
                <Link
                  to="/settings/devices"
                  aria-label={t("settings.deviceHistory")}
                  className="focus-visible:ring-background text-foreground focus-visible:ring-ring flex h-10 w-10 min-w-10 items-center justify-center rounded-full px-1.5 transition-all duration-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95"
                >
                  <ArrowLeftRightIcon size="24" />
                </Link>
              </div>
            }
          />
        </div>
      </Card>
    </section>
  );
}
