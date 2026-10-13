import { useQuery } from "@tanstack/react-query";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { CoreAPI } from "@/lib/coreApi";
import { LIBRARY_QUERY_KEYS } from "@/lib/libraryMedia";
import { useStatusStore } from "@/lib/store";
import type { Deck } from "@/lib/models";

/** The connected device's decks, for choosing one to show on the Zap page. */
export function useZapDecks(): { available: boolean; decks: Deck[] } {
  const connected = useStatusStore((state) => state.connected);
  const deviceKey = useActiveDeviceKey();
  const feature = useCoreFeature("decks", { requireKnownSupport: true });
  const query = useQuery({
    queryKey: [LIBRARY_QUERY_KEYS.decks, deviceKey],
    queryFn: ({ signal }) => CoreAPI.decks(signal),
    enabled: connected && Boolean(deviceKey) && feature.available,
    staleTime: 30_000,
  });
  return { available: feature.available, decks: query.data?.decks ?? [] };
}
