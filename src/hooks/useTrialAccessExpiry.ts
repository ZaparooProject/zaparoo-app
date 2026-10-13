import { useEffect } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useStatusStore } from "@/lib/store";

// Bound session-only trial Pro even when provider refresh is unavailable.
export function useTrialAccessExpiry() {
  const expiry = usePreferencesStore((state) => state.onlineTrialExpiresAt);
  const owner = usePreferencesStore((state) => state.onlineTrialUserID);
  const uid = useStatusStore((state) => state.loggedInUser?.uid);
  useEffect(() => {
    if (!expiry) return;
    let disposed = false;
    const check = () => {
      if (disposed) return;
      const state = usePreferencesStore.getState();
      if (
        state.onlineTrialExpiresAt !== expiry ||
        state.onlineTrialUserID !== owner
      )
        return;
      if (
        owner !== useStatusStore.getState().loggedInUser?.uid ||
        !Number.isFinite(Date.parse(expiry)) ||
        Date.now() >= Date.parse(expiry)
      )
        state.clearOnlinePremiumAccess();
    };
    check();
    const timer = window.setTimeout(
      check,
      Math.max(0, Math.min(Date.parse(expiry) - Date.now(), 2_147_483_647)),
    );
    const listener = Promise.resolve(
      CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) check();
      }),
    ).catch(() => null);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      void listener.then((handle) => handle?.remove()).catch(() => undefined);
    };
  }, [expiry, owner, uid]);
}
