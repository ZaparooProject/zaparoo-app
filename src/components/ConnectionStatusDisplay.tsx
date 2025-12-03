import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, AlertCircle, WifiOff, Loader2 } from "lucide-react";
import { useConnection } from "@/hooks/useConnection";
import { getDeviceAddress } from "@/lib/coreApi";

type ConnectionUIState =
  | "connecting"
  | "reconnecting"
  | "connected"
  | "error"
  | "disconnected";

interface ConnectionStatusConfig {
  icon: ReactNode;
  iconColorClass: string;
  title: string;
  subtitle: string;
  subtitleColorClass: string;
}

export interface ConnectionStatusDisplayProps {
  /** Optional error message to display in error state */
  connectionError?: string;
  /** Custom subtitle for connected state (e.g., version info). Falls back to address. */
  connectedSubtitle?: string;
  /** Whether connected subtitle is still loading (shows skeleton) */
  connectedSubtitleLoading?: boolean;
  /** Optional action slot (e.g., settings button, history button) */
  action?: ReactNode;
  /** Optional className for the outer container */
  className?: string;
}

/**
 * Shared connection status display component.
 * Shows connection state with consistent icons, colors, and text.
 */
export function ConnectionStatusDisplay({
  connectionError,
  connectedSubtitle,
  connectedSubtitleLoading,
  action,
  className,
}: ConnectionStatusDisplayProps) {
  const { t } = useTranslation();
  const { isConnected, showConnecting, showReconnecting } = useConnection();
  const savedAddress = getDeviceAddress();

  // Derive UI state from connection context
  const deriveUIState = (): ConnectionUIState => {
    if (!savedAddress) return "disconnected";
    if (isConnected) return "connected";
    // Show reconnecting state (previously connected, now retrying)
    if (showReconnecting) return "reconnecting";
    // Show error if we have one during initial connection attempts
    if (connectionError) return "error";
    if (showConnecting) return "connecting";
    return "disconnected";
  };

  const uiState = deriveUIState();
  const addressOrPlaceholder = savedAddress || t("settings.enterDeviceAddress");

  // State configuration - maps UI states to display values
  const stateConfig: Record<ConnectionUIState, ConnectionStatusConfig> = {
    connecting: {
      icon: <Loader2 className="h-6 w-6 animate-spin" />,
      iconColorClass: "text-primary",
      title: t("connection.connecting"),
      subtitle: addressOrPlaceholder,
      subtitleColorClass: "text-muted-foreground",
    },
    reconnecting: {
      icon: <Loader2 className="h-6 w-6 animate-spin" />,
      iconColorClass: "text-primary",
      title: t("connection.reconnecting"),
      subtitle: addressOrPlaceholder,
      subtitleColorClass: "text-muted-foreground",
    },
    connected: {
      icon: <CheckCircle2 className="h-6 w-6" />,
      iconColorClass: "text-success",
      title: t("scan.connectedHeading"),
      subtitle: connectedSubtitle || addressOrPlaceholder,
      subtitleColorClass: "text-muted-foreground",
    },
    error: {
      icon: <AlertCircle className="h-6 w-6" />,
      iconColorClass: "text-error",
      title: t("scan.connectionError"),
      subtitle: connectionError || t("settings.connectionFailed"),
      subtitleColorClass: "text-error",
    },
    disconnected: {
      icon: <WifiOff className="h-6 w-6" />,
      iconColorClass: "text-error",
      title: t("settings.notConnected"),
      subtitle: addressOrPlaceholder,
      subtitleColorClass: "text-muted-foreground",
    },
  };

  const config = stateConfig[uiState];

  // Show skeleton when connected but subtitle is still loading
  const showSkeleton =
    uiState === "connected" && connectedSubtitleLoading && !connectedSubtitle;

  return (
    <div className={`flex items-center gap-3 ${className || ""}`}>
      {/* Icon */}
      <div
        className={`flex-shrink-0 px-1.5 ${config.iconColorClass}`}
        aria-hidden="true"
      >
        {config.icon}
      </div>

      {/* Text content */}
      <div className="min-w-0 flex-1">
        <h2 className="font-medium">{config.title}</h2>
        {showSkeleton ? (
          <div className="bg-muted mt-1 h-4 w-32 animate-pulse rounded" />
        ) : (
          config.subtitle && (
            <p className={`truncate text-sm ${config.subtitleColorClass}`}>
              {config.subtitle}
            </p>
          )
        )}
      </div>

      {/* Action slot */}
      {action}
    </div>
  );
}
