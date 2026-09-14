import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@capacitor/app";
import { Preferences } from "@capacitor/preferences";
import { act, renderHook } from "@/test-utils";
import { usePreferenceHydrationRecovery } from "@/hooks/usePreferenceHydrationRecovery";
import {
  __resetPreferenceHydrationForTests,
  usePreferencesStore,
} from "@/lib/preferencesStore";

vi.mock("@/lib/capacitorBridge", () => ({
  isCapacitorPluginUnavailableError: vi.fn(() => false),
  isNativePluginAvailable: vi.fn(() => true),
  isPluginAvailable: vi.fn(() => true),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

async function degradePreferences(): Promise<void> {
  vi.mocked(Preferences.get).mockRejectedValue(
    new Error("Preferences bridge failed"),
  );
  usePreferencesStore.setState({ _hasHydrated: false, showFilenames: false });
  void usePreferencesStore.persist.rehydrate();
  await vi.advanceTimersByTimeAsync(500);
}

describe("usePreferenceHydrationRecovery", () => {
  let resumeHandler: (() => void) | undefined;
  const removeListener = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.useFakeTimers();
    resumeHandler = undefined;
    removeListener.mockClear();
    vi.mocked(App.addListener).mockImplementation((eventName, callback) => {
      if ((eventName as string) === "resume") {
        resumeHandler = () => callback({ canGoBack: false });
      }
      return Promise.resolve({ remove: removeListener }) as never;
    });
    __resetPreferenceHydrationForTests();
  });

  afterEach(() => {
    vi.mocked(Preferences.get).mockReset();
    vi.mocked(App.addListener).mockReset();
  });

  it("should reload saved preferences when the app resumes while degraded", async () => {
    await degradePreferences();
    expect(usePreferencesStore.getState()._hasHydrated).toBe(true);
    expect(usePreferencesStore.getState()._preferencesHydrationSucceeded).toBe(
      false,
    );

    const { unmount } = renderHook(() => usePreferenceHydrationRecovery());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(App.addListener).toHaveBeenCalledWith(
      "resume",
      expect.any(Function),
    );

    vi.mocked(Preferences.get).mockResolvedValue({
      value: JSON.stringify({ state: { showFilenames: true }, version: 0 }),
    });
    await act(async () => {
      resumeHandler?.();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(usePreferencesStore.getState()._preferencesHydrationSucceeded).toBe(
      true,
    );
    expect(usePreferencesStore.getState().showFilenames).toBe(true);
    expect(removeListener).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("should not listen for resume when preferences loaded normally", async () => {
    vi.mocked(Preferences.get).mockResolvedValue({ value: null });
    await usePreferencesStore.persist.rehydrate();

    renderHook(() => usePreferenceHydrationRecovery());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(App.addListener).not.toHaveBeenCalled();
  });
});
