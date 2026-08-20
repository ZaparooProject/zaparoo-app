import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  WifiOff,
  Loader2,
  Lock,
  LockOpen,
} from "lucide-react";
import { useConnection } from "@/hooks/useConnection";
import { useConnectionPresentation } from "@/hooks/useConnectionPresentation";
import { useStatusStore } from "@/lib/store";
import {
  activeAddressOf,
  useDeviceRegistry,
  type DeviceRegistrySnapshot,
} from "@/lib/devices/deviceRegistry";

const selectRegistryHydrated = (snapshot: DeviceRegistrySnapshot) =>
  snapshot.hydrated;

type ConnectionUIState =
  | "connecting"
  | "reconnecting"
  | "connected"
  | "unavailable"
  | "networkUnavailable"
  | "error"
  | "disconnected"
  | "pairingRequired";

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
  /** Optional second subtitle line for connected state (e.g., user-chosen device name). */
  connectedName?: string;
  /** Optional compact label shown after the connected lock state. */
  connectedTitleSuffix?: string;
  /** Optional id for the rendered status heading */
  headingId?: string;
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
  connectedName,
  connectedTitleSuffix,
  headingId,
  action,
  className,
}: ConnectionStatusDisplayProps) {
  const { t } = useTranslation();
  const { isConnected, showConnecting, showReconnecting } = useConnection();
  const connectionPresentation = useConnectionPresentation({
    immediate: true,
  });
  const encryptionState = useStatusStore((s) => s.encryptionState);
  const pairingRequired = useStatusStore((s) => s.pairingRequired);
  const savedAddress = useDeviceRegistry(activeAddressOf);
  const registryHydrated = useDeviceRegistry(selectRegistryHydrated);

  // Derive UI state from connection context
  const deriveUIState = (): ConnectionUIState => {
    // Devices are read from storage asynchronously, so on a cold start there is
    // a moment where a user who has a saved device looks like one who has none.
    // Hold the spinner rather than flashing the "enter an address" placeholder
    // and snatching it back.
    if (!registryHydrated) return "connecting";
    if (!savedAddress) return "disconnected";
    // Pairing-required outranks reconnecting/error so the user sees the real
    // blocker instead of a generic "Reconnecting..." spinner that won't resolve
    // without their action.
    if (pairingRequired) return "pairingRequired";
    // Confirmed network and prolonged Core outages outrank optimistic transport
    // state, including the open-but-unverified handshake window.
    if (connectionPresentation.kind === "networkUnavailable") {
      return "networkUnavailable";
    }
    if (connectionPresentation.kind === "unavailable") return "unavailable";
    // The transport flips to "connected" when the WebSocket opens, before the
    // server has confirmed the encryption mode. Hold the UI in connecting/
    // reconnecting until the consumer learns the mode (encryptionState is set
    // by onPlaintextMode after the first non-error reply, or by
    // onEncryptedHandshakeOk after first decrypt). Prevents a green flash
    // before -32002 surfaces on encryption-required cores.
    if (isConnected && encryptionState === "unknown") {
      return showReconnecting ? "reconnecting" : "connecting";
    }
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
      icon: (
        <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none" />
      ),
      iconColorClass: "text-primary",
      title: t("connection.connectingToCore"),
      subtitle: addressOrPlaceholder,
      subtitleColorClass: "text-muted-foreground",
    },
    reconnecting: {
      icon: (
        <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none" />
      ),
      iconColorClass: "text-primary",
      title: t("connection.reconnectingToCore"),
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
    unavailable: {
      icon: <AlertTriangle className="h-6 w-6" />,
      iconColorClass: "text-warning",
      title: t("connection.coreUnavailable"),
      subtitle: addressOrPlaceholder,
      subtitleColorClass: "text-muted-foreground",
    },
    networkUnavailable: {
      icon: <WifiOff className="h-6 w-6" />,
      iconColorClass: "text-warning",
      title: t("connection.networkUnavailable"),
      subtitle: addressOrPlaceholder,
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
    pairingRequired: {
      icon: <AlertTriangle className="h-6 w-6" />,
      iconColorClass: "text-warning",
      title: t("connection.pairingRequired"),
      subtitle: addressOrPlaceholder,
      subtitleColorClass: "text-muted-foreground",
    },
  };

  const config = stateConfig[uiState];

  // Show skeleton when connected but subtitle is still loading
  const showSkeleton =
    uiState === "connected" && connectedSubtitleLoading && !connectedSubtitle;

  const showLock = uiState === "connected" && encryptionState === "encrypted";
  const showUnlock = uiState === "connected" && encryptionState === "plaintext";

  return (
    <div className={`flex items-center gap-3 ${className || ""}`}>
      {/* Icon */}
      <div
        className={`shrink-0 px-1.5 ${config.iconColorClass}`}
        aria-hidden="true"
      >
        {config.icon}
      </div>

      {/* Text content */}
      <div className="min-w-0 flex-1">
        <h2 id={headingId} className="flex items-center gap-1.5 font-medium">
          {config.title}
          {showLock && (
            <Lock
              className="text-success h-4 w-4 shrink-0"
              aria-label={t("connection.encrypted")}
            />
          )}
          {showUnlock && (
            <LockOpen
              className="text-muted-foreground h-4 w-4 shrink-0"
              aria-label={t("connection.unencrypted")}
            />
          )}
          {uiState === "connected" && connectedTitleSuffix && (
            <span className="text-muted-foreground text-sm font-normal">
              {connectedTitleSuffix}
            </span>
          )}
        </h2>
        {showSkeleton ? (
          <div className="bg-muted mt-1 h-4 w-32 animate-pulse rounded" />
        ) : (
          config.subtitle && (
            <p className={`truncate text-sm ${config.subtitleColorClass}`}>
              {config.subtitle}
            </p>
          )
        )}
        {uiState === "connected" && connectedName && (
          <p className={`truncate text-sm ${config.subtitleColorClass}`}>
            {connectedName}
          </p>
        )}
      </div>

      {/* Action slot */}
      {action}
    </div>
  );
}
