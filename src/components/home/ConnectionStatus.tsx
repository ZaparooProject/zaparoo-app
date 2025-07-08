import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { getDeviceAddress } from "../../lib/coreApi";
import { DeviceIcon, SettingsIcon, WarningIcon } from "../../lib/images";
import { Button } from "../wui/Button";
import { Card } from "../wui/Card";

interface ConnectionStatusProps {
  connected: boolean;
}

export function ConnectionStatus({ connected }: ConnectionStatusProps) {
  const { t } = useTranslation();

  if (!connected) {
    return (
      <Card className="mb-5">
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="px-1.5 text-error">
            <WarningIcon size="24" />
          </div>
          <div className="flex flex-grow flex-col">
            <span className="font-semibold">{t("scan.noDevices")}</span>
          </div>
          <Link
            to="/settings"
            search={{
              focus: "address"
            }}
          >
            <Button icon={<SettingsIcon size="24" />} variant="text" />
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <div className="flex flex-row items-center justify-between gap-3">
        <div className="px-1.5 text-success">
          <DeviceIcon size="24" />
        </div>
        <div className="flex flex-grow flex-col">
          <span className="font-bold">{t("scan.connectedHeading")}</span>
          <span>
            {t("scan.connectedSub", {
              ip: getDeviceAddress()
            })}
          </span>
        </div>
        <Link
          to="/settings"
          search={{
            focus: "address"
          }}
        >
          <Button icon={<SettingsIcon size="24" />} variant="text" />
        </Link>
      </div>
    </Card>
  );
}