import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { GamepadDirectionalIcon } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { logger } from "@/lib/logger";
import {
  isReaderActivityOpen,
  useNfcWriter,
  WriteMethod,
} from "@/lib/writeNfcHook.tsx";
import { useProPurchase } from "@/components/ProPurchase.tsx";
import { ReaderActivityControl } from "@/components/ReaderActivityControl";
import { useAnnouncer } from "@/components/A11yAnnouncer";
import { CoreAPI } from "@/lib/coreApi";
import { entrySystemId } from "@/lib/libraryMedia";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import type { MediaBrowseEntry, PlayingResponse } from "@/lib/models";
import { HistoryIcon, NfcIcon, ZapLogo } from "@/lib/images";
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
import { useMetadataDetailsReturn } from "@/hooks/useMetadataDetailsReturn";
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
import { useNowPlayingControls } from "@/hooks/useNowPlayingControls";

const WIDE_QUERY = "(min-width: 760px)";

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
  // Queue-driven writes show their own reader activity at the app root; this
  // intent belongs to writes started from this page's camera scan. The write
  // control replaces the scan actions while a write is intended and gives way
  // on any completion (success, cancelled, or error) once status is non-null.
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
  const wide = useMediaQuery(WIDE_QUERY);
  const remoteDocked = useMediaQuery("(min-width: 1024px)");
  const remoteFeature = useCoreFeature("remoteInput");
  const connected = useStatusStore((state) => state.connected);
  const playing = useStatusStore((state) => state.playing);
  const backgroundPlaying = useStatusStore((state) => state.backgroundPlaying);
  const primaryPlaylist = useStatusStore((state) => state.playlists.primary);
  const backgroundPlaylist = useStatusStore(
    (state) => state.playlists.background,
  );
  const setLastToken = useStatusStore((state) => state.setLastToken);
  const { hasData } = useConnection();

  const [historyOpen, setHistoryOpen] = useState(false);
  const {
    isOpen: deviceSheetOpen,
    setOpen: setDeviceSheetOpen,
    shared: sharedDeviceSheet,
  } = useDeviceSheetController();
  const { entry: returnedCoverEntry, forget: forgetCoverReturn } =
    useMetadataDetailsReturn("home-covers", deviceKey);
  const [selectedCoverEntry, setCoverEntry] = useState<MediaBrowseEntry | null>(
    () => returnedCoverEntry,
  );
  const setSelectedCoverEntry = useCallback(
    (entry: MediaBrowseEntry | null) => {
      forgetCoverReturn();
      setCoverEntry(entry);
    },
    [forgetCoverReturn],
  );
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
  const scanLayout = useHomeScanLayout();
  const recentlyPlayed = useRecentlyPlayed();
  const lastPlayed = recentlyPlayed[0] ?? null;
  const favourites = useFavourites();
  const nfcEnabled = useNfcEnabled();
  const primary = useNowPlayingControls("primary", {
    stopMedia: handleStopConfirm,
    lastPlayed,
  });
  const background = useNowPlayingControls("background");
  const liveControls = primary.available;
  const stopping = primary.stopPending
    ? primary
    : background.stopPending
      ? background
      : null;

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
  const openNfcSettings = () => {
    if (!Capacitor.isNativePlatform()) return;
    Nfc.openSettings().catch((error) => {
      logger.error("Failed to open NFC settings", error, {
        category: "nfc",
        action: "openSettings",
        severity: "warning",
      });
    });
  };

  // From 760px playback is shown first, so it is also first in the DOM: the
  // keyed sections below swap places instead of being reordered with CSS, which
  // keeps focus and reading order in step with what is on screen. React moves
  // the existing node rather than remounting it, but a moved node drops focus,
  // so the focused control is noted when the breakpoint flips and restored.
  const focusBeforeReorderRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const media = window.matchMedia(WIDE_QUERY);
    const noteFocus = () => {
      focusBeforeReorderRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", noteFocus);
      return () => media.removeEventListener("change", noteFocus);
    }
    media.addListener(noteFocus);
    return () => media.removeListener(noteFocus);
  }, []);
  useLayoutEffect(() => {
    const focused = focusBeforeReorderRef.current;
    focusBeforeReorderRef.current = null;
    // Only when the move dropped focus; never take it from a newer owner.
    if (focused?.isConnected && document.activeElement === document.body) {
      focused.focus({ preventScroll: true });
    }
  }, [wide]);

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

  const readerTools = (
    <div key="reader-tools" className="zap-reader-tools">
      <ScanActions
        layout={scanLayout}
        compact={wide}
        scanSession={scanSession}
        scanStatus={scanStatus}
        onTapScan={handleScanButton}
        onCameraScan={handleCameraScan}
        nfcEnabled={nfcEnabled}
        onOpenNfcSettings={openNfcSettings}
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
              icon={<NfcIcon size={wide ? 24 : 28} />}
              readerIconSize={wide ? 24 : 28}
              size={wide ? "default" : "lg"}
              layout={wide ? "inline" : "stacked"}
              className="zap-write-activity"
              buttonClassName={
                wide ? "min-h-18 w-full max-w-none" : "min-h-[8.5rem] w-full"
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
            className="w-full"
            icon={<GamepadDirectionalIcon size={20} />}
            label={t("scan.remoteKeyboard")}
            disabled={!liveControls || !remoteFeature.available}
            onClick={() => setRemoteKeyboardOpen(true)}
          />
        </GatedFeature>
      )}
    </div>
  );

  const playback = (
    <div key="playback" className="zap-playback">
      <NowPlayingCard
        media={playing}
        playlist={primaryPlaylist}
        connected={primary.available}
        canPausePlaylist={canPausePlaylist(playing)}
        lastPlayed={lastPlayed}
        replayingLast={primary.replayingLast}
        onReplayLast={primary.replayLast}
        onStop={primary.requestStop}
        onPrevious={primary.previous}
        onToggle={primary.toggle}
        onNext={primary.next}
        onPlaylistSelect={primary.selectItem}
      />

      {backgroundMediaAvailable &&
        (backgroundPlaying.mediaName !== "" || backgroundPlaylist) && (
          <NowPlayingCard
            media={backgroundPlaying}
            playlist={backgroundPlaylist}
            connected={background.available}
            headingLabel={t("scan.backgroundMediaHeading")}
            stopButtonLabel={t("scan.stopBackgroundMediaButton")}
            canPausePlaylist={canPausePlaylist(backgroundPlaying)}
            onStop={background.requestStop}
            onPrevious={background.previous}
            onToggle={background.toggle}
            onNext={background.next}
            onPlaylistSelect={background.selectItem}
          />
        )}
    </div>
  );

  return (
    <>
      <PageFrame
        layout="workspace"
        headerMode={sharedDeviceSheet ? "phone" : "always"}
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
            {(!wide || !sharedDeviceSheet) && (
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
          <div className="zap-session">
            {wide ? [playback, readerTools] : [readerTools, playback]}
          </div>
          <div className="zap-supporting">
            <div className="zap-remote-slot">
              <RemoteKeyboardModal
                isOpen={remoteKeyboardOpen}
                close={() => setRemoteKeyboardOpen(false)}
                docked={remoteDocked && remoteFeature.available}
              />
            </div>
            <div className="zap-readers">
              <ReaderStrip connected={liveControls} />
            </div>
          </div>
          <div className="zap-collections">
            <MediaCoverRow
              headingLabel={t("scan.favoritesHeading")}
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
        returnOwner="home-covers"
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
        historyError={history.isError}
        onRetryHistory={history.refetch}
      />
      {purchaseModal}
      <StopConfirmModal
        isOpen={stopping !== null}
        onClose={() => stopping?.cancelStop()}
        onConfirm={() => stopping?.confirmStop()}
        description={
          background.stopPending ? t("stopBackgroundMedia") : undefined
        }
      />
    </>
  );
}
