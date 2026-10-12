import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useLiveCoreControls,
  type LiveCoreTarget,
} from "@/hooks/useLiveCoreControls";
import { CoreAPI } from "@/lib/coreApi";
import { entrySystemId, resolveLibraryLaunchText } from "@/lib/libraryMedia";
import { logger } from "@/lib/logger";
import type {
  MediaBrowseEntry,
  MediaControlAction,
  MediaSlot,
} from "@/lib/models";
import { useStatusStore } from "@/lib/store";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";

type PlaylistCommand = "previous" | "pause" | "play" | "next";

interface NowPlayingControlsOptions {
  /** Stops ordinary (non-playlist) media in this slot. */
  stopMedia?: () => void;
  /** Most recent media, offered for replay while the slot is idle. */
  lastPlayed?: MediaBrowseEntry | null;
}

function slotMedia(slot: MediaSlot) {
  const state = useStatusStore.getState();
  return slot === "primary" ? state.playing : state.backgroundPlaying;
}

/**
 * Transport commands for one media slot. A playlist is driven with playlist
 * ZapScript; anything else goes through the launcher's own media controls.
 * Every command belongs to the live session it was issued in, so a device
 * change or reconnect drops its result instead of reporting it.
 */
export function useNowPlayingControls(
  slot: MediaSlot,
  { stopMedia, lastPlayed = null }: NowPlayingControlsOptions = {},
) {
  const { t } = useTranslation();
  const setPlaylist = useStatusStore((state) => state.setPlaylist);
  const [stopPending, setStopPending] = useState(false);
  const [replayingLast, setReplayingLast] = useState(false);
  const stopSessionRef = useRef<LiveCoreTarget | null>(null);
  const replayControllerRef = useRef<AbortController | null>(null);
  const controls = useLiveCoreControls(() => {
    replayControllerRef.current?.abort();
    replayControllerRef.current = null;
    setReplayingLast(false);
    stopSessionRef.current = null;
    setStopPending(false);
  });

  useEffect(
    () => () => {
      replayControllerRef.current?.abort();
      replayControllerRef.current = null;
    },
    [],
  );

  const reportFailure = (
    target: LiveCoreTarget,
    action: string,
    messageKey: string,
  ) => {
    return (error: unknown) => {
      if (!controls.isCurrentTarget(target)) return;
      logger.error(`Now playing control failed: ${action}`, error, {
        category: "api",
        action,
        severity: "error",
      });
      showRateLimitedErrorToast(t(messageKey));
    };
  };

  const runPlaylistCommand = (
    target: LiveCoreTarget,
    command: PlaylistCommand,
  ) => {
    const playlistID = useStatusStore.getState().playlists[slot]?.id;
    const playing =
      command === "play" ? true : command === "pause" ? false : null;

    void CoreAPI.run({ text: `**playlist.${command}?slot=${slot}` })
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
      .catch(
        reportFailure(
          target,
          "runPlaylistControl",
          "scan.playlistControlError",
        ),
      );
  };

  const runMediaControl = (
    target: LiveCoreTarget,
    action: MediaControlAction,
  ) => {
    void CoreAPI.mediaControl(
      slot === "background" ? { action, slot } : { action },
    ).catch(reportFailure(target, "mediaControl", "scan.mediaControlError"));
  };

  const step = (command: "previous" | "next") => {
    const target = controls.captureTarget();
    if (!target) return;
    if (useStatusStore.getState().playlists[slot]) {
      runPlaylistCommand(target, command);
    } else {
      runMediaControl(target, command);
    }
  };

  const toggle = () => {
    const target = controls.captureTarget();
    if (!target) return;
    const playlist = useStatusStore.getState().playlists[slot];
    if (playlist) {
      runPlaylistCommand(target, playlist.playing ? "pause" : "play");
      return;
    }
    const media = slotMedia(slot);
    if (media.launcherControls?.includes("toggle_pause")) {
      runMediaControl(target, "toggle_pause");
    } else {
      runMediaControl(
        target,
        media.playbackState === "paused" ? "resume" : "pause",
      );
    }
  };

  const selectItem = (index: number) => {
    const target = controls.captureTarget();
    if (!target) return;
    const playlistID = useStatusStore.getState().playlists[slot]?.id;

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
      .catch(
        reportFailure(
          target,
          "selectPlaylistItem",
          "scan.playlistControlError",
        ),
      );
  };

  const requestStop = () => {
    const session = controls.captureTarget();
    if (!session) return;
    stopSessionRef.current = session;
    setStopPending(true);
  };

  const cancelStop = () => {
    stopSessionRef.current = null;
    setStopPending(false);
  };

  const confirmStop = () => {
    const session = stopSessionRef.current;
    stopSessionRef.current = null;
    setStopPending(false);
    if (!session || !controls.isCurrentTarget(session)) return;

    if (useStatusStore.getState().playlists[slot]) {
      void CoreAPI.run({ text: `**playlist.stop?slot=${slot}` }).catch(
        reportFailure(
          session,
          "runPlaylistControl",
          "scan.playlistControlError",
        ),
      );
      return;
    }
    if (stopMedia) {
      stopMedia();
      return;
    }
    void CoreAPI.mediaControl({ action: "stop", slot }).catch(
      reportFailure(session, "mediaControl", "scan.stopBackgroundMediaError"),
    );
  };

  const replayLast = async () => {
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
      if (controller.signal.aborted) return;
      reportFailure(
        target,
        "replayLastPlayed",
        "scan.playLastPlayedError",
      )(error);
    } finally {
      if (replayControllerRef.current === controller) {
        replayControllerRef.current = null;
        setReplayingLast(false);
      }
    }
  };

  return {
    /** Commands can reach a live Core session right now. */
    available: controls.available,
    stopPending,
    replayingLast,
    requestStop,
    cancelStop,
    confirmStop,
    previous: () => step("previous"),
    next: () => step("next"),
    toggle,
    selectItem,
    replayLast: () => void replayLast(),
  };
}
