import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { memo } from "react";
import { getDeviceAddress } from "../../lib/coreApi";
import { DeviceIcon, SettingsIcon, WarningIcon } from "../../lib/images";
import { Button } from "../wui/Button";
import { Card } from "../wui/Card";
import { ConnectionState } from "../../lib/store";

interface ConnectionStatusProps {
  connected?: boolean;
  connectionState?: ConnectionState;
  onRetry?: () => void;
}

export const ConnectionStatus = memo(function ConnectionStatus({ connected, connectionState, onRetry }: ConnectionStatusProps) {
  const { t } = useTranslation();

  // Support both old boolean prop and new connectionState prop
  const isConnected = connectionState ? connectionState === ConnectionState.CONNECTED : connected;
  const isConnecting = connectionState === ConnectionState.CONNECTING || connectionState === ConnectionState.RECONNECTING;
  const isError = connectionState === ConnectionState.ERROR;

  if (isConnecting) {
    return (
      <Card className="mb-5">
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="px-1.5 text-warning">
            <DeviceIcon size="24" />
          </div>
          <div className="flex grow flex-col">
            <span className="font-semibold">{t("scan.connecting")}</span>
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

  if (isError) {
    return (
      <Card className="mb-5">
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="px-1.5 text-error">
            <WarningIcon size="24" />
          </div>
          <div className="flex grow flex-col">
            <span className="font-semibold">{t("scan.connectionError")}</span>
            <button 
              className="text-left text-sm text-primary underline"
              onClick={() => {
                onRetry?.();
              }}
            >
              {t("scan.retry")}
            </button>
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

  if (!isConnected) {
    return (
      <Card className="mb-5">
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="px-1.5 text-error">
            <WarningIcon size="24" />
          </div>
          <div className="flex grow flex-col">
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
        <div className="flex grow flex-col">
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
});