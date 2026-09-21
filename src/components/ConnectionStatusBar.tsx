import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, TriangleAlert, WifiOff } from "lucide-react";
import classNames from "classnames";
import {
  CONNECTION_RESTORED_MS,
  useConnectionPresentation,
  type ConnectionPresentationKind,
} from "@/hooks/useConnectionPresentation";
import { useConnection } from "@/hooks/useConnection";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { ResponsiveContainer } from "./ResponsiveContainer";

function statusKey(kind: ConnectionPresentationKind): string {
  switch (kind) {
    case "connecting":
      return "connection.connectingToCore";
    case "reconnecting":
      return "connection.reconnectingToCore";
    case "unavailable":
      return "connection.coreUnavailable";
    case "networkUnavailable":
      return "connection.networkUnavailable";
    case "hidden":
    default:
      return "";
  }
}

export function ConnectionStatusBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { isConnected } = useConnection();
  const presentation = useConnectionPresentation();
  const safeInsets = useStatusStore((state) => state.safeInsets);
  const connectionIssueStartedAt = useStatusStore(
    (state) => state.connectionIssueStartedAt,
  );
  const connectionState = useStatusStore((state) => state.connectionState);
  const connectionError = useStatusStore((state) => state.connectionError);
  const encryptionState = useStatusStore((state) => state.encryptionState);
  const pairingRequired = useStatusStore((state) => state.pairingRequired);
  const hadPresented = useRef(false);
  const [showRestored, setShowRestored] = useState(false);
  const confirmedConnected =
    isConnected &&
    connectionState === ConnectionState.CONNECTED &&
    connectionIssueStartedAt === null &&
    connectionError === "" &&
    encryptionState !== "unknown" &&
    !pairingRequired;
  const awaitingConnectionConfirmation =
    connectionState === ConnectionState.CONNECTED &&
    connectionIssueStartedAt === null &&
    connectionError === "" &&
    !pairingRequired &&
    (!isConnected || encryptionState === "unknown");

  useEffect(() => {
    if (presentation.visible) {
      hadPresented.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- External connection state invalidates an active recovery notice immediately.
      setShowRestored(false);
      return;
    }
    if (!confirmedConnected) {
      if (!awaitingConnectionConfirmation) hadPresented.current = false;
      setShowRestored(false);
      return;
    }
    if (!hadPresented.current) return;

    hadPresented.current = false;
    const revealTimer = setTimeout(() => {
      setShowRestored(true);
    }, 0);
    const hideTimer = setTimeout(() => {
      setShowRestored(false);
    }, CONNECTION_RESTORED_MS);

    return () => {
      clearTimeout(revealTimer);
      clearTimeout(hideTimer);
    };
  }, [
    awaitingConnectionConfirmation,
    confirmedConnected,
    presentation.visible,
  ]);

  // Settings shows the device card, which carries the connection state inline.
  // Home no longer does - its device pill carries identity, not the sentence -
  // so the bar has to report problems there.
  const hasContextualStatus =
    pathname === "/settings" || pathname === "/settings/";
  const showConfirmedRestored = showRestored && confirmedConnected;
  const showVisual =
    !hasContextualStatus && (presentation.visible || showConfirmedRestored);
  const message = presentation.visible
    ? t(statusKey(presentation.kind))
    : showConfirmedRestored
      ? t("connection.restored")
      : "";
  const isUnavailable =
    presentation.kind === "unavailable" ||
    presentation.kind === "networkUnavailable";

  return (
    <>
      <div
        className="sr-only"
        data-testid="connection-status-announcement"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {message}
      </div>
      {showVisual && (
        <div
          className={classNames(
            "border-border bg-surface-raised text-muted-foreground shrink-0 border-t",
            {
              "text-muted-foreground": presentation.visible && !isUnavailable,
              "border-warning/40 [&_svg]:text-warning": isUnavailable,
              "[&_svg]:text-success":
                showConfirmedRestored && !presentation.visible,
            },
          )}
        >
          <ResponsiveContainer maxWidth="nav">
            <div
              className="flex min-h-9 flex-wrap items-center justify-center gap-x-2 gap-y-1 py-1.5 text-sm font-medium"
              style={{
                paddingRight: `calc(0.75rem + ${safeInsets.right})`,
                paddingLeft: `calc(0.75rem + ${safeInsets.left})`,
              }}
            >
              {showConfirmedRestored && !presentation.visible ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : presentation.kind === "networkUnavailable" ? (
                <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : isUnavailable ? (
                <TriangleAlert
                  className="h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
              ) : (
                <Loader2
                  className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
              <span
                className="min-w-[12ch] flex-1 text-center"
                aria-hidden="true"
              >
                {message}
              </span>
              {isUnavailable && (
                <Link
                  to="/settings"
                  className="focus-visible:ring-ring shrink-0 rounded px-1.5 py-1 underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
                >
                  {t("nav.settings")}
                </Link>
              )}
            </div>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}
