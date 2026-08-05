import { act, renderHook } from "@/test-utils";
import { AppReview } from "@capawesome/capacitor-app-review";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_REVIEW_SETTLE_DELAY_MS,
  DEFAULT_APP_REVIEW_CADENCE,
} from "@/lib/appReview";
import { isNativePluginAvailable } from "@/lib/capacitorBridge";
import { logger } from "@/lib/logger";
import type { PlayingResponse } from "@/lib/models";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { emptyPlaying, useStatusStore } from "@/lib/store";
import { useAppReviewPrompt } from "@/hooks/useAppReviewPrompt";

vi.mock("@/lib/capacitorBridge", () => ({
  isCapacitorPluginUnavailableError: vi.fn(() => false),
  isNativePluginAvailable: vi.fn(() => true),
  isPluginAvailable: vi.fn(() => true),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
}));

const NOW = new Date(2026, 0, 3, 12).getTime();

function playing(
  mediaName: string,
  mediaPath = `/media/${mediaName}.zip`,
): PlayingResponse {
  return {
    systemId: "SNES",
    systemName: "Super Nintendo",
    mediaName,
    mediaPath,
  };
}

function makeNextLaunchEligible(): void {
  usePreferencesStore.setState({
    appReviewCadence: {
      successfulLaunchCount: 4,
      distinctSuccessfulDayCount: 2,
      lastSuccessfulDay: "2026-01-02",
      lastAttemptAt: null,
    },
  });
}

async function advanceToPrompt(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(APP_REVIEW_SETTLE_DELAY_MS);
  });
}

describe("useAppReviewPrompt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    vi.mocked(isNativePluginAvailable).mockReturnValue(true);
    vi.mocked(AppReview.requestReview).mockReset().mockResolvedValue(undefined);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    usePreferencesStore.setState({
      _hasHydrated: true,
      appReviewCadence: { ...DEFAULT_APP_REVIEW_CADENCE },
    });
    useStatusStore.setState({
      connected: true,
      playing: emptyPlaying(),
      cameraOpen: false,
      writeOpen: false,
      proPurchaseModalOpen: false,
      inboxModalOpen: false,
      stagedToken: null,
    });
  });

  it("should count only new non-empty primary media", () => {
    const { rerender } = renderHook(() => useAppReviewPrompt());

    act(() => {
      useStatusStore.setState({ playing: playing("Chrono Trigger") });
    });
    rerender();
    act(() => {
      useStatusStore.setState({ playing: playing("Chrono Trigger") });
    });
    rerender();
    act(() => {
      useStatusStore.setState({ playing: emptyPlaying() });
    });
    rerender();

    expect(
      usePreferencesStore.getState().appReviewCadence.successfulLaunchCount,
    ).toBe(1);
  });

  it("should persist attempt before requesting one native review", async () => {
    makeNextLaunchEligible();
    vi.mocked(AppReview.requestReview).mockImplementationOnce(async () => {
      expect(usePreferencesStore.getState().appReviewCadence).toEqual({
        successfulLaunchCount: 0,
        distinctSuccessfulDayCount: 0,
        lastSuccessfulDay: null,
        lastAttemptAt: NOW + APP_REVIEW_SETTLE_DELAY_MS,
      });
    });
    renderHook(() => useAppReviewPrompt());

    act(() => {
      useStatusStore.setState({ playing: playing("Chrono Trigger") });
    });
    await advanceToPrompt();
    act(() => {
      useStatusStore.setState({ playing: playing("Chrono Trigger") });
    });
    await advanceToPrompt();

    expect(AppReview.requestReview).toHaveBeenCalledTimes(1);
  });

  it("should skip when native plugin is unavailable", async () => {
    makeNextLaunchEligible();
    vi.mocked(isNativePluginAvailable).mockReturnValue(false);
    renderHook(() => useAppReviewPrompt());

    act(() => {
      useStatusStore.setState({ playing: playing("Chrono Trigger") });
    });
    await advanceToPrompt();

    expect(AppReview.requestReview).not.toHaveBeenCalled();
    expect(
      usePreferencesStore.getState().appReviewCadence.lastAttemptAt,
    ).toBeNull();
  });

  it("should skip while app is backgrounded", async () => {
    makeNextLaunchEligible();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    renderHook(() => useAppReviewPrompt());

    act(() => {
      useStatusStore.setState({ playing: playing("Chrono Trigger") });
    });
    await advanceToPrompt();

    expect(AppReview.requestReview).not.toHaveBeenCalled();
    expect(
      usePreferencesStore.getState().appReviewCadence.lastAttemptAt,
    ).toBeNull();
  });

  it.each([
    ["disconnected", () => useStatusStore.setState({ connected: false })],
    ["camera", () => useStatusStore.setState({ cameraOpen: true })],
    ["write", () => useStatusStore.setState({ writeOpen: true })],
    [
      "Pro purchase",
      () => useStatusStore.setState({ proPurchaseModalOpen: true }),
    ],
    ["inbox", () => useStatusStore.setState({ inboxModalOpen: true })],
    [
      "staged token",
      () =>
        useStatusStore.setState({
          stagedToken: {
            token: {
              type: "nfc",
              uid: "1234",
              text: "**launch.system:SNES",
              data: "",
              scanTime: "2026-01-03T12:00:00Z",
            },
            ready: true,
          },
        }),
    ],
  ])("should skip while %s state blocks interruption", async (_, block) => {
    makeNextLaunchEligible();
    block();
    renderHook(() => useAppReviewPrompt());

    act(() => {
      useStatusStore.setState({ playing: playing("Chrono Trigger") });
    });
    await advanceToPrompt();

    expect(AppReview.requestReview).not.toHaveBeenCalled();
    expect(
      usePreferencesStore.getState().appReviewCadence.lastAttemptAt,
    ).toBeNull();
  });

  it("should wait for a later successful launch after a blocked opportunity", async () => {
    makeNextLaunchEligible();
    useStatusStore.setState({ connected: false });
    renderHook(() => useAppReviewPrompt());

    act(() => {
      useStatusStore.setState({ playing: playing("Chrono Trigger") });
    });
    await advanceToPrompt();
    expect(AppReview.requestReview).not.toHaveBeenCalled();

    act(() => {
      useStatusStore.setState({ playing: emptyPlaying(), connected: true });
    });
    act(() => {
      useStatusStore.setState({ playing: playing("EarthBound") });
    });
    await advanceToPrompt();

    expect(AppReview.requestReview).toHaveBeenCalledTimes(1);
  });

  it("should cancel a pending prompt when primary media stops", async () => {
    makeNextLaunchEligible();
    renderHook(() => useAppReviewPrompt());

    act(() => {
      useStatusStore.setState({ playing: playing("Chrono Trigger") });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(APP_REVIEW_SETTLE_DELAY_MS - 1);
    });
    act(() => {
      useStatusStore.setState({ playing: emptyPlaying() });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(AppReview.requestReview).not.toHaveBeenCalled();
  });

  it("should log rejection without retrying or restoring counters", async () => {
    const error = new Error("StoreKit unavailable");
    makeNextLaunchEligible();
    vi.mocked(AppReview.requestReview).mockRejectedValueOnce(error);
    renderHook(() => useAppReviewPrompt());

    act(() => {
      useStatusStore.setState({ playing: playing("Chrono Trigger") });
    });
    await advanceToPrompt();

    expect(AppReview.requestReview).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "App review request failed",
      error,
      {
        category: "general",
        action: "requestAppReview",
        severity: "warning",
      },
    );
    expect(
      usePreferencesStore.getState().appReviewCadence.successfulLaunchCount,
    ).toBe(0);
  });
});
