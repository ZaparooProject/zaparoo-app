import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { Link } from "@tanstack/react-router";
import { ArrowLeftRightIcon, KeyRoundIcon, SearchIcon } from "lucide-react";
import { useConnection } from "@/hooks/useConnection";
import { getDeviceAddress } from "@/lib/coreApi";
import { normalizeDeviceKey } from "@/lib/crypto/credentials";
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
  onScanClick?: () => void;
}

export function DeviceConnectionCard({
  address,
  setAddress,
  onAddressChange,
  connectionError,
  onScanClick,
}: DeviceConnectionCardProps) {
  const { t } = useTranslation();
  const { isConnected, openPairingModal } = useConnection();

  const savedAddress = getDeviceAddress();
  const coreVersion = useStatusStore((state) => state.coreVersion);
  const corePlatform = useStatusStore((state) => state.corePlatform);
  const coreVersionPending = useStatusStore(
    (state) => state.coreVersionPending,
  );
  const pairingRequired = useStatusStore((state) => state.pairingRequired);
  const deviceHistory = useStatusStore((state) => state.deviceHistory);

  const savedKey = savedAddress ? normalizeDeviceKey(savedAddress) : "";
  const currentEntry = savedKey
    ? deviceHistory.find((e) => normalizeDeviceKey(e.address) === savedKey)
    : undefined;

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
            connectedName={currentEntry?.name}
            action={
              <div className="flex items-center gap-1">
                {pairingRequired && (
                  <Button
                    icon={<KeyRoundIcon size="24" />}
                    variant="text"
                    onClick={openPairingModal}
                    aria-label={t("pairing.openPairing")}
                  />
                )}
                {/* Network scan button - only on native platforms */}
                {Capacitor.isNativePlatform() && onScanClick && (
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
                  className="focus-visible:ring-background flex h-10 w-10 min-w-10 items-center justify-center rounded-full px-1.5 text-white transition-all duration-100 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95"
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
