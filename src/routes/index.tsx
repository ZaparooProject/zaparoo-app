import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { useNfcWriter, WriteMethod } from "@/lib/writeNfcHook.tsx";
import { Status } from "@/lib/nfc.ts";
import { useProPurchase } from "@/components/ProPurchase.tsx";
import { WriteModal } from "@/components/WriteModal.tsx";
import logoImage from "@/assets/lockup.png";
import { cancelSession } from "../lib/nfc";
import { CoreAPI } from "../lib/coreApi.ts";
import { HistoryIcon } from "../lib/images";
import { useStatusStore } from "../lib/store";
import { ToggleChip } from "../components/wui/ToggleChip";
import { PageFrame } from "../components/PageFrame";
import { ConnectionStatus } from "../components/home/ConnectionStatus";
import { ScanControls } from "../components/home/ScanControls";
import { LastScannedInfo } from "../components/home/LastScannedInfo";
import { NowPlayingInfo } from "../components/home/NowPlayingInfo";
import { HistoryModal } from "../components/home/HistoryModal";
import { StopConfirmModal } from "../components/home/StopConfirmModal";
import { useScanOperations } from "../hooks/useScanOperations";
import { usePreferencesStore } from "../lib/preferencesStore";

interface LoaderData {
  restartScan: boolean;
  launchOnScan: boolean;
  launcherAccess: boolean;
  preferRemoteWriter: boolean;
  shakeMode: "random" | "custom";
  shakeZapscript: string;
}

export const Route = createFileRoute("/")({
  loader: (): LoaderData => {
    const state = usePreferencesStore.getState();
    return {
      restartScan: state.restartScan,
      launchOnScan: state.launchOnScan,
      launcherAccess: state.launcherAccess,
      preferRemoteWriter: state.preferRemoteWriter,
      shakeMode: state.shakeMode,
      shakeZapscript: state.shakeZapscript
    };
  },
  ssr: false,
  component: Index
});

function Index() {
  const initData = Route.useLoaderData();
  const launcherAccess = usePreferencesStore((state) => state.launcherAccess);
  const preferRemoteWriter = usePreferencesStore(
    (state) => state.preferRemoteWriter
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
  }, [nfcWriter.status]);
  const { PurchaseModal, proPurchaseModalOpen, setProPurchaseModalOpen } =
    useProPurchase(initData.launcherAccess);

  const connected = useStatusStore((state) => state.connected);
  const playing = useStatusStore((state) => state.playing);
  const lastToken = useStatusStore((state) => state.lastToken);
  const setLastToken = useStatusStore((state) => state.setLastToken);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);

  const {
    scanSession,
    scanStatus,
    handleScanButton,
    handleCameraScan,
    handleStopConfirm
  } = useScanOperations({
    connected,
    launcherAccess,
    setLastToken,
    setProPurchaseModalOpen,
    setWriteOpen
  });

  const history = useQuery({
    queryKey: ["history"],
    queryFn: () => CoreAPI.history(),
    enabled: historyOpen
  });

  useEffect(() => {
    if (historyOpen) {
      history.refetch();
    }
  }, [history, historyOpen]);

  useEffect(() => {
    KeepAwake.keepAwake();
    return () => {
      KeepAwake.allowSleep();
    };
  }, []);

  useEffect(() => {
    return () => {
      cancelSession();
    };
  }, []);

  return (
    <>
      <PageFrame>
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
          />
        </div>

        <ScanControls
          scanSession={scanSession}
          scanStatus={scanStatus}
          connected={connected}
          onScanButton={handleScanButton}
          onCameraScan={handleCameraScan}
        />

        <div>
          <ConnectionStatus connected={connected} />

          <LastScannedInfo lastToken={lastToken} scanStatus={scanStatus} />

          {connected && (
            <NowPlayingInfo
              mediaName={playing.mediaName}
              systemName={playing.systemName}
              onStop={() => setStopConfirmOpen(true)}
            />
          )}
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
