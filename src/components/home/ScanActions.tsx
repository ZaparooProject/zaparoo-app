import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import type { ScanError } from "@/hooks/useScanOperations";
import { CameraIcon, NfcIcon } from "@/lib/images";
import { Button } from "@/components/wui/Button";
import { Card } from "@/components/wui/Card";
import { EmptyState } from "@/components/wui/EmptyState";
import { ReaderActivityControl } from "@/components/ReaderActivityControl";
import { useAppUi } from "@/hooks/useAppUi";
import type { ScanLayout } from "@/hooks/useHomeScanLayout";
import { ScanResult } from "@/lib/models";
import type { ScanMode } from "@/lib/scanMode";

/** Get screen reader announcement for current scan state. */
function getScanStatusAnnouncement(
  scanSession: boolean,
  scanStatus: ScanResult,
  stopped: boolean,
  t: (key: string) => string,
): string {
  if (scanSession) {
    return t("scan.statusScanning");
  }
  if (scanStatus === ScanResult.Success) {
    return t("scan.statusSuccess");
  }
  if (scanStatus === ScanResult.Error) {
    return t("scan.statusError");
  }
  if (stopped) {
    return t("scan.statusStopped");
  }
  return "";
}

interface ScanActionsProps {
  layout: ScanLayout;
  /** Wider layouts group equal action tiles instead of the phone scan pad. */
  compact?: boolean;
  scanSession: boolean;
  scanStatus: ScanResult;
  /** Starts a scan, and stops one already running. */
  onTapScan: () => void;
  onCameraScan: () => void;
  /** The last NFC scan's failure, shown on the scan control. */
  scanError?: ScanError | null;
  /** Clears `scanError`. */
  onDismissScanError?: () => void;
  /** A one-shot camera scan is waiting for Core to answer. */
  cameraLaunching?: boolean;
  /** A tag was read and Core has not answered yet. */
  nfcLaunching?: boolean;
  /** Why the camera last closed on its own, shown under its button. */
  cameraNotice?: string;
  nfcEnabled: boolean;
  onOpenNfcSettings: () => void;
  writeActivity?: ReactNode;
}

