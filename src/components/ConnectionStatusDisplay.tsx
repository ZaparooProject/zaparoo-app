import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2Icon,
  AlertCircleIcon,
  AlertTriangleIcon,
  WifiOffIcon,
  Loader2Icon,
  LockIcon,
  LockOpenIcon,
} from "lucide-react";
import {
  useConnectionUiState,
  type ConnectionUIState,
  connectionStateLabelKey,
} from "@/hooks/useDevicePresentation";
import { Skeleton } from "@/components/ui/skeleton";

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
  const { uiState, savedAddress, encryptionState } =
    useConnectionUiState(connectionError);
  const addressOrPlaceholder = savedAddress || t("settings.enterDeviceAddress");

  // State configuration - maps UI states to display values
  const stateConfig: Record<ConnectionUIState, ConnectionStatusConfig> = {
    connecting: {
      icon: (
        <Loader2Icon className="h-6 w-6 animate-spin motion-reduce:animate-none" />
      ),
      iconColorClass: "text-primary",
      title: t(connectionStateLabelKey("connecting")),
      subtitle: addressOrPlaceholder,
      subtitleColorClass: "text-muted-foreground",
    },
    reconnecting: {
      icon: (
        <Loader2Icon className="h-6 w-6 animate-spin motion-reduce:animate-none" />
      ),
      iconColorClass: "text-primary",
      title: t(connectionStateLabelKey("reconnecting")),
      subtitle: addressOrPlaceholder,
      subtitleColorClass: "text-muted-foreground",
    },
    connected: {
      icon: <CheckCircle2Icon className="h-6 w-6" />,
      iconColorClass: "text-success",
      title: t(connectionStateLabelKey("connected")),
      subtitle: connectedSubtitle || addressOrPlaceholder,
      subtitleColorClass: "text-muted-foreground",
    },
    unavailable: {
      icon: <AlertTriangleIcon className="h-6 w-6" />,
      iconColorClass: "text-warning",
      title: t(connectionStateLabelKey("unavailable")),
      subtitle: addressOrPlaceholder,
      subtitleColorClass: "text-muted-foreground",
    },
    networkUnavailable: {
      icon: <WifiOffIcon className="h-6 w-6" />,
      iconColorClass: "text-warning",
      title: t(connectionStateLabelKey("networkUnavailable")),
      subtitle: addressOrPlaceholder,
      subtitleColorClass: "text-muted-foreground",
    },
    error: {
      icon: <AlertCircleIcon className="h-6 w-6" />,
      iconColorClass: "text-error",
      title: t(connectionStateLabelKey("error")),
      subtitle: connectionError || t("settings.connectionFailed"),
      subtitleColorClass: "text-error",
    },
    disconnected: {
      icon: <WifiOffIcon className="h-6 w-6" />,
      iconColorClass: "text-error",
      title: t(connectionStateLabelKey("disconnected")),
      subtitle: addressOrPlaceholder,
      subtitleColorClass: "text-muted-foreground",
    },
    pairingRequired: {
      icon: <AlertTriangleIcon className="h-6 w-6" />,
      iconColorClass: "text-warning",
      title: t(connectionStateLabelKey("pairingRequired")),
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
    <div className={`flex flex-wrap items-center gap-3 ${className || ""}`}>
      {/* Icon */}
      <div
        className={`shrink-0 px-1.5 ${config.iconColorClass}`}
        aria-hidden="true"
      >
        {config.icon}
      </div>

      {/* Text content */}
      <div className="min-w-0 flex-[1_1_8rem] wrap-anywhere">
        <h2
          id={headingId}
          className="flex flex-wrap items-center gap-x-1.5 font-medium"
        >
          {config.title}
          {showLock && (
            <LockIcon
              className="text-success h-4 w-4 shrink-0"
              aria-label={t("connection.encrypted")}
            />
          )}
          {showUnlock && (
            <LockOpenIcon
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
          <Skeleton className="mt-1 h-4 w-32" />
        ) : (
          config.subtitle && (
            <p className={`text-sm break-words ${config.subtitleColorClass}`}>
              {config.subtitle}
            </p>
          )
        )}
        {uiState === "connected" && connectedName && (
          <p className={`text-sm break-words ${config.subtitleColorClass}`}>
            {connectedName}
          </p>
        )}
      </div>

      {/* Action slot */}
      {action}
    </div>
  );
}
