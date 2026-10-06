import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { CopyButton } from "@/components/CopyButton.tsx";
import { Button } from "@/components/wui/Button";
import { useStatusStore } from "@/lib/store";
import { logger, isRollbarEnabled } from "@/lib/logger";

export function ErrorComponent({ error }: { error: Error }) {
  const { t } = useTranslation();
  const safeInsets = useStatusStore((state) => state.safeInsets);

  // Report to Rollbar when this component mounts (native + production only)
  useEffect(() => {
    if (error && isRollbarEnabled) {
      logger.error(error, {
        category: "general",
        severity: "critical",
        component: "ErrorComponent",
        context: "route-error-boundary",
      });
    }
  }, [error]);
  const errorDetails = `
App Version: ${import.meta.env.VITE_VERSION || "Unknown"}
Platform: ${Capacitor.getPlatform()}
Error: ${error?.toString() || "Unknown error"}
User Agent: ${navigator.userAgent}
Timestamp: ${new Date().toISOString()}
  `.trim();

  // Recovery must work outside the router and announcer providers.
  return (
    <div
      className="bg-background text-foreground fixed inset-0 z-[9999] flex flex-col items-center overflow-y-auto"
      style={{
        paddingTop: `calc(1rem + max(${safeInsets.top}px, var(--safe-area-inset-top, env(safe-area-inset-top, 0px))))`,
        paddingRight: `calc(1rem + max(${safeInsets.right}px, var(--safe-area-inset-right, env(safe-area-inset-right, 0px))))`,
        paddingBottom: `calc(1rem + max(${safeInsets.bottom}px, var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))))`,
        paddingLeft: `calc(1rem + max(${safeInsets.left}px, var(--safe-area-inset-left, env(safe-area-inset-left, 0px))))`,
      }}
    >
      <div className="bg-error-wash my-auto w-full max-w-md shrink-0 rounded-lg p-6 shadow-lg">
        <h1 className="mb-4 text-xl font-semibold">
          {t("errorBoundary.title")}
        </h1>
        <p className="mb-6">{t("errorBoundary.description")}</p>

        <div className="bg-surface-inset mb-4 rounded p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {t("errorBoundary.diagnosticDetails")}
            </h2>
            <CopyButton text={errorDetails} />
          </div>
          <pre className="text-error mt-2 max-h-64 overflow-auto text-xs whitespace-pre-wrap">
            {errorDetails}
          </pre>
        </div>

        <Button
          onClick={() => window.location.reload()}
          variant="secondary"
          className="w-full"
          label={t("errorBoundary.reload")}
        />
      </div>
    </div>
  );
}
