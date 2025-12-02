import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  AlertCircle,
  WifiOff,
  Loader2,
  ArrowLeftRightIcon,
} from "lucide-react";
import { useConnection } from "../hooks/useConnection";
import { CoreAPI, getDeviceAddress } from "../lib/coreApi";
import { Card } from "./wui/Card";
import { Button } from "./wui/Button";
import { TextInput } from "./wui/TextInput";
import { Skeleton } from "./ui/skeleton";

type UIState =
  | "connecting"
  | "reconnecting"
  | "connected"
  | "error"
  | "disconnected";

interface DeviceConnectionCardProps {
  address: string;
  setAddress: (address: string) => void;
  onAddressChange: (address: string) => void;
  connectionError: string;
  hasDeviceHistory: boolean;
  onHistoryClick: () => void;
}

export function DeviceConnectionCard({
  address,
  setAddress,
  onAddressChange,
  connectionError,
  hasDeviceHistory,
  onHistoryClick,
}: DeviceConnectionCardProps) {
  const { t } = useTranslation();
  const { isConnected, showConnecting, showReconnecting } = useConnection();

  // Get the actual saved/active address (not the input's current value)
  const savedAddress = getDeviceAddress();

  // Fetch version info when connected
  const { data: version, isLoading: isVersionLoading } = useQuery({
    queryKey: ["version", address],
    queryFn: () => CoreAPI.version(),
    enabled: isConnected && !!address,
  });

  // Show skeleton when connected but version is still loading
  const showVersionSkeleton = isConnected && isVersionLoading && !version;

  // Derive UI state from connection state (based on saved address, not input value)
  const deriveUIState = (): UIState => {
    if (!savedAddress) return "disconnected";
    if (showConnecting) return "connecting";
    if (showReconnecting) return "reconnecting";
    if (isConnected) return "connected";
    if (connectionError) return "error";
    return "disconnected";
  };

  const uiState = deriveUIState();

  // State configuration - maps logic states to UI
  const stateConfig: Record<
    UIState,
    {
      icon: ReactNode;
      iconColorClass: string;
      title: string;
      subtitle: string;
    }
  > = {
    connecting: {
      icon: <Loader2 className="h-6 w-6 animate-spin" />,
      iconColorClass: "text-primary",
      title: t("connection.connecting"),
      subtitle: savedAddress,
    },
    reconnecting: {
      icon: <Loader2 className="h-6 w-6 animate-spin" />,
      iconColorClass: "text-primary",
      title: t("connection.reconnecting"),
      subtitle: savedAddress,
    },
    connected: {
      icon: <CheckCircle2 className="h-6 w-6" />,
      iconColorClass: "text-success",
      title: t("scan.connectedHeading"),
      subtitle: version
        ? `${version.platform} (${/^\d+\.\d+\.\d+/.test(version.version) ? "v" : ""}${version.version})`
        : savedAddress,
    },
    error: {
      icon: <AlertCircle className="h-6 w-6" />,
      iconColorClass: "text-error",
      title: t("scan.connectionError"),
      subtitle: connectionError || t("settings.connectionFailed"),
    },
    disconnected: {
      icon: <WifiOff className="h-6 w-6" />,
      iconColorClass: "text-muted-foreground",
      title: t("settings.notConnected"),
      subtitle: t("settings.enterDeviceAddress"),
    },
  };

  const config = stateConfig[uiState];

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
            onKeyUp={(e) => {
              if (e.key === "Enter" && address !== getDeviceAddress()) {
                onAddressChange(address);
              }
            }}
          />

          {/* Connection status row */}
          <div className="flex items-center gap-3">
            {/* Fixed-width icon container - prevents horizontal shift */}
            <div
              className={`flex-shrink-0 px-1 ${config.iconColorClass}`}
              aria-hidden="true"
            >
              {config.icon}
            </div>

            {/* Text column - flex-1 takes remaining space */}
            <div className="min-w-0 flex-1">
              <h2 id="device-connection-heading" className="font-medium">
                {config.title}
              </h2>
              {showVersionSkeleton ? (
                <Skeleton className="mt-1 h-4 w-32" />
              ) : (
                config.subtitle && (
                  <p className="text-muted-foreground truncate text-sm">
                    {config.subtitle}
                  </p>
                )
              )}
            </div>

            {/* Right action slot - Device History button (when available) */}
            {hasDeviceHistory && (
              <Button
                icon={<ArrowLeftRightIcon size="24" />}
                variant="text"
                onClick={onHistoryClick}
                aria-label={t("settings.deviceHistory")}
              />
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}
