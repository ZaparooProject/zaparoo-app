import { useCallback, useSyncExternalStore } from "react";
import { useRouter } from "@tanstack/react-router";
import { useLibrarySessionStore } from "@/lib/librarySessionStore";

declare module "@tanstack/history" {
  interface HistoryState {
    appMetadataOrigin?: string;
  }
}

/** Read the current entry without replacing it or disturbing its scroll key. */
export function useMetadataHistoryKey(): string {
  const router = useRouter({ warn: false });
  const subscribe = useCallback(
    (changed: () => void) =>
      router?.history?.subscribe(() => changed()) ?? (() => {}),
    [router],
  );
  const snapshot = useCallback(
    () => router?.history?.location.state.__TSR_key ?? "",
    [router],
  );
  return useSyncExternalStore(subscribe, snapshot, () => "");
}

export function useMetadataDetailsReturn(owner: string, deviceKey: string) {
  const historyKey = useMetadataHistoryKey();
  const entry = useLibrarySessionStore((state) => {
    const saved = state.metadataReturns[historyKey];
    return state.deviceAddress === deviceKey && saved?.owner === owner
      ? saved.entry
      : null;
  });
  const forget = useCallback(() => {
    const state = useLibrarySessionStore.getState();
    if (state.deviceAddress === deviceKey)
      state.forgetMetadataReturn(historyKey, owner);
  }, [deviceKey, historyKey, owner]);
  return { entry, forget };
}
