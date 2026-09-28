import { useTranslation } from "react-i18next";
import { useRouter } from "@tanstack/react-router";
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
  const router = useRouter();
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
                  icon={<KeyRoundIcon size="20" />}
                  variant="ghost"
                  onClick={openPairingModal}
                  aria-label={t("pairing.openPairing")}
                />
                {/* Network scan button - only on native platforms */}
                {appUi.enabled && onScanClick && (
                  <Button
                    icon={<SearchIcon size="20" />}
                    variant="ghost"
                    onClick={onScanClick}
                    aria-label={t("settings.networkScan.title")}
                  />
                )}
                <Button
                  icon={<ArrowLeftRightIcon size="20" />}
                  variant="ghost"
                  onClick={() =>
                    void router.navigate({ to: "/settings/devices" })
                  }
                  aria-label={t("settings.deviceHistory")}
                />
              </div>
            }
          />
        </div>
      </Card>
    </section>
  );
}
