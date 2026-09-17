import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { CopyButton } from "@/components/CopyButton.tsx";
import { logger, isRollbarEnabled } from "@/lib/logger";

export function ErrorComponent({ error }: { error: Error }) {
  const { t } = useTranslation();

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

  return (
    <div
      className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center p-4"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
      }}
    >
      <div className="bg-error-wash w-full max-w-md rounded-lg p-6 shadow-lg">
        <h1 className="mb-4 text-2xl font-bold">{t("errorBoundary.title")}</h1>
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

        <button
          onClick={() => window.location.reload()}
          className="site-button site-button-secondary w-full px-4 py-2 text-center"
        >
          {t("errorBoundary.reload")}
        </button>
      </div>
    </div>
  );
}
