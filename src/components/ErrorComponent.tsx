import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { CopyButton } from "@/components/CopyButton.tsx";
import { logger } from "@/lib/logger";
import { isRollbarEnabled } from "@/lib/rollbar";

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
      className="flex min-h-screen flex-col items-center justify-center bg-black p-4 text-white"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-red-900/30 p-6 shadow-lg">
        <h1 className="mb-4 text-2xl font-bold">{t("errorBoundary.title")}</h1>
        <p className="mb-6">{t("errorBoundary.description")}</p>

        <div className="mb-4 rounded bg-black/40 p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {t("errorBoundary.diagnosticDetails")}
            </h2>
            <CopyButton text={errorDetails} />
          </div>
          <pre className="mt-2 max-h-64 overflow-auto text-xs whitespace-pre-wrap text-red-200">
            {errorDetails}
          </pre>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="w-full rounded-md bg-white px-4 py-2 text-center font-medium text-red-900 hover:bg-red-100"
        >
          {t("errorBoundary.reload")}
        </button>
      </div>
    </div>
  );
}
