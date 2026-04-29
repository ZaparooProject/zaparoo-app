import { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { logger } from "@/lib/logger";
import { useNfcWriter, WriteMethod } from "@/lib/writeNfcHook.tsx";
import { useProPurchase } from "@/components/ProPurchase.tsx";
import { WriteModal } from "@/components/WriteModal.tsx";
import { useAnnouncer } from "@/components/A11yAnnouncer";
import logoImage from "@/assets/lockup.webp";
import { cancelSession } from "@/lib/nfc";
import { CoreAPI } from "@/lib/coreApi.ts";
import { HistoryIcon } from "@/lib/images";
import { useStatusStore } from "@/lib/store";
import { ToggleChip } from "@/components/wui/ToggleChip";
import { PageFrame } from "@/components/PageFrame";
import { ConnectionStatus } from "@/components/home/ConnectionStatus";
import { ScanControls } from "@/components/home/ScanControls";
import { LastScannedInfo } from "@/components/home/LastScannedInfo";
import { NowPlayingInfo } from "@/components/home/NowPlayingInfo";
import { HistoryModal } from "@/components/home/HistoryModal";
import { StopConfirmModal } from "@/components/home/StopConfirmModal";
import { useScanOperations } from "@/hooks/useScanOperations";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { useConnection } from "@/hooks/useConnection";
import { useKeepAwake } from "@/hooks/useKeepAwake";

export function Index() {
  const { t } = useTranslation();
  usePageHeadingFocus(t("nav.index"));
  const { announce } = useAnnouncer();
  const launcherAccess = usePreferencesStore((state) => state.launcherAccess);
  const nfcAvailable = usePreferencesStore((state) => state.nfcAvailable);
  const cameraAvailable = usePreferencesStore((state) => state.cameraAvailable);
  const preferRemoteWriter = usePreferencesStore(
    (state) => state.preferRemoteWriter,
  );

  const nfcWriter = useNfcWriter(WriteMethod.Auto, preferRemoteWriter);
  const writeOpen = useStatusStore((state) => state.writeOpen);
  const setWriteOpen = useStatusStore((state) => state.setWriteOpen);
  const setWriteQueue = useStatusStore((state) => state.setWriteQueue);
  const closeWriteModal = async () => {
    try {
      await nfcWriter.end();
    } catch (err) {
      logger.error("Failed to end NFC writer session", err, {
        category: "nfc",
        action: "closeWriteModal",
        severity: "error",
      });
    } finally {
      setWriteOpen(false);
      setWriteQueue("");
    }
  };
  useEffect(() => {
    // Auto-close modal on any completion (success, cancelled, or error)
    if (nfcWriter.status !== null) {
      setWriteOpen(false);
    }
  }, [nfcWriter.status, setWriteOpen]);
  const { PurchaseModal, proPurchaseModalOpen, setProPurchaseModalOpen } =
    useProPurchase();

  const connected = useStatusStore((state) => state.connected);
  const playing = useStatusStore((state) => state.playing);
  const lastToken = useStatusStore((state) => state.lastToken);
  const setLastToken = useStatusStore((state) => state.setLastToken);
  const { hasData } = useConnection();

  const [historyOpen, setHistoryOpen] = useState(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  // Holds the deferred history-modal toggle that fires after the pro-purchase
  // modal closes. Tracked so we can cancel a pending toggle on unmount or
  // when another toggle arrives before the timer fires.
  const historyToggleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const {
    scanSession,
    scanStatus,
    handleScanButton,
    handleCameraScan,
    handleStopConfirm,
  } = useScanOperations({
    connected,
    hasData,
    launcherAccess,
    setLastToken,
    setProPurchaseModalOpen,
    setWriteOpen,
    nfcWriter,
  });

  const history = useQuery({
    queryKey: ["history"],
    queryFn: () => CoreAPI.history(),
    enabled: historyOpen,
  });

  useKeepAwake();

  // Force a fresh fetch each time the modal is opened so the user always sees
  // the latest scans, not a cached snapshot from a prior open.
  useEffect(() => {
    if (historyOpen) {
      history.refetch();
    }
  }, [historyOpen, history]);

  useEffect(() => {
    return () => {
      void (async () => {
        try {
          await cancelSession();
        } catch (err) {
          logger.error("Failed to cancel NFC session on unmount", err, {
            category: "nfc",
            action: "cancelSession",
            severity: "warning",
          });
        }
      })();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (historyToggleTimerRef.current !== null) {
        clearTimeout(historyToggleTimerRef.current);
        historyToggleTimerRef.current = null;
      }
    };
  }, []);

  // Announce page context for screen reader users on page load (once only)
  const hasAnnouncedRef = useRef(false);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (hasAnnouncedRef.current) return;

    // Determine what to announce based on available features
    let message: string;
    if (nfcAvailable) {
      // NFC available - announce scan instruction
      message = t("spinner.pressToScan");
    } else if (cameraAvailable) {
      // No NFC but camera available - announce camera option
      message = t("scan.cameraAvailable");
    } else {
      // Neither available - announce page name
      message = t("nav.index");
    }

    // Small delay to ensure page is rendered and screen reader is ready
    const timer = setTimeout(() => {
      if (!hasAnnouncedRef.current) {
        hasAnnouncedRef.current = true;
        announce(message);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [announce, t, nfcAvailable, cameraAvailable]);

  return (
    <>
      <PageFrame>
        <h1 className="sr-only">Zaparoo</h1>
        <div className="flex flex-row justify-between">
          <div>
            <img src={logoImage} alt="Zaparoo logo" width="160px" />
          </div>
          <ToggleChip
            icon={<HistoryIcon size="32" />}
            state={historyOpen}
            setState={(s) => {
              if (historyToggleTimerRef.current !== null) {
                clearTimeout(historyToggleTimerRef.current);
                historyToggleTimerRef.current = null;
              }
              if (!historyOpen && proPurchaseModalOpen) {
                setProPurchaseModalOpen(false);
                historyToggleTimerRef.current = setTimeout(() => {
                  historyToggleTimerRef.current = null;
                  setHistoryOpen(s);
                }, 150);
              } else {
                setHistoryOpen(s);
              }
            }}
            disabled={!connected}
            aria-label={t("scan.historyTitle")}
          />
        </div>

        <ScanControls
          scanSession={scanSession}
          scanStatus={scanStatus}
          onScanButton={handleScanButton}
          onCameraScan={handleCameraScan}
        />

        <div>
          <ConnectionStatus />

          <LastScannedInfo lastToken={lastToken} scanStatus={scanStatus} />

          <NowPlayingInfo
            mediaName={playing.mediaName}
            mediaPath={playing.mediaPath}
            systemName={playing.systemName}
            onStop={() => setStopConfirmOpen(true)}
            connected={connected}
          />
        </div>
      </PageFrame>

      <HistoryModal
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        historyData={history.data}
      />
      <WriteModal isOpen={writeOpen} close={closeWriteModal} />
      <PurchaseModal />
      <StopConfirmModal
        isOpen={stopConfirmOpen}
        onClose={() => setStopConfirmOpen(false)}
        onConfirm={() => {
          handleStopConfirm();
          setStopConfirmOpen(false);
        }}
      />
    </>
  );
}
