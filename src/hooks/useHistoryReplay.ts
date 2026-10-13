import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLiveCoreControls } from "@/hooks/useLiveCoreControls";
import { CoreAPI, logRunFailure } from "@/lib/coreApi";
import type { HistoryResponseEntry, MediaHistoryEntry } from "@/lib/models";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";

/**
 * Replays scan and play history for the History sheet and both history pages.
 * A replay needs a live Core session, only one runs at a time, and a failure
 * that lands after the device changed is dropped rather than reported.
 */
export function useHistoryReplay() {
  const { t } = useTranslation();
  // A ref, not state: a second tap must be rejected before React re-renders.
  const requestRef = useRef<symbol | null>(null);
  const controls = useLiveCoreControls(() => {
    requestRef.current = null;
  });

  const replay = (
    params: Parameters<typeof CoreAPI.run>[0],
    action: string,
    errorKey: string,
  ) => {
    const target = controls.captureTarget();
    if (!target || requestRef.current) return;
    const request = Symbol(action);
    requestRef.current = request;
    void CoreAPI.run(params)
      .catch((error) => {
        if (!controls.isCurrentTarget(target)) return;
        logRunFailure("Failed to replay history", error, { action });
        showRateLimitedErrorToast(t(errorKey));
      })
      .finally(() => {
        if (requestRef.current === request) requestRef.current = null;
      });
  };

  return {
    /** A replay can reach a live Core session right now. */
    available: controls.available,
    replayScan: (item: HistoryResponseEntry) =>
      replay(
        { type: item.type, uid: item.uid, text: item.text, data: item.data },
        "replayScan",
        "scan.historyReplayError",
      ),
    // Core reports the launch form of an indexed item; the stored path is the
    // fallback, and is only plain launch text when it needs no quoting.
    launchMedia: (entry: MediaHistoryEntry) =>
      replay(
        { text: entry.zapScript || entry.mediaPath },
        "replayPlayedMedia",
        "scan.coverRowLaunchError",
      ),
  };
}
