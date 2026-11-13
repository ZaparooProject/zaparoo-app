import { useTranslation } from "react-i18next";
import { ConnectionLinkIcon } from "@/components/ConnectionLinkIcon";
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
  const { uiState, link } = useConnectionUiState(connectionError);
  const shownLink = uiState === "connected" ? link : null;
  const { name, address } = useActiveDeviceSummary();

  const deviceLabel = name || address || t("scan.deviceNone");

  const status = t(connectionStateLabelKey(uiState));
  const accessibleName = t("scan.devicePill", {
    device: deviceLabel,
    status: shownLink
      ? t("scan.devicePillLink", {
          status,
          link: t(
            shownLink === "bluetooth"
              ? "connection.linkBluetooth"
              : "connection.linkWifi",
          ),
        })
      : status,
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
      trailing={
        shownLink ? (
          <ConnectionLinkIcon
            link={shownLink}
            className="text-muted-foreground h-3.5 w-3.5"
          />
        ) : undefined
      }
      // The dot is a shorthand; the name carries the state for anyone who
      // cannot see it, or whose device name is truncated away.
      aria-label={accessibleName}
      aria-haspopup="dialog"
      aria-expanded={sheetOpen}
      onClick={onOpen}
    />
  );
}
