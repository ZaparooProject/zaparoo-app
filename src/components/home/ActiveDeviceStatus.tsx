import { useTranslation } from "react-i18next";
import { KeyRoundIcon } from "lucide-react";
import { ConnectionStatusDisplay } from "@/components/ConnectionStatusDisplay";
import { Button } from "@/components/wui/Button";
import { useConnection } from "@/hooks/useConnection";
import { useActiveDeviceSummary } from "@/hooks/useDevicePresentation";
import { useStatusStore } from "@/lib/store";

interface ActiveDeviceStatusProps {
  headingId?: string;
  /** Runs after the pairing dialog has been requested. */
  onPair?: () => void;
}

/**
 * The selected device's connection status with its Pair action. Shared by the
 * Settings summary, the device sheet and the Devices page so the three cannot
 * drift apart.
 */
export function ActiveDeviceStatus({
  headingId,
  onPair,
}: ActiveDeviceStatusProps) {
  const { t } = useTranslation();
  const { isConnected, openPairingModal } = useConnection();
  const { name, address, deviceDetails, clientRoleLabel } =
    useActiveDeviceSummary();
  const connectionError = useStatusStore((state) => state.connectionError);
  const coreVersionPending = useStatusStore(
    (state) => state.coreVersionPending,
  );
  const pairingRequired = useStatusStore((state) => state.pairingRequired);

  return (
    <ConnectionStatusDisplay
      headingId={headingId}
      connectionError={connectionError}
      connectedSubtitle={deviceDetails}
      connectedSubtitleLoading={isConnected && coreVersionPending}
      connectedName={name ?? undefined}
      connectedTitleSuffix={clientRoleLabel}
      action={
        isConnected || (pairingRequired && address) ? (
          <Button
            icon={<KeyRoundIcon size={20} />}
            variant="ghost"
            shape="square"
            size="sm"
            aria-label={t("pairing.openPairing")}
            onClick={() => {
              openPairingModal();
              onPair?.();
            }}
          />
        ) : undefined
      }
    />
  );
}
