import { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { logger } from "@/lib/logger";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import {
  isWriteModalOpen,
  useNfcWriter,
  WriteMethod,
} from "@/lib/writeNfcHook.tsx";
import { useProPurchase } from "@/components/ProPurchase.tsx";
import { WriteModal } from "@/components/WriteModal.tsx";
import { useAnnouncer } from "@/components/A11yAnnouncer";
import { cancelSession } from "@/lib/nfc";
import { CoreAPI } from "@/lib/coreApi";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import type { MediaSlot, PlayingResponse } from "@/lib/models";
import { HistoryIcon, ZapLogo } from "@/lib/images";
import { useStatusStore } from "@/lib/store";
import { ToggleChip } from "@/components/wui/ToggleChip";
import { PageFrame } from "@/components/PageFrame";
import { ConnectionStatus } from "@/components/home/ConnectionStatus";
import { ScanControls } from "@/components/home/ScanControls";
import { LastScannedInfo } from "@/components/home/LastScannedInfo";
import { NowPlayingInfo } from "@/components/home/NowPlayingInfo";
import { HistoryModal } from "@/components/home/HistoryModal";
import { StopConfirmModal } from "@/components/home/StopConfirmModal";
import { RemoteKeyboardModal } from "@/components/RemoteKeyboardModal";
import { useScanOperations } from "@/hooks/useScanOperations";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { useConnection } from "@/hooks/useConnection";
import { useKeepAwake } from "@/hooks/useKeepAwake";

type PlaylistCommand = "previous" | "pause" | "play" | "next";

function canPausePlaylist(media: PlayingResponse) {
  return (
    media.systemId === "Audio" &&
    media.launcherControls?.includes("pause") === true &&
    media.launcherControls.includes("resume")
  );
}

export function Index() {
  const { t } = useTranslation();
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(t("nav.index"));
  const { announce } = useAnnouncer();
  const launcherAccess = usePreferencesStore((state) => state.launcherAccess);
  const nfcAvailable = usePreferencesStore((state) => state.nfcAvailable);
  const cameraAvailable = usePreferencesStore((state) => state.cameraAvailable);
  const preferRemoteWriter = usePreferencesStore(
    (state) => state.preferRemoteWriter,
  );

  const nfcWriter = useNfcWriter(WriteMethod.Auto, preferRemoteWriter);
  // Local modal state: queue-driven writes render their own modal at the app
  // root; this one belongs exclusively to this page's scan-flow writes. The
  // modal shows while a write is intended and auto-closes on any completion
  // (success, cancelled, or error) because status becomes non-null.
  const [writeIntent, setWriteIntent] = useState(false);
  const writeOpen = isWriteModalOpen(writeIntent, nfcWriter);
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
      setWriteIntent(false);
    }
  };
  const { purchaseModal, proPurchaseModalOpen, setProPurchaseModalOpen } =
    useProPurchase();

  const connected = useStatusStore((state) => state.connected);
  const playing = useStatusStore((state) => state.playing);
  const backgroundPlaying = useStatusStore((state) => state.backgroundPlaying);
  const primaryPlaylist = useStatusStore((state) => state.playlists.primary);
  const backgroundPlaylist = useStatusStore(
    (state) => state.playlists.background,
  );
  const setPlaylist = useStatusStore((state) => state.setPlaylist);
  const lastToken = useStatusStore((state) => state.lastToken);
  const setLastToken = useStatusStore((state) => state.setLastToken);
  const { hasData } = useConnection();

  const [historyOpen, setHistoryOpen] = useState(false);
  const [stopTarget, setStopTarget] = useState<MediaSlot | null>(null);
  const [remoteKeyboardOpen, setRemoteKeyboardOpen] = useState(false);
  const { available: backgroundMediaAvailable } = useCoreFeature(
    "backgroundMediaSlot",
    { requireKnownSupport: true },
  );
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
    setWriteOpen: setWriteIntent,
    nfcWriter,
  });

  const history = useQuery({
    queryKey: ["history"],
    queryFn: () => CoreAPI.history(),
    enabled: historyOpen,
  });

  useKeepAwake();

  const confirmStop = () => {
    const target = stopTarget;
    setStopTarget(null);
    if (!target) return;

    const playlist = useStatusStore.getState().playlists[target];
    if (playlist) {
      void CoreAPI.run({
        text: `**playlist.stop?slot=${target}`,
      }).catch((error) => {
        logger.error("Failed to stop playlist", error, {
          category: "api",
          action: "runPlaylistControl",
          severity: "error",
        });
        showRateLimitedErrorToast(t("scan.playlistControlError"));
      });
      return;
    }

    if (target === "primary") {
      handleStopConfirm();
      return;
    }
    void CoreAPI.mediaControl({ action: "stop", slot: "background" }).catch(
      (error) => {
        logger.error("Failed to stop background media", error, {
          category: "api",
          action: "mediaControl",
          severity: "error",
        });
        showRateLimitedErrorToast(t("scan.stopBackgroundMediaError"));
      },
    );
  };

  const runPlaylistCommand = (slot: MediaSlot, command: PlaylistCommand) => {
    const playlist = useStatusStore.getState().playlists[slot];
    const playlistID = playlist?.id;
    const playing =
      command === "play" ? true : command === "pause" ? false : null;

    void CoreAPI.run({
      text: `**playlist.${command}?slot=${slot}`,
    })
      .then(() => {
        if (playing === null || !playlistID) {
          return;
        }
        const current = useStatusStore.getState().playlists[slot];
        if (current?.id === playlistID) {
          setPlaylist(slot, { ...current, playing });
        }
      })
      .catch((error) => {
        logger.error("Failed to control playlist", error, {
          category: "api",
          action: "runPlaylistControl",
          severity: "error",
        });
        showRateLimitedErrorToast(t("scan.playlistControlError"));
      });
  };

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
        <h1 ref={headingRef} className="sr-only">
          Zaparoo
        </h1>
        <div className="flex flex-row justify-between">
          <div>
            <ZapLogo />
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
          connected={connected}
          onRemoteKeyboard={() => setRemoteKeyboardOpen(true)}
        />

        <div>
          <ConnectionStatus />

          <LastScannedInfo lastToken={lastToken} scanStatus={scanStatus} />

          <NowPlayingInfo
            mediaName={playing.mediaName}
            mediaPath={playing.mediaPath}
            systemName={playing.systemName}
            systemId={playing.systemId}
            onStop={() => setStopTarget("primary")}
            connected={connected}
            playlist={primaryPlaylist}
            canPausePlaylist={canPausePlaylist(playing)}
            onPlaylistPrevious={() => runPlaylistCommand("primary", "previous")}
            onPlaylistToggle={() =>
              runPlaylistCommand(
                "primary",
                primaryPlaylist?.playing ? "pause" : "play",
              )
            }
            onPlaylistNext={() => runPlaylistCommand("primary", "next")}
          />

          {backgroundMediaAvailable &&
            (backgroundPlaying.mediaName !== "" || backgroundPlaylist) && (
              <NowPlayingInfo
                mediaName={backgroundPlaying.mediaName}
                mediaPath={backgroundPlaying.mediaPath}
                systemName={backgroundPlaying.systemName}
                systemId={backgroundPlaying.systemId}
                onStop={() => setStopTarget("background")}
                connected={connected}
                headingLabel={t("scan.backgroundMediaHeading")}
                stopButtonLabel={t("scan.stopBackgroundMediaButton")}
                playlist={backgroundPlaylist}
                canPausePlaylist={canPausePlaylist(backgroundPlaying)}
                onPlaylistPrevious={() =>
                  runPlaylistCommand("background", "previous")
                }
                onPlaylistToggle={() =>
                  runPlaylistCommand(
                    "background",
                    backgroundPlaylist?.playing ? "pause" : "play",
                  )
                }
                onPlaylistNext={() => runPlaylistCommand("background", "next")}
              />
            )}
        </div>
      </PageFrame>

      <HistoryModal
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        historyData={history.data}
      />
      <WriteModal
        isOpen={writeOpen}
        close={closeWriteModal}
        verifyError={nfcWriter.verifyError !== null}
        retry={() => void nfcWriter.retry()}
      />
      <RemoteKeyboardModal
        isOpen={remoteKeyboardOpen}
        close={() => setRemoteKeyboardOpen(false)}
      />
      {purchaseModal}
      <StopConfirmModal
        isOpen={stopTarget !== null}
        onClose={() => setStopTarget(null)}
        onConfirm={confirmStop}
        description={
          stopTarget === "background" ? t("stopBackgroundMedia") : undefined
        }
      />
    </>
  );
}
