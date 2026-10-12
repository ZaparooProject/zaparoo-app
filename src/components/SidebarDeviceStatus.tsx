import { useTranslation } from "react-i18next";
import {
  useActiveDeviceSummary,
  connectionStateLabelKey,
  useConnectionUiState,
} from "@/hooks/useDevicePresentation";
import { useStatusStore } from "@/lib/store";

/** Selected Core is context, not a disguised modal launcher. */
export function SidebarDeviceStatus() {
  const { t } = useTranslation();
  const error = useStatusStore((s) => s.connectionError);
  const { uiState } = useConnectionUiState(error);
  const { name, address } = useActiveDeviceSummary();
  return (
    <section
      className="sidebar-device-status"
      aria-label={t("nav.currentDevice")}
    >
      <p className="font-semibold">
        {name || t(address ? "nav.currentDevice" : "scan.deviceNone")}
      </p>
      <p className="text-muted-foreground text-sm">
        {t(connectionStateLabelKey(uiState))}
      </p>
      {address && (
        <p className="text-muted-foreground text-sm break-all">{address}</p>
      )}
    </section>
  );
}
