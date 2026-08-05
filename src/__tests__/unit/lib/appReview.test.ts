import { describe, expect, it } from "vitest";
import {
  APP_REVIEW_COOLDOWN_MS,
  DEFAULT_APP_REVIEW_CADENCE,
  isAppReviewEligible,
  recordAppReviewAttempt,
  recordSuccessfulAppReviewLaunch,
  type AppReviewCadenceState,
} from "@/lib/appReview";

const DAY_MS = 24 * 60 * 60 * 1000;
const JANUARY_1 = new Date(2026, 0, 1, 12).getTime();

function eligibleCadence(
  overrides: Partial<AppReviewCadenceState> = {},
): AppReviewCadenceState {
  return {
    successfulLaunchCount: 5,
    distinctSuccessfulDayCount: 3,
    lastSuccessfulDay: "2026-01-03",
    lastAttemptAt: null,
    ...overrides,
  };
}

describe("app review cadence", () => {
  it("should count launches while counting each active day once", () => {
    const firstLaunch = recordSuccessfulAppReviewLaunch(
      DEFAULT_APP_REVIEW_CADENCE,
      JANUARY_1,
    );
    const secondLaunch = recordSuccessfulAppReviewLaunch(
      firstLaunch,
      JANUARY_1 + 60_000,
    );
    const nextDayLaunch = recordSuccessfulAppReviewLaunch(
      secondLaunch,
      JANUARY_1 + DAY_MS,
    );

    expect(nextDayLaunch).toMatchObject({
      successfulLaunchCount: 3,
      distinctSuccessfulDayCount: 2,
      lastSuccessfulDay: "2026-01-02",
    });
  });

  it.each([
    { successfulLaunchCount: 4, distinctSuccessfulDayCount: 3 },
    { successfulLaunchCount: 5, distinctSuccessfulDayCount: 2 },
  ])("should reject cadence below either threshold", (cadence) => {
    expect(isAppReviewEligible(eligibleCadence(cadence), JANUARY_1)).toBe(
      false,
    );
  });

  it("should allow first request at launch and active-day thresholds", () => {
    expect(isAppReviewEligible(eligibleCadence(), JANUARY_1)).toBe(true);
  });

  it("should enforce cooldown until its exact boundary", () => {
    const cadence = eligibleCadence({ lastAttemptAt: JANUARY_1 });

    expect(
      isAppReviewEligible(cadence, JANUARY_1 + APP_REVIEW_COOLDOWN_MS - 1),
    ).toBe(false);
    expect(
      isAppReviewEligible(cadence, JANUARY_1 + APP_REVIEW_COOLDOWN_MS),
    ).toBe(true);
  });

  it("should not count an earlier calendar day after device clock rollback", () => {
    const cadence = recordSuccessfulAppReviewLaunch(
      {
        ...DEFAULT_APP_REVIEW_CADENCE,
        distinctSuccessfulDayCount: 1,
        lastSuccessfulDay: "2026-01-02",
      },
      JANUARY_1,
    );

    expect(cadence).toMatchObject({
      successfulLaunchCount: 1,
      distinctSuccessfulDayCount: 1,
      lastSuccessfulDay: "2026-01-02",
    });
  });

  it("should not bypass cooldown when device clock moves backward", () => {
    expect(
      isAppReviewEligible(
        eligibleCadence({ lastAttemptAt: JANUARY_1 }),
        JANUARY_1 - 1,
      ),
    ).toBe(false);
  });

  it("should reset activity counters after a request attempt", () => {
    expect(recordAppReviewAttempt(JANUARY_1)).toEqual({
      successfulLaunchCount: 0,
      distinctSuccessfulDayCount: 0,
      lastSuccessfulDay: null,
      lastAttemptAt: JANUARY_1,
    });
  });
});
