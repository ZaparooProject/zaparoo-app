import { useTranslation } from "react-i18next";
import {
  useActiveDeviceSummary,
  useConnectionUiState,
  type ConnectionUIState,
} from "@/hooks/useDevicePresentation";
import { useStatusStore } from "@/lib/store";

const statusLabels: Record<ConnectionUIState, string> = {
  connected: "connection.connected",
  connecting: "connection.connectingToCore",
  reconnecting: "connection.reconnectingToCore",
  unavailable: "connection.coreUnavailable",
  networkUnavailable: "connection.networkUnavailable",
  error: "scan.connectionError",
  pairingRequired: "connection.pairingRequired",
  disconnected: "connection.disconnected",
};

/** Selected Core is context, not a disguised modal launcher. */
export function SidebarDeviceStatus() {
  const { t } = useTranslation();
  const error = useStatusStore((s) => s.connectionError);
  const { uiState } = useConnectionUiState(error);
  const { name, address } = useActiveDeviceSummary();
  return (
    <section
      className="sidebar-device-status"
      aria-label={t("navigation.currentDevice")}
    >
      <p className="font-semibold">
        {name || t(address ? "navigation.currentDevice" : "scan.deviceNone")}
      </p>
      <p className="text-muted-foreground text-sm">
        {t(statusLabels[uiState])}
      </p>
      {address && (
        <p className="text-muted-foreground text-sm break-all">{address}</p>
      )}
    </section>
  );
}
