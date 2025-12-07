import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { useNfcWriter, WriteMethod } from "@/lib/writeNfcHook.tsx";
import { Status } from "@/lib/nfc.ts";
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

export const Route = createFileRoute("/")({
  ssr: false,
  component: Index,
});

function Index() {
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
    setWriteOpen(false);
    await nfcWriter.end();
    setWriteQueue("");
  };
  useEffect(() => {
    // Only auto-close on successful write completion
    if (nfcWriter.status === Status.Success) {
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
  });

  const history = useQuery({
    queryKey: ["history"],
    queryFn: () => CoreAPI.history(),
    enabled: historyOpen,
  });

  useEffect(() => {
    if (historyOpen) {
      history.refetch();
    }
  }, [history, historyOpen]);

  useKeepAwake();

  useEffect(() => {
    return () => {
      cancelSession();
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
              if (!historyOpen && proPurchaseModalOpen) {
                setProPurchaseModalOpen(false);
                setTimeout(() => {
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
