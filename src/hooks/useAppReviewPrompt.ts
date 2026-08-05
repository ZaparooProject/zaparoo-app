import { useEffect, useRef } from "react";
import { AppReview } from "@capawesome/capacitor-app-review";
import {
  APP_REVIEW_SETTLE_DELAY_MS,
  isAppReviewEligible,
} from "@/lib/appReview";
import { isNativePluginAvailable } from "@/lib/capacitorBridge";
import { logger } from "@/lib/logger";
import type { PlayingResponse } from "@/lib/models";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useStatusStore } from "@/lib/store";

function getPrimaryMediaIdentity(playing: PlayingResponse): string | null {
  if (!playing.mediaName) return null;

  return `${playing.systemId}\u0000${playing.mediaPath || playing.mediaName}`;
}

function isReviewPromptBlocked(): boolean {
  const status = useStatusStore.getState();

  return (
    !status.connected ||
    status.cameraOpen ||
    status.writeOpen ||
    status.proPurchaseModalOpen ||
    status.inboxModalOpen ||
    status.stagedToken !== null
  );
}

export function useAppReviewPrompt(): void {
  const hasHydrated = usePreferencesStore((state) => state._hasHydrated);
  const playing = useStatusStore((state) => state.playing);
  const previousMediaIdentityRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!hasHydrated) return;

    const mediaIdentity = getPrimaryMediaIdentity(playing);
    if (mediaIdentity === previousMediaIdentityRef.current) return;

    previousMediaIdentityRef.current = mediaIdentity;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (mediaIdentity === null) return;

    const now = Date.now();
    const preferences = usePreferencesStore.getState();
    preferences.recordAppReviewSuccessfulLaunch(now);

    if (
      !isAppReviewEligible(usePreferencesStore.getState().appReviewCadence, now)
    ) {
      return;
    }

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;

      const requestTimestamp = Date.now();
      const latestPreferences = usePreferencesStore.getState();
      const latestPlaying = useStatusStore.getState().playing;

      if (
        getPrimaryMediaIdentity(latestPlaying) !== mediaIdentity ||
        !isAppReviewEligible(
          latestPreferences.appReviewCadence,
          requestTimestamp,
        ) ||
        document.visibilityState !== "visible" ||
        isReviewPromptBlocked() ||
        !isNativePluginAvailable("AppReview")
      ) {
        return;
      }

      latestPreferences.recordAppReviewAttempt(requestTimestamp);
      void AppReview.requestReview().catch((error: unknown) => {
        logger.error("App review request failed", error, {
          category: "general",
          action: "requestAppReview",
          severity: "warning",
        });
      });
    }, APP_REVIEW_SETTLE_DELAY_MS);
  }, [hasHydrated, playing]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );
}
