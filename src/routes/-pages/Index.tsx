import { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { GamepadDirectional } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Nfc } from "@capawesome-team/capacitor-nfc";
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
  const deviceKey = useActiveDeviceKey();
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
  const [deviceSheetOpen, setDeviceSheetOpen] = useState(false);
  const [selectedCoverEntry, setSelectedCoverEntry] =
    useState<MediaBrowseEntry | null>(null);
  const [stopTarget, setStopTarget] = useState<MediaSlot | null>(null);
  const [remoteKeyboardOpen, setRemoteKeyboardOpen] = useState(false);
  const [replayingLast, setReplayingLast] = useState(false);
  const replayControllerRef = useRef<AbortController | null>(null);
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
    queryKey: ["history"],
    queryFn: () => CoreAPI.history(),
    enabled: historyOpen,
  });

  // The Zap page doubles as an always-ready reader, but only while a Core is
  // connected to receive scans; otherwise let the phone sleep normally.
  useKeepAwake(connected && keepScreenAwake);

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

  const replayLastPlayed = async () => {
    if (!connected || !lastPlayed || replayControllerRef.current) return;

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
      await CoreAPI.run({ text });
    } catch (error) {
      if (controller.signal.aborted) return;
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
      replayControllerRef.current?.abort();
      replayControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!connected) replayControllerRef.current?.abort();
  }, [connected]);

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
        headerCenter={
          <>
            <h1 ref={headingRef} className="sr-only">
              Zaparoo
            </h1>
            <div className="pl-1 md:pl-0">
              <ZapLogo width={144} />
            </div>
          </>
        }
        headerRight={
          <div className="flex items-center">
            <HomeDevicePill
              className="max-w-[6.5rem] min-[23rem]:max-w-40"
              sheetOpen={deviceSheetOpen}
              onOpen={() => setDeviceSheetOpen(true)}
            />
            <HeaderButton
              icon={<HistoryIcon size="24" />}
              active={historyOpen}
              onClick={() => {
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
              }}
              disabled={!connected}
              title={t("scan.historyTitle")}
              aria-label={t("scan.historyTitle")}
            />
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          <ScanActions
            layout={scanLayout}
            scanSession={scanSession}
            scanStatus={scanStatus}
            onTapScan={handleScanButton}
            onCameraScan={handleCameraScan}
            nfcEnabled={nfcEnabled}
            onOpenNfcSettings={() => void Nfc.openSettings()}
          />

          <GatedFeature featureId="remoteInput">
            <Button
              variant="secondary"
              className="w-full"
              icon={<GamepadDirectional size={20} />}
              label={t("scan.remoteKeyboard")}
              disabled={!connected}
              onClick={() => setRemoteKeyboardOpen(true)}
            />
          </GatedFeature>
        </div>

        <div className="mt-5 flex flex-col gap-5">
          <NowPlayingCard
            media={playing}
            playlist={primaryPlaylist}
            connected={connected}
            canPausePlaylist={canPausePlaylist(playing)}
            lastPlayed={lastPlayed}
            replayingLast={replayingLast}
            onReplayLast={() => void replayLastPlayed()}
            onStop={() => setStopTarget("primary")}
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
              <NowPlayingCard
                media={backgroundPlaying}
                playlist={backgroundPlaylist}
                connected={connected}
                headingLabel={t("scan.backgroundMediaHeading")}
                stopButtonLabel={t("scan.stopBackgroundMediaButton")}
                canPausePlaylist={canPausePlaylist(backgroundPlaying)}
                onStop={() => setStopTarget("background")}
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

          <ReaderStrip connected={connected} />
        </div>
      </PageFrame>

      <LibraryMediaDetailsModal
        isOpen={selectedCoverEntry !== null}
        close={() => setSelectedCoverEntry(null)}
        entry={selectedCoverEntry}
        systemId={selectedCoverEntry ? entrySystemId(selectedCoverEntry) : ""}
        deviceKey={deviceKey}
      />

      <DeviceSheet
        isOpen={deviceSheetOpen}
        close={() => setDeviceSheetOpen(false)}
      />

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
        retapRequired={nfcWriter.retapRequired}
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
