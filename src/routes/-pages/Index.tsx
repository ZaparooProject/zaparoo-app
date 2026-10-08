import { useCallback, useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { GamepadDirectional, NfcIcon as NfcSymbol } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { logger } from "@/lib/logger";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import {
  isReaderActivityOpen,
  useNfcWriter,
  WriteMethod,
} from "@/lib/writeNfcHook.tsx";
import { useProPurchase } from "@/components/ProPurchase.tsx";
import { ReaderActivityControl } from "@/components/ReaderActivityControl";
import { useAnnouncer } from "@/components/A11yAnnouncer";
import { cancelSession } from "@/lib/nfc";
import { CoreAPI } from "@/lib/coreApi";
import { entrySystemId, resolveLibraryLaunchText } from "@/lib/libraryMedia";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import type {
  MediaBrowseEntry,
  MediaSlot,
  PlayingResponse,
} from "@/lib/models";
import { HistoryIcon, ZapLogo } from "@/lib/images";
import { useStatusStore } from "@/lib/store";
import { Button } from "@/components/wui/Button";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { GatedFeature } from "@/components/GatedFeature";
import { PageFrame } from "@/components/PageFrame";
import { DeviceSheet } from "@/components/home/DeviceSheet";
import { useDeviceSheetController } from "@/hooks/useDeviceSheetController";
import { HomeDevicePill } from "@/components/home/HomeDevicePill";
import { ScanActions } from "@/components/home/ScanActions";
import { MediaCoverRow } from "@/components/home/MediaCoverRow";
import { NowPlayingCard } from "@/components/home/NowPlayingCard";
import { ReaderStrip } from "@/components/home/ReaderStrip";
import { HistoryModal } from "@/components/home/HistoryModal";
import { LibraryMediaDetailsModal } from "@/components/library/LibraryMediaDetailsModal";
import { StopConfirmModal } from "@/components/home/StopConfirmModal";
import { RemoteKeyboardModal } from "@/components/RemoteKeyboardModal";
import { useScanOperations } from "@/hooks/useScanOperations";
import { useHomeScanLayout } from "@/hooks/useHomeScanLayout";
import { useNfcEnabled } from "@/hooks/useNfcEnabled";
import { useFavourites, useRecentlyPlayed } from "@/hooks/useHomeCoverRows";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { useConnection } from "@/hooks/useConnection";
import { useKeepAwake } from "@/hooks/useKeepAwake";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  useLiveCoreControls,
  type LiveCoreTarget,
} from "@/hooks/useLiveCoreControls";

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
  const preferRemoteWriter = usePreferencesStore(
    (state) => state.preferRemoteWriter,
  );
  const keepScreenAwake = usePreferencesStore((state) => state.keepScreenAwake);

  const nfcWriter = useNfcWriter(WriteMethod.Auto, preferRemoteWriter);
  // Local modal state: queue-driven writes render their own modal at the app
  // root; this one belongs exclusively to this page's scan-flow writes. The
  // modal shows while a write is intended and auto-closes on any completion
  // (success, cancelled, or error) because status becomes non-null.
  const [writeIntent, setWriteIntent] = useState(false);
  const writeOpen = isReaderActivityOpen(writeIntent, nfcWriter);
  const cancelReaderActivity = async () => {
    try {
      await nfcWriter.end();
    } catch (err) {
      logger.error("Failed to end NFC writer session", err, {
        category: "nfc",
        action: "cancelReaderActivity",
        severity: "error",
      });
    } finally {
      setWriteIntent(false);
    }
  };
  const { purchaseModal, proPurchaseModalOpen, setProPurchaseModalOpen } =
    useProPurchase();

  const deviceKey = useActiveDeviceKey();
  const wide = useMediaQuery("(min-width: 760px)");
  const remoteDocked = useMediaQuery("(min-width: 1024px)");
  const remoteFeature = useCoreFeature("remoteInput");
  const stopSessionRef = useRef<LiveCoreTarget | null>(null);
  const connected = useStatusStore((state) => state.connected);
  const playing = useStatusStore((state) => state.playing);
  const backgroundPlaying = useStatusStore((state) => state.backgroundPlaying);
  const primaryPlaylist = useStatusStore((state) => state.playlists.primary);
  const backgroundPlaylist = useStatusStore(
    (state) => state.playlists.background,
  );
  const setPlaylist = useStatusStore((state) => state.setPlaylist);
  const setLastToken = useStatusStore((state) => state.setLastToken);
  const { hasData } = useConnection();

  const [historyOpen, setHistoryOpen] = useState(false);
  const {
    isOpen: deviceSheetOpen,
    setOpen: setDeviceSheetOpen,
    shared: sharedDeviceSheet,
  } = useDeviceSheetController();
  const [selectedCoverEntry, setSelectedCoverEntry] =
    useState<MediaBrowseEntry | null>(null);
  const [stopTarget, setStopTarget] = useState<MediaSlot | null>(null);
  const [remoteKeyboardOpen, setRemoteKeyboardOpen] = useState(false);
  const [replayingLast, setReplayingLast] = useState(false);
  const replayControllerRef = useRef<AbortController | null>(null);
  const controls = useLiveCoreControls(() => {
    replayControllerRef.current?.abort();
    replayControllerRef.current = null;
    setReplayingLast(false);
    stopSessionRef.current = null;
    setStopTarget(null);
  });
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
  const scanLayout = useHomeScanLayout();
  const recentlyPlayed = useRecentlyPlayed();
  const lastPlayed = recentlyPlayed[0] ?? null;
  const favourites = useFavourites();
  const nfcEnabled = useNfcEnabled();

  const history = useQuery({
    queryKey: ["history", deviceKey],
    queryFn: () => CoreAPI.history(),
    enabled: historyOpen && connected && Boolean(deviceKey),
    // Reopening the enabled query refreshes scans without an effect refetch loop.
    staleTime: 0,
  });

  // The Zap page doubles as an always-ready reader, but only while a Core is
  // connected to receive scans; otherwise let the phone sleep normally.
  useKeepAwake(connected && keepScreenAwake);

  const toggleHistory = useCallback(() => {
    const nextOpen = !historyOpen;
    if (historyToggleTimerRef.current !== null) {
      clearTimeout(historyToggleTimerRef.current);
      historyToggleTimerRef.current = null;
    }
    if (nextOpen && proPurchaseModalOpen) {
      setProPurchaseModalOpen(false);
      historyToggleTimerRef.current = setTimeout(() => {
        historyToggleTimerRef.current = null;
        setHistoryOpen(nextOpen);
      }, 150);
    } else {
      setHistoryOpen(nextOpen);
    }
  }, [historyOpen, proPurchaseModalOpen, setProPurchaseModalOpen]);
  const sharedNavigation = sharedDeviceSheet;

  const requestStop = (slot: MediaSlot) => {
    const session = controls.captureTarget();
    if (!session) return;
    stopSessionRef.current = session;
    setStopTarget(slot);
  };

  const confirmStop = () => {
    const target = stopTarget;
    const session = stopSessionRef.current;
    stopSessionRef.current = null;
    setStopTarget(null);
    if (!target || !controls.isCurrentTarget(session)) return;

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

  const replayLastPlayed = async () => {
    const target = controls.captureTarget();
    if (!target || !lastPlayed || replayControllerRef.current) return;

    const controller = new AbortController();
    replayControllerRef.current = controller;
    setReplayingLast(true);
    try {
      const text = await resolveLibraryLaunchText(
        lastPlayed,
        entrySystemId(lastPlayed),
        controller.signal,
      );
      if (!text) throw new Error("Launch target could not be resolved");
      if (controller.signal.aborted || !controls.isCurrentTarget(target))
        return;
      await CoreAPI.run({ text });
    } catch (error) {
      if (controller.signal.aborted || !controls.isCurrentTarget(target))
        return;
      logger.error("Failed to replay most recent media", error, {
        category: "api",
        action: "replayLastPlayed",
        severity: "error",
      });
      showRateLimitedErrorToast(t("scan.playLastPlayedError"));
    } finally {
      if (replayControllerRef.current === controller) {
        replayControllerRef.current = null;
        setReplayingLast(false);
      }
    }
  };

  const runPlaylistItem = (slot: MediaSlot, index: number) => {
    const target = controls.captureTarget();
    if (!target) return;
    const playlist = useStatusStore.getState().playlists[slot];
    const playlistID = playlist?.id;

    void CoreAPI.run({
      text: `**playlist.goto:${index + 1}?slot=${slot}||**playlist.play?slot=${slot}`,
    })
      .then(() => {
        if (!playlistID || !controls.isCurrentTarget(target)) return;
        const current = useStatusStore.getState().playlists[slot];
        if (current?.id === playlistID) {
          setPlaylist(slot, { ...current, index, playing: true });
        }
      })
      .catch((error) => {
        if (!controls.isCurrentTarget(target)) return;
        logger.error("Failed to select playlist item", error, {
          category: "api",
          action: "selectPlaylistItem",
          severity: "error",
        });
        showRateLimitedErrorToast(t("scan.playlistControlError"));
      });
  };

  const runPlaylistCommand = (slot: MediaSlot, command: PlaylistCommand) => {
    const target = controls.captureTarget();
    if (!target) return;
    const playlist = useStatusStore.getState().playlists[slot];
    const playlistID = playlist?.id;
    const playing =
      command === "play" ? true : command === "pause" ? false : null;

    void CoreAPI.run({
      text: `**playlist.${command}?slot=${slot}`,
    })
      .then(() => {
        if (
          playing === null ||
          !playlistID ||
          !controls.isCurrentTarget(target)
        ) {
          return;
        }
        const current = useStatusStore.getState().playlists[slot];
        if (current?.id === playlistID) {
          setPlaylist(slot, { ...current, playing });
        }
      })
      .catch((error) => {
        if (!controls.isCurrentTarget(target)) return;
        logger.error("Failed to control playlist", error, {
          category: "api",
          action: "runPlaylistControl",
          severity: "error",
        });
        showRateLimitedErrorToast(t("scan.playlistControlError"));
      });
  };

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
      replayControllerRef.current?.abort();
      replayControllerRef.current = null;
    };
  }, []);

  // Announce page context for screen reader users on page load (once only)
  const hasAnnouncedRef = useRef(false);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (hasAnnouncedRef.current) return;

    // Name the reader action shown first on the page.
    let message: string;
    if (scanLayout.leading === "nfc") {
      message = t("scan.tapTag");
    } else if (scanLayout.leading === "camera") {
      message = t("scan.scanCode");
    } else {
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
  }, [announce, t, scanLayout.leading]);

  return (
    <>
      <PageFrame
        layout="workspace"
        className="zap-page"
        headerMode={sharedNavigation ? "phone" : "always"}
        headerCenter={<ZapLogo width={144} />}
        headerRight={
          <div className="flex items-center">
            <div className="home-device-trigger">
              <HomeDevicePill
                className="max-w-[6.5rem] min-[23rem]:max-w-40"
                sheetOpen={deviceSheetOpen}
                onOpen={() => setDeviceSheetOpen(true)}
              />
            </div>
            {(!wide || !sharedNavigation) && (
              <HeaderButton
                icon={<HistoryIcon size="24" />}
                active={historyOpen}
                onClick={toggleHistory}
                disabled={!connected}
                title={t("scan.historyTitle")}
                aria-label={t("scan.historyTitle")}
                aria-expanded={historyOpen}
              />
            )}
          </div>
        }
      >
        <h1 ref={headingRef} className="sr-only">
          Zaparoo
        </h1>
        <div
          className="zap-workspace"
          data-remote-available={remoteFeature.available}
          data-reader-tools={
            scanLayout.canScan || scanLayout.showEmptyState || writeOpen
          }
        >
          <div className="zap-controls">
            <div className="zap-reader-tools">
              <ScanActions
                layout={scanLayout}
                compact={remoteDocked}
                scanSession={scanSession}
                scanStatus={scanStatus}
                onTapScan={handleScanButton}
                onCameraScan={handleCameraScan}
                nfcEnabled={nfcEnabled}
                onOpenNfcSettings={() => void Nfc.openSettings()}
                writeActivity={
                  writeOpen ? (
                    <ReaderActivityControl
                      state={
                        nfcWriter.verifyError
                          ? "error"
                          : nfcWriter.retapRequired
                            ? "attention"
                            : "waiting"
                      }
                      idleLabel={t("create.search.writeLabel")}
                      activeLabel={
                        nfcWriter.retapRequired
                          ? t("spinner.retapTag")
                          : t("spinner.holdTagReader")
                      }
                      errorMessage={
                        nfcWriter.verifyError
                          ? t("spinner.verifyFailedRetry")
                          : undefined
                      }
                      icon={<NfcSymbol size={28} />}
                      readerIconSize={28}
                      size={remoteDocked ? "default" : "lg"}
                      layout={remoteDocked ? "inline" : "stacked"}
                      buttonClassName={
                        remoteDocked
                          ? "min-h-18 w-full max-w-none"
                          : "min-h-[8.5rem] w-full"
                      }
                      onStart={() => undefined}
                      onCancel={() => void cancelReaderActivity()}
                      onRetry={() => void nfcWriter.retry()}
                    />
                  ) : undefined
                }
              />

              {!(remoteDocked && remoteFeature.available) && (
                <GatedFeature featureId="remoteInput">
                  <Button
                    variant="secondary"
                    className="zap-remote-trigger w-full"
                    icon={<GamepadDirectional size={20} />}
                    label={t("scan.remoteKeyboard")}
                    disabled={!controls.available || !remoteFeature.available}
                    onClick={() => setRemoteKeyboardOpen(true)}
                  />
                </GatedFeature>
              )}
            </div>

            <div className="zap-remote-slot">
              <RemoteKeyboardModal
                isOpen={remoteKeyboardOpen}
                close={() => setRemoteKeyboardOpen(false)}
                docked={remoteDocked && remoteFeature.available}
              />
            </div>
            <div className="zap-readers">
              <ReaderStrip connected={controls.available} />
            </div>
          </div>
          <div className="zap-playback">
            <NowPlayingCard
              media={playing}
              playlist={primaryPlaylist}
              connected={controls.available}
              canPausePlaylist={canPausePlaylist(playing)}
              lastPlayed={lastPlayed}
              replayingLast={replayingLast}
              onReplayLast={() => void replayLastPlayed()}
              onStop={() => requestStop("primary")}
              onPlaylistPrevious={() =>
                runPlaylistCommand("primary", "previous")
              }
              onPlaylistToggle={() =>
                runPlaylistCommand(
                  "primary",
                  primaryPlaylist?.playing ? "pause" : "play",
                )
              }
              onPlaylistNext={() => runPlaylistCommand("primary", "next")}
              onPlaylistSelect={(index) => runPlaylistItem("primary", index)}
            />

            {backgroundMediaAvailable &&
              (backgroundPlaying.mediaName !== "" || backgroundPlaylist) && (
                <NowPlayingCard
                  media={backgroundPlaying}
                  playlist={backgroundPlaylist}
                  connected={controls.available}
                  headingLabel={t("scan.backgroundMediaHeading")}
                  stopButtonLabel={t("scan.stopBackgroundMediaButton")}
                  canPausePlaylist={canPausePlaylist(backgroundPlaying)}
                  onStop={() => requestStop("background")}
                  onPlaylistPrevious={() =>
                    runPlaylistCommand("background", "previous")
                  }
                  onPlaylistToggle={() =>
                    runPlaylistCommand(
                      "background",
                      backgroundPlaylist?.playing ? "pause" : "play",
                    )
                  }
                  onPlaylistNext={() =>
                    runPlaylistCommand("background", "next")
                  }
                  onPlaylistSelect={(index) =>
                    runPlaylistItem("background", index)
                  }
                />
              )}
          </div>
          <div className="zap-collections">
            <MediaCoverRow
              headingLabel={t("scan.favouritesHeading")}
              entries={favourites}
              onSelect={setSelectedCoverEntry}
            />

            <MediaCoverRow
              headingLabel={t("scan.recentsHeading")}
              entries={recentlyPlayed}
              onSelect={setSelectedCoverEntry}
            />
          </div>
        </div>
      </PageFrame>

      <LibraryMediaDetailsModal
        isOpen={selectedCoverEntry !== null}
        close={() => setSelectedCoverEntry(null)}
        entry={selectedCoverEntry}
        systemId={selectedCoverEntry ? entrySystemId(selectedCoverEntry) : ""}
        deviceKey={deviceKey}
      />

      {!sharedDeviceSheet && (
        <DeviceSheet
          isOpen={deviceSheetOpen}
          close={() => setDeviceSheetOpen(false)}
        />
      )}

      <HistoryModal
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        historyData={history.data}
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
