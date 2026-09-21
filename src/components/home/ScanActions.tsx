import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, NfcIcon } from "lucide-react";
import { Button } from "@/components/wui/Button";
import { Card } from "@/components/wui/Card";
import { EmptyState } from "@/components/wui/EmptyState";
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
  scanSession: boolean;
  scanStatus: ScanResult;
  /** Starts a scan, and stops one already running. */
  onTapScan: () => void;
  onCameraScan: () => void;
  nfcEnabled: boolean;
  onOpenNfcSettings: () => void;
}

export function ScanActions({
  layout,
  scanSession,
  scanStatus,
  onTapScan,
  onCameraScan,
  nfcEnabled,
  onOpenNfcSettings,
}: ScanActionsProps) {
  const { t } = useTranslation();
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

  const statusAnnouncement = getScanStatusAnnouncement(
    scanSession,
    scanStatus,
    stopped,
    t,
  );

  const renderAction = (mode: ScanMode) => {
    if (mode === "camera") {
      return (
        <Button
          key="camera"
          variant="secondary"
          size="lg"
          layout="stacked"
          className="min-h-[4.5rem] w-full"
          icon={<Camera size={24} />}
          label={t("scan.scanCode")}
          aria-label={t("scan.scanCode")}
          // A camera sheet over a live NFC session would fight it for the tag.
          disabled={scanSession}
          onClick={onCameraScan}
        />
      );
    }

    if (!nfcEnabled) {
      return (
        <Button
          key="nfc"
          variant="fill"
          intent="primary"
          size="lg"
          layout="stacked"
          className="min-h-[8.5rem] w-full"
          icon={<NfcIcon size={28} />}
          label={t("spinner.nfcDisabledLabel")}
          aria-label={t("spinner.openNfcSettings")}
          onClick={onOpenNfcSettings}
        />
      );
    }

    return (
      <Button
        key="nfc"
        variant="fill"
        intent="primary"
        size="lg"
        layout="stacked"
        className="min-h-[8.5rem] w-full"
        icon={<NfcIcon size={28} />}
        label={scanSession ? t("scan.tapTagScanning") : t("scan.tapTag")}
        aria-label={scanSession ? t("scan.tapTagStop") : t("scan.tapTag")}
        aria-pressed={scanSession}
        onClick={onTapScan}
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
        appUi.enabled && (
          <div className="flex flex-col gap-2">
            {layout.leading && renderAction(layout.leading)}
            {layout.alternate && renderAction(layout.alternate)}
          </div>
        )
      )}
    </>
  );
}
