/**
 * ReconnectingIndicator - Shows connection state indicators.
 *
 * Displays different indicators based on connection state:
 * - "Connecting..." for initial connection attempts to a new device
 * - "Reconnecting..." for reconnection attempts after prior success
 *
 * This replaces blocking loading states with non-intrusive indicators
 * that let users continue using cached data.
 */

import { useTranslation } from "react-i18next";
import { useConnection } from "../hooks/useConnection";

export function ReconnectingIndicator() {
  const { t } = useTranslation();
  const { showConnecting, showReconnecting } = useConnection();

  // Show "Connecting..." for initial connection to new device
  if (showConnecting) {
    return (
      <div
        className="bg-muted/90 text-muted-foreground fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium shadow-lg"
        role="status"
        aria-live="polite"
      >
        {t("connection.connecting", "Connecting...")}
      </div>
    );
  }

  // Show "Reconnecting..." for devices that had prior successful connection
  if (showReconnecting) {
    return (
      <div
        className="bg-warning/90 text-warning-content fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium shadow-lg"
        role="status"
        aria-live="polite"
      >
        {t("connection.reconnecting", "Reconnecting...")}
      </div>
    );
  }

  return null;
}
