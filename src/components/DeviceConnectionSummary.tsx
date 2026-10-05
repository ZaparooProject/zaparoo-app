import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeftRightIcon } from "lucide-react";
import { useActiveDeviceSummary } from "@/hooks/useDevicePresentation";
import { useConnection } from "@/hooks/useConnection";
import { useStatusStore } from "@/lib/store";
import { ConnectionStatusDisplay } from "./ConnectionStatusDisplay";
import { DeviceSheet } from "./home/DeviceSheet";
import { Button } from "./wui/Button";
import { Card } from "./wui/Card";

export function DeviceConnectionSummary() {
  const { t } = useTranslation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { isConnected, openPairingModal } = useConnection();
  const { name, address, deviceDetails, clientRoleLabel } =
    useActiveDeviceSummary();
  const connectionError = useStatusStore((state) => state.connectionError);
  const coreVersionPending = useStatusStore(
    (state) => state.coreVersionPending,
  );
  const pairingRequired = useStatusStore((state) => state.pairingRequired);

  return (
    <>
      <section aria-labelledby="device-connection-heading">
        <Card className="flex flex-col gap-3">
          <ConnectionStatusDisplay
            headingId="device-connection-heading"
            connectionError={connectionError}
            connectedSubtitle={deviceDetails}
            connectedSubtitleLoading={isConnected && coreVersionPending}
            connectedName={name ?? undefined}
            connectedTitleSuffix={clientRoleLabel}
          />
          <div className="flex flex-col gap-2">
            {pairingRequired && address && (
              <Button
                label={t("pairing.openPairing")}
                variant="secondary"
                className="w-full"
                onClick={openPairingModal}
              />
            )}
            <Button
              label={t(
                address
                  ? "settings.deviceHistory"
                  : "settings.deviceSetup.connect",
              )}
              variant="secondary"
              icon={<ArrowLeftRightIcon size={20} />}
              className="w-full"
              aria-expanded={sheetOpen}
              onClick={() => setSheetOpen(true)}
            />
          </div>
        </Card>
      </section>
      <DeviceSheet isOpen={sheetOpen} close={() => setSheetOpen(false)} />
    </>
  );
}
