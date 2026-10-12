import { useTranslation } from "react-i18next";
import { MonitorIcon } from "lucide-react";
import { useActiveDeviceSummary } from "@/hooks/useDevicePresentation";
import { useDeviceSheetController } from "@/hooks/useDeviceSheetController";
import { ActiveDeviceStatus } from "./home/ActiveDeviceStatus";
import { DeviceSheet } from "./home/DeviceSheet";
import { Button } from "./wui/Button";
import { Card } from "./wui/Card";

export function DeviceConnectionSummary() {
  const { t } = useTranslation();
  const {
    isOpen: sheetOpen,
    setOpen: setSheetOpen,
    shared,
  } = useDeviceSheetController();
  const { address } = useActiveDeviceSummary();

  return (
    <>
      <section aria-labelledby="device-connection-heading">
        <Card className="flex flex-col gap-3">
          <ActiveDeviceStatus headingId="device-connection-heading" />
          <Button
            label={t(
              address
                ? "settings.deviceHistory"
                : "settings.deviceSetup.connect",
            )}
            variant="secondary"
            icon={<MonitorIcon size={20} />}
            className="w-full"
            aria-expanded={sheetOpen}
            onClick={() => setSheetOpen(true)}
          />
        </Card>
      </section>
      {!shared && (
        <DeviceSheet isOpen={sheetOpen} close={() => setSheetOpen(false)} />
      )}
    </>
  );
}
