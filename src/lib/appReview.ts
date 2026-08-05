export const APP_REVIEW_REQUIRED_LAUNCHES = 5;
export const APP_REVIEW_REQUIRED_ACTIVE_DAYS = 3;
export const APP_REVIEW_COOLDOWN_MS = 180 * 24 * 60 * 60 * 1000;
export const APP_REVIEW_SETTLE_DELAY_MS = 5_000;

export interface AppReviewCadenceState {
  successfulLaunchCount: number;
  distinctSuccessfulDayCount: number;
  lastSuccessfulDay: string | null;
  lastAttemptAt: number | null;
}

export const DEFAULT_APP_REVIEW_CADENCE: AppReviewCadenceState = {
  successfulLaunchCount: 0,
  distinctSuccessfulDayCount: 0,
  lastSuccessfulDay: null,
  lastAttemptAt: null,
};

function toLocalDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function recordSuccessfulAppReviewLaunch(
  state: AppReviewCadenceState,
  timestamp: number,
): AppReviewCadenceState {
  const successfulDay = toLocalDayKey(timestamp);
  const isNewSuccessfulDay =
    state.lastSuccessfulDay === null || successfulDay > state.lastSuccessfulDay;

  return {
    ...state,
    successfulLaunchCount: state.successfulLaunchCount + 1,
    distinctSuccessfulDayCount:
      state.distinctSuccessfulDayCount + (isNewSuccessfulDay ? 1 : 0),
    lastSuccessfulDay: isNewSuccessfulDay
      ? successfulDay
      : state.lastSuccessfulDay,
  };
}

export function recordAppReviewAttempt(
  timestamp: number,
): AppReviewCadenceState {
  return {
    successfulLaunchCount: 0,
    distinctSuccessfulDayCount: 0,
    lastSuccessfulDay: null,
    lastAttemptAt: timestamp,
  };
}

export function isAppReviewEligible(
  state: AppReviewCadenceState,
  timestamp: number,
): boolean {
  if (
    state.successfulLaunchCount < APP_REVIEW_REQUIRED_LAUNCHES ||
    state.distinctSuccessfulDayCount < APP_REVIEW_REQUIRED_ACTIVE_DAYS
  ) {
    return false;
  }

  if (state.lastAttemptAt === null) return true;

  const elapsedSinceAttempt = timestamp - state.lastAttemptAt;
  return (
    elapsedSinceAttempt >= 0 && elapsedSinceAttempt >= APP_REVIEW_COOLDOWN_MS
  );
}
