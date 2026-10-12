import { useTranslation } from "react-i18next";
import { StatusPill } from "@/components/wui/StatusPill";
import {
  connectionStateLabelKey,
  useActiveDeviceSummary,
  useConnectionUiState,
  type ConnectionUIState,
} from "@/hooks/useDevicePresentation";
import { useStatusStore } from "@/lib/store";

/** Status colour per connection state; wording always accompanies it. */
const STATE_DOT_CLASS: Record<ConnectionUIState, string> = {
  connected: "bg-success",
  connecting: "bg-muted-foreground",
  reconnecting: "bg-warning",
  unavailable: "bg-error",
  networkUnavailable: "bg-error",
  error: "bg-error",
  pairingRequired: "bg-warning",
  disconnected: "bg-muted-foreground",
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

  const deviceLabel = name || address || t("scan.deviceNone");

  const accessibleName = t("scan.devicePill", {
    device: deviceLabel,
    status: t(connectionStateLabelKey(uiState)),
  });

  return (
    <StatusPill
      className={className}
      dot={
        <span
          className={`block size-2 rounded-full ${STATE_DOT_CLASS[uiState]}`}
        />
      }
      label={deviceLabel}
      // The dot is a shorthand; the name carries the state for anyone who
      // cannot see it, or whose device name is truncated away.
      aria-label={accessibleName}
      aria-haspopup="dialog"
      aria-expanded={sheetOpen}
      onClick={onOpen}
    />
  );
}
