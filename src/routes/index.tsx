import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cancelSession } from "../lib/nfc";
import { CoreAPI } from "../lib/coreApi.ts";
import { HistoryIcon } from "../lib/images";
import { useStatusStore } from "../lib/store";
import { useQuery } from "@tanstack/react-query";
import { KeepAwake } from "@capacitor-community/keep-awake";
import toast from "react-hot-toast";
import { ToggleChip } from "../components/wui/ToggleChip";
import { useTranslation } from "react-i18next";
import { Preferences } from "@capacitor/preferences";
import { PageFrame } from "../components/PageFrame";
import { useNfcWriter, WriteAction } from "@/lib/writeNfcHook.tsx";
import { useProPurchase } from "@/components/ProPurchase.tsx";
import { WriteModal } from "@/components/WriteModal.tsx";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { ConnectionStatus } from "../components/home/ConnectionStatus";
import { ScanControls } from "../components/home/ScanControls";
import { ScanSettings } from "../components/home/ScanSettings";
import { LastScannedInfo } from "../components/home/LastScannedInfo";
import { NowPlayingInfo } from "../components/home/NowPlayingInfo";
import { HistoryModal } from "../components/home/HistoryModal";
import { StopConfirmModal } from "../components/home/StopConfirmModal";
import { useScanOperations } from "../hooks/useScanOperations";
import { useAppSettings } from "../hooks/useAppSettings";


interface LoaderData {
  restartScan: boolean;
  launchOnScan: boolean;
}

export const Route = createFileRoute("/")({
  loader: async (): Promise<LoaderData> => {
    const restartScan =
      (await Preferences.get({ key: "restartScan" })).value === "true";
    const launchOnScan =
      (await Preferences.get({ key: "launchOnScan" })).value !== "false";
    return {
      restartScan,
      launchOnScan
    };
  },
  ssr: false,
  component: Index
});

function Index() {
  const initData = Route.useLoaderData();

  const { t } = useTranslation();
  const nfcWriter = useNfcWriter();
  const [writeOpen, setWriteOpen] = useState(false);
  const closeWriteModal = () => {
    setWriteOpen(false);
    nfcWriter.end();
  };
  useEffect(() => {
    if (nfcWriter.status !== null) {
      setWriteOpen(false);
      nfcWriter.end();
    }
  }, [nfcWriter]);
  const { PurchaseModal, proPurchaseModalOpen, setProPurchaseModalOpen } =
    useProPurchase();

  const connected = useStatusStore((state) => state.connected);
  const playing = useStatusStore((state) => state.playing);
  const lastToken = useStatusStore((state) => state.lastToken);
  const setLastToken = useStatusStore((state) => state.setLastToken);

  const [historyOpen, setHistoryOpen] = useState(false);
  const safeInsets = useStatusStore((state) => state.safeInsets);

  const runQueue = useStatusStore((state) => state.runQueue);
  const setRunQueue = useStatusStore((state) => state.setRunQueue);
  const writeQueue = useStatusStore((state) => state.writeQueue);
  const setWriteQueue = useStatusStore((state) => state.setWriteQueue);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);

  const { restartScan, setRestartScan, launchOnScan, setLaunchOnScan, launcherAccess } = useAppSettings({ initData });

  const { scanSession, scanStatus, handleScanButton, handleCameraScan, handleStopConfirm, runToken } = useScanOperations({
    connected,
    launcherAccess,
    setLastToken,
    setProPurchaseModalOpen,
    setWriteOpen
  });

  const history = useQuery({
    queryKey: ["history"],
    queryFn: () => CoreAPI.history()
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

  useEffect(() => {
    if (!runQueue) {
      return;
    }
    console.log("runQueue", runQueue.value);
    runToken(
      runQueue.value,
      runQueue.value,
      launcherAccess,
      connected,
      setLastToken,
      setProPurchaseModalOpen,
      runQueue.unsafe
    )
      .then((success: boolean) => {
        console.log("runQueue success", success);
      })
      .catch((e) => {
        console.error("runQueue error", e);
      });
    setRunQueue(null);
  }, [
    connected,
    launcherAccess,
    runQueue,
    setLastToken,
    setProPurchaseModalOpen,
    setRunQueue,
    runToken
  ]);

  useEffect(() => {
    if (writeQueue === "") {
      return;
    }
    Nfc.isSupported()
      .then((result) => {
        if (!result.nfc) {
          toast.error((to) => (
            <span
              className="flex flex-grow flex-col"
              onClick={() => toast.dismiss(to.id)}
            >
              {t("write.nfcNotSupported")}
            </span>
          ));
          return;
        } else {
          console.log("writeQueue", writeQueue);
          setWriteOpen(true);
          nfcWriter.write(WriteAction.Write, writeQueue);
          setWriteQueue("");
        }
      })
      .catch((e) => {
        toast.error((to) => (
          <span
            className="flex flex-grow flex-col"
            onClick={() => toast.dismiss(to.id)}
          >
            {e.message}
          </span>
        ));
      });
  }, [writeQueue, nfcWriter, t, setWriteQueue]);

  return (
    <>
      <PageFrame>
        <div className="flex flex-row justify-between">
          <div>
            <img src="/lockup.png" alt="Zaparoo logo" width="160px" />
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
          
          <ScanSettings
            connected={connected}
            restartScan={restartScan}
            setRestartScan={setRestartScan}
            launchOnScan={launchOnScan}
            setLaunchOnScan={setLaunchOnScan}
          />
          
          <LastScannedInfo
            lastToken={lastToken}
            scanStatus={scanStatus}
          />

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
        safeInsetsBottom={safeInsets.bottom}
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
