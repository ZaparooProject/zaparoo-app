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
  const presentation = useConnectionPresentation();
  const hadPresented = useRef(false);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    if (presentation.visible) {
      hadPresented.current = true;
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
  }, [presentation.visible]);

  const hasContextualStatus =
    pathname === "/" || pathname === "/settings" || pathname === "/settings/";
  const showVisual =
    !hasContextualStatus && (presentation.visible || showRestored);
  const message = presentation.visible
    ? t(statusKey(presentation.kind))
    : showRestored
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
          className={classNames("flex-shrink-0 border-t border-white/10", {
            "bg-muted/90 text-muted-foreground":
              presentation.visible && !isUnavailable,
            "bg-amber-950/95 text-amber-100": isUnavailable,
            "text-success bg-[#111928]": showRestored && !presentation.visible,
          })}
        >
          <ResponsiveContainer maxWidth="nav">
            <div className="flex min-h-9 items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium">
              {showRestored && !presentation.visible ? (
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
              <span className="min-w-0 text-center">{message}</span>
              {isUnavailable && (
                <Link
                  to="/settings"
                  className="shrink-0 rounded px-1.5 py-1 underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
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
