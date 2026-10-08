import { useCallback, useSyncExternalStore } from "react";

/** Subscribe to CSS space changes without remounting feature owners. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const media = window.matchMedia(query);
      if (typeof media.addEventListener === "function") {
        media.addEventListener("change", notify);
        return () => media.removeEventListener("change", notify);
      }
      // Core's supported legacy WebKit uses the original MediaQueryList API.
      media.addListener(notify);
      return () => media.removeListener(notify);
    },
    [query],
  );
  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
