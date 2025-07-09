import { Capacitor } from "@capacitor/core";
import { CopyButton } from "@/components/CopyButton.tsx";

export function ErrorComponent({ error }: { error: Error }) {
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
        zIndex: 9999
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-red-900/30 p-6 shadow-lg">
        <h1 className="mb-4 text-2xl font-bold">
          Oops, something really bad happened!
        </h1>
        <p className="mb-6">
          The application has encountered an unexpected error. Please copy the
          details below and report this issue.
        </p>

        <div className="mb-4 rounded bg-black/40 p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Diagnostic Details</h2>
            {Capacitor.isNativePlatform() ? (
              <CopyButton text={errorDetails} />
            ) : (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(errorDetails);
                  alert("Copied to clipboard!");
                }}
                className="ml-1 cursor-pointer px-1 text-xs font-semibold text-white underline"
              >
                copy
              </button>
            )}
          </div>
          <pre className="mt-2 max-h-64 overflow-auto text-xs whitespace-pre-wrap text-red-200">
            {errorDetails}
          </pre>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="w-full rounded-md bg-white px-4 py-2 text-center font-medium text-red-900 hover:bg-red-100"
        >
          Reload Application
        </button>
      </div>
    </div>
  );
}