export function ScanActions({
  layout,
  compact = false,
  scanSession,
  scanStatus,
  onTapScan,
  onCameraScan,
  scanError = null,
  onDismissScanError,
  cameraLaunching = false,
  nfcLaunching = false,
  cameraNotice,
  nfcEnabled,
  onOpenNfcSettings,
  writeActivity,
}: ScanActionsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const appUi = useAppUi();
  const [stopped, setStopped] = useState(false);
  const wasScanning = useRef(scanSession);

  useEffect(() => {
    // A scan the user stopped settles with no result, so it would otherwise
    // pass silently for screen reader users.
    if (wasScanning.current && !scanSession) {
      setStopped(scanStatus === ScanResult.Default);
    }
    if (!wasScanning.current && scanSession) {
      setStopped(false);
    }
    wasScanning.current = scanSession;
  }, [scanSession, scanStatus]);

  const showScanError = scanError !== null && !scanSession;
  const statusAnnouncement = showScanError
    ? scanError.message
    : getScanStatusAnnouncement(scanSession, scanStatus, stopped, t);
  const scanErrorPrefill = scanError?.prefill ?? null;
  // The error belongs to the control that was used.
  const nfcError = showScanError && scanError.source === "nfc";
  const cameraError = showScanError && scanError.source === "camera";
  const dismissScanError = onDismissScanError ?? (() => undefined);
  // The read is over and Core has not answered; a live session wins.
  const tagLaunching = nfcLaunching && !scanSession;
  const mapItAction = scanErrorPrefill
    ? {
        label: t("scan.mapIt"),
        onClick: () =>
          void navigate({
            to: "/create/mappings/new",
            search: {
              type: scanErrorPrefill.type,
              pattern: scanErrorPrefill.pattern,
            },
          }),
      }
    : undefined;

  const renderAction = (mode: ScanMode) => {
    if (mode === "camera") {
      const cameraButton = (
        <ReaderActivityControl
          key="camera"
          state={cameraLaunching ? "waiting" : cameraError ? "error" : "idle"}
          errorText={scanError?.message}
          errorAction={cameraError ? mapItAction : undefined}
          idleLabel={t("scan.scanCode")}
          activeLabel={t("scan.launching")}
          activeAriaLabel={t("scan.launching")}
          icon={<CameraIcon size={24} />}
          activeIcon={<CameraIcon size={24} />}
          onStart={onCameraScan}
          // Nothing to cancel while Core answers; Cancel dismisses an error.
          onCancel={cameraError ? dismissScanError : () => undefined}
          variant="secondary"
          intent="default"
          size={compact ? "default" : "lg"}
          layout="stacked"
          className="w-full"
          buttonClassName={
            compact
              ? "zap-scan-tile w-full max-w-none"
              : "min-h-[4.5rem] w-full"
          }
          showCancelHint={false}
          // A camera sheet over a live NFC session would fight it for the tag.
          disabled={scanSession}
          readerIconSize={24}
          announceStateChanges={false}
        />
      );
      if (!cameraNotice) return cameraButton;
      return (
        <div key="camera" className="flex flex-col gap-2">
          {cameraButton}
          <p
            role="status"
            className="text-muted-foreground text-center text-sm"
          >
            {cameraNotice}
          </p>
        </div>
      );
    }

    if (!nfcEnabled) {
      return (
        <Button
          key="nfc"
          variant="fill"
          intent="primary"
          size={compact ? "default" : "lg"}
          layout="stacked"
          className={
            compact
              ? "zap-scan-tile w-full max-w-none"
              : "min-h-[8.5rem] w-full"
          }
          icon={<NfcIcon size={compact ? 24 : 28} />}
          label={t("spinner.nfcDisabledLabel")}
          aria-label={t("spinner.openNfcSettings")}
          onClick={onOpenNfcSettings}
        />
      );
    }

    return (
      <ReaderActivityControl
        key="nfc"
        state={
          scanSession || tagLaunching ? "waiting" : nfcError ? "error" : "idle"
        }
        errorText={scanError?.message}
        errorAction={nfcError ? mapItAction : undefined}
        idleLabel={t("scan.tapTag")}
        activeLabel={
          tagLaunching ? t("scan.launching") : t("scan.tapTagScanning")
        }
        activeAriaLabel={
          tagLaunching ? t("scan.launching") : t("scan.tapTagStop")
        }
        showCancelHint={!tagLaunching}
        icon={<NfcIcon size={compact ? 24 : 28} />}
        onStart={onTapScan}
        // Nothing to cancel while Core answers.
        onCancel={
          tagLaunching
            ? () => undefined
            : nfcError
              ? (onDismissScanError ?? onTapScan)
              : onTapScan
        }
        size={compact ? "default" : "lg"}
        layout="stacked"
        className="w-full"
        buttonClassName={
          compact ? "zap-scan-tile w-full max-w-none" : "min-h-[8.5rem] w-full"
        }
        readerIconSize={compact ? 24 : 28}
        announceStateChanges={false}
      />
    );
  };

  return (
    <>
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {statusAnnouncement}
      </div>

      {layout.showEmptyState ? (
        <Card>
          <EmptyState
            title={t("scan.noReaderTitle")}
            description={t("scan.noReaderSub")}
          />
        </Card>
      ) : (
        appUi.enabled &&
        (writeActivity ? (
          writeActivity
        ) : (
          <div className={compact ? "zap-scan-actions" : "flex flex-col gap-2"}>
            {layout.leading && renderAction(layout.leading)}
            {layout.alternate && renderAction(layout.alternate)}
          </div>
        ))
      )}
    </>
  );
}
