import { useMemo } from "react";
import { decideRoute } from "@/lib/localPlayback/route";
import { localPlatform } from "@/lib/localPlayback/player";
import { useLocalPlaybackStore } from "@/lib/localPlayback/store";
import { usePreferencesStore } from "@/lib/preferencesStore";

/**
 * Whether running this script now would stay in the app instead of going to
 * Core, so controls can stay enabled without a connected device.
 */
export function useRunsLocally(text: string): boolean {
  const playOn = usePreferencesStore((state) => state.playOn);
  const catalog = useLocalPlaybackStore((state) => state.catalog);
  return useMemo(() => {
    if (text.trim() === "") return false;
    const decision = decideRoute(text, {
      playOn,
      catalog,
      platform: localPlatform(),
    });
    return decision.kind !== "device";
  }, [text, playOn, catalog]);
}
