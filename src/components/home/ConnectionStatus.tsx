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
  const isConnecting = connectionState === ConnectionState.CONNECTING;
  const isReconnecting = connectionState === ConnectionState.RECONNECTING;
  const isError = connectionState === ConnectionState.ERROR;

  // Determine icon, color, and content based on state
  const showWarningIcon = isError || (!isConnected && !isConnecting && !isReconnecting);
  const iconColor = isConnected
    ? "text-success"
    : isReconnecting
      ? "text-muted-foreground"
      : isConnecting
        ? "text-warning"
        : "text-error";

  const titleText = isConnected
    ? t("scan.connectedHeading")
    : isReconnecting
      ? t("scan.reconnecting")
      : isConnecting
        ? t("scan.connecting")
        : isError
          ? t("scan.connectionError")
          : t("scan.noDevices");

  const titleClass = isConnected
    ? "font-bold"
    : isReconnecting
      ? "text-muted-foreground"
      : "font-semibold";

  return (
    <Card className="mb-4">
      <div className="flex flex-row items-center justify-between gap-3">
        <div className={`px-1.5 ${iconColor}`}>
          {showWarningIcon ? <WarningIcon size="24" /> : <DeviceIcon size="24" />}
        </div>
        <div className="flex grow flex-col">
          <span className={titleClass}>{titleText}</span>
          {isError ? (
            <button
              className="text-left text-sm text-primary underline"
              onClick={() => {
                onRetry?.();
              }}
            >
              {t("scan.retry")}
            </button>
          ) : (
            <span className={isReconnecting ? "text-muted-foreground" : undefined}>
              {t("scan.connectedSub", {
                ip: getDeviceAddress()
              })}
            </span>
          )}
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
