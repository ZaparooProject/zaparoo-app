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
import { Loader2 } from "lucide-react";
import { useConnection } from "../hooks/useConnection";

export function ReconnectingIndicator() {
  const { t } = useTranslation();
  const { showConnecting, showReconnecting } = useConnection();

  // Show "Connecting..." for initial connection to new device
  if (showConnecting) {
    return (
      <div
        className="bg-muted/90 text-muted-foreground fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t("connection.connecting", "Connecting...")}
      </div>
    );
  }

  // Show "Reconnecting..." for devices that had prior successful connection
  if (showReconnecting) {
    return (
      <div
        className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-amber-600/80 px-4 py-2 text-sm font-medium text-amber-50 shadow-lg"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t("connection.reconnecting", "Reconnecting...")}
      </div>
    );
  }

  return null;
}
