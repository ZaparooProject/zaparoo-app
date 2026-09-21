import { useTranslation } from "react-i18next";
import { StatusPill } from "@/components/wui/StatusPill";
import {
  useActiveDeviceSummary,
  useConnectionUiState,
  type ConnectionUIState,
} from "@/hooks/useDevicePresentation";
import { useStatusStore } from "@/lib/store";

/** Status colour and wording per connection state; never colour alone. */
const STATE_PRESENTATION: Record<
  ConnectionUIState,
  { dotClass: string; statusKey: string }
> = {
  connected: { dotClass: "bg-success", statusKey: "connection.connected" },
  connecting: {
    dotClass: "bg-muted-foreground",
    statusKey: "connection.connectingToCore",
  },
  reconnecting: {
    dotClass: "bg-warning",
    statusKey: "connection.reconnectingToCore",
  },
  unavailable: {
    dotClass: "bg-error",
    statusKey: "connection.coreUnavailable",
  },
  networkUnavailable: {
    dotClass: "bg-error",
    statusKey: "connection.networkUnavailable",
  },
  error: { dotClass: "bg-error", statusKey: "scan.connectionError" },
  pairingRequired: {
    dotClass: "bg-warning",
    statusKey: "connection.pairingRequired",
  },
  disconnected: {
    dotClass: "bg-muted-foreground",
    statusKey: "connection.disconnected",
  },
};

interface HomeDevicePillProps {
  onOpen: () => void;
  sheetOpen: boolean;
  className?: string;
}

export function HomeDevicePill({
  onOpen,
  sheetOpen,
  className,
}: HomeDevicePillProps) {
  const { t } = useTranslation();
  const connectionError = useStatusStore((state) => state.connectionError);
  const { uiState } = useConnectionUiState(connectionError);
  const { name, address } = useActiveDeviceSummary();

  const presentation = STATE_PRESENTATION[uiState];
  const deviceLabel = name || address || t("scan.deviceNone");

  return (
    <StatusPill
      className={className}
      dot={
        <span
          className={`block size-2 rounded-full ${presentation.dotClass}`}
        />
      }
      label={deviceLabel}
      // The dot is a shorthand; the name carries the state for anyone who
      // cannot see it, or whose device name is truncated away.
      aria-label={t("scan.devicePill", {
        device: deviceLabel,
        status: t(presentation.statusKey),
      })}
      aria-haspopup="dialog"
      aria-expanded={sheetOpen}
      onClick={onOpen}
    />
  );
}
