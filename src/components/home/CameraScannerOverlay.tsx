import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { FlashlightIcon } from "lucide-react";
import { Button } from "@/components/wui/Button";
import { Card } from "@/components/wui/Card";
import { LibraryArtworkFrame } from "@/components/library/LibraryArtworkFrame";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useBackButtonHandler } from "@/hooks/useBackButtonHandler";
import type {
  CameraResultPhase,
  CameraScanResult,
  ContinuousCamera,
} from "@/hooks/useContinuousCamera";
import { useNowPlayingArtwork } from "@/hooks/useNowPlayingArtwork";
import { useSystemName } from "@/hooks/useSystemName";
import type { LaunchMedia } from "@/lib/launchFeedback";
import { useStatusStore } from "@/lib/store";

const OUTLINE_COLORS: Record<CameraResultPhase, string> = {
  launching: "var(--interaction)",
  scanned: "var(--interaction)",
  launched: "var(--status-green)",
  failed: "var(--status-red)",
};

function LaunchedMediaRow({ media }: { media: LaunchMedia }) {
  const { t } = useTranslation();
  const deviceKey = useActiveDeviceKey();
  const systemName = useSystemName(media.systemId, media.systemName);
  const artwork = useNowPlayingArtwork({
    mediaName: media.name,
    mediaPath: media.path,
    systemId: media.systemId,
    systemName: media.systemName,
  });

  return (
    <div className="flex min-w-0 items-center gap-3">
      <LibraryArtworkFrame
        entry={artwork}
        systemId={media.systemId}
        deviceKey={deviceKey}
        maxSize={96}
        priority="thumbnail"
        compact
        className="size-10 shrink-0"
      />
      <div className="min-w-0">
        <p className="truncate font-semibold">{media.name}</p>
        <p className="text-muted-foreground truncate text-sm">
          <span className="text-success">{t("scan.cameraLaunched")}</span>
          {systemName ? ` · ${systemName}` : ""}
        </p>
      </div>
    </div>
  );
}

function resultLines(
  result: CameraScanResult | null,
  t: (key: string) => string,
): { title: string; detail: string } {
  if (!result) {
    return { title: t("scan.cameraIdle"), detail: t("scan.cameraIdleHint") };
  }
  switch (result.phase) {
    case "launching":
      return { title: t("scan.launching"), detail: result.code };
    case "launched":
      return {
        title: result.media?.name ?? result.code,
        detail: t("scan.cameraLaunched"),
      };
    case "scanned":
      return { title: result.code, detail: t("scan.cameraScanned") };
    case "failed":
      return result.mapping
        ? { title: t("scan.notSetUp"), detail: t("scan.cameraNotMapped") }
        : {
            title: t("scan.cameraFailed"),
            detail: result.error?.message ?? result.code,
          };
  }
}

interface CameraScannerOverlayProps {
  camera: ContinuousCamera;
}

/**
 * Chrome over the live camera preview while the continuous camera runs. The
 * preview itself is native and sits behind the WebView.
 */
export function CameraScannerOverlay({ camera }: CameraScannerOverlayProps) {
  if (!camera.active) return null;
  return createPortal(<ScannerChrome camera={camera} />, document.body);
}

function ScannerChrome({ camera }: CameraScannerOverlayProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const safeInsets = useStatusStore((state) => state.safeInsets);
  const { result, outline, stop } = camera;

  useEffect(() => {
    const returnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    headingRef.current?.focus();
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  useBackButtonHandler(
    "camera-scanner",
    () => {
      stop();
      return true;
    },
    110,
  );

  const lines = resultLines(result, t);
  const mapping = result?.phase === "failed" ? result.mapping : null;
  const outlineColor = OUTLINE_COLORS[result?.phase ?? "launching"];

  const handleMapIt = () => {
    if (!mapping) return;
    stop();
    void navigate({
      to: "/create/mappings/new",
      search: { type: mapping.type, pattern: mapping.pattern },
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className="fixed inset-0 z-50 flex flex-col"
    >
      {outline && (
        <svg
          aria-hidden="true"
          data-testid="camera-code-outline"
          data-phase={result?.phase ?? "launching"}
          className="pointer-events-none absolute inset-0 size-full"
        >
          <polygon
            points={outline.map(([x, y]) => `${x},${y}`).join(" ")}
            fill="none"
            stroke={outlineColor}
            strokeWidth={4}
            strokeLinejoin="round"
          />
        </svg>
      )}

      <div
        className="relative flex items-center justify-between gap-3"
        style={{
          paddingTop: `calc(${safeInsets.top} + 1rem)`,
          paddingLeft: `calc(${safeInsets.left} + 1rem)`,
          paddingRight: `calc(${safeInsets.right} + 1rem)`,
        }}
      >
        {/* The camera feed is never themed, so the heading keeps light ink
            with a legibility shadow in both appearances. */}
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold text-white outline-none [text-shadow:0_1px_3px_rgb(0_0_0/70%)]"
        >
          {t("scan.cameraHeading")}
        </h2>
        {camera.torchAvailable && (
          <Button
            variant="secondary"
            icon={<FlashlightIcon size={20} />}
            aria-label={t("scan.cameraTorch")}
            aria-pressed={camera.torchOn}
            onClick={camera.toggleTorch}
          />
        )}
      </div>

      <div className="flex-1" />

      <div
        className="bg-background border-border relative flex flex-col gap-3 border-t pt-4"
        style={{
          paddingBottom: `calc(${safeInsets.bottom} + 1rem)`,
          paddingLeft: `calc(${safeInsets.left} + 1rem)`,
          paddingRight: `calc(${safeInsets.right} + 1rem)`,
        }}
      >
        <Card>
          {result?.phase === "launched" && result.media ? (
            <LaunchedMediaRow media={result.media} />
          ) : (
            <div className="min-w-0">
              <p
                className={
                  result?.phase === "failed"
                    ? "text-error truncate font-semibold"
                    : "truncate font-semibold"
                }
              >
                {lines.title}
              </p>
              <p
                className={
                  result?.phase === "launched"
                    ? "text-success truncate text-sm"
                    : "text-muted-foreground truncate text-sm"
                }
              >
                {lines.detail}
              </p>
            </div>
          )}
        </Card>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            label={t("scan.cameraDone")}
            className="flex-1"
            onClick={stop}
          />
          {mapping && (
            <Button
              intent="primary"
              label={t("scan.mapIt")}
              className="flex-1"
              onClick={handleMapIt}
            />
          )}
        </div>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {result ? `${lines.title}. ${lines.detail}` : ""}
      </div>
    </div>
  );
}
