import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@/test-utils";
import { useTrialAccessExpiry } from "@/hooks/useTrialAccessExpiry";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useStatusStore } from "@/lib/store";

describe("trial-derived Pro expiry", () => {
  it.each([false, true])(
    "expires temporary access without removing lifetime=%s",
    async (lifetime) => {
      vi.useFakeTimers();
      const user = { uid: "trial-user" } as NonNullable<
        ReturnType<typeof useStatusStore.getState>["loggedInUser"]
      >;
      useStatusStore.setState({ loggedInUser: user });
      usePreferencesStore.setState({
        lifetimeProAccess: lifetime,
        storeVerifiedProAccess: false,
        launcherAccess: false,
        onlinePremiumAccess: false,
      });
      usePreferencesStore.getState().setOnlinePremiumAccess(true, {
        userID: user.uid,
        expiresAt: new Date(Date.now() + 1000).toISOString(),
      });
      const { unmount } = renderHook(() => useTrialAccessExpiry());
      expect(usePreferencesStore.getState().launcherAccess).toBe(true);
      await act(async () => vi.advanceTimersByTimeAsync(1001));
      expect(usePreferencesStore.getState().onlinePremiumAccess).toBe(false);
      expect(usePreferencesStore.getState().launcherAccess).toBe(lifetime);
      unmount();
      vi.useRealTimers();
    },
  );
  it("clears previous account trial without retaining an unknown lifetime fallback", () => {
    usePreferencesStore.setState({
      lifetimeProAccess: null,
      storeVerifiedProAccess: false,
      launcherAccess: false,
      onlinePremiumAccess: false,
    });
    usePreferencesStore.getState().setOnlinePremiumAccess(true, {
      userID: "old-user",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    usePreferencesStore.getState().beginOnlinePremiumAccessCheck();
    expect(usePreferencesStore.getState().launcherAccess).toBe(false);
    expect(usePreferencesStore.getState().onlineTrialUserID).toBeNull();
  });
});
