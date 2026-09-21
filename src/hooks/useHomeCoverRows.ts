import { useQuery } from "@tanstack/react-query";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { CoreAPI } from "@/lib/coreApi";
import { satisfies as versionSatisfies } from "@/lib/coreVersion";
import {
  FAVORITE_TAG_FILTER,
  LIBRARY_QUERY_KEYS,
  searchResultToBrowseEntry,
} from "@/lib/libraryMedia";
import {
  MEDIA_HISTORY_QUERY_KEYS,
  dedupeHistoryByMedia,
  historyEntryToBrowseEntry,
  historyPageLimit,
} from "@/lib/mediaHistory";
import { useStatusStore } from "@/lib/store";
import type { MediaBrowseEntry } from "@/lib/models";

/** Enough to be useful in one swipe without turning home into a browser. */
const ROW_SIZE = 12;

export function useRecentlyPlayed(): MediaBrowseEntry[] {
  const connected = useStatusStore((state) => state.connected);
  const deviceKey = useActiveDeviceKey();
  const recentsFeature = useCoreFeature("mediaRecents", {
    requireKnownSupport: true,
  });
  // Not a feature gate: this only widens the page we request, it never hides
  // UI, so it would just add noise to the outdated-Core notice.
  const coreVersion = useStatusStore((state) => state.coreVersion);
  const coreDedupes =
    coreVersion !== null && versionSatisfies(coreVersion, "2.17.0");

  const query = useQuery({
    queryKey: [MEDIA_HISTORY_QUERY_KEYS.history, deviceKey, "recents"],
    queryFn: ({ signal }) =>
      CoreAPI.mediaHistory(
        {
          limit: historyPageLimit(ROW_SIZE, coreDedupes),
          distinctMedia: true,
        },
        signal,
      ),
    enabled: connected && recentsFeature.available && deviceKey !== "",
    staleTime: 30_000,
  });

  // Always collapse locally: Core ignores distinctMedia before 2.17, so the
  // same game can repeat across sessions.
  return dedupeHistoryByMedia(query.data?.entries ?? [], ROW_SIZE).map(
    historyEntryToBrowseEntry,
  );
}

export function useFavourites(): MediaBrowseEntry[] {
  const connected = useStatusStore((state) => state.connected);
  const deviceKey = useActiveDeviceKey();
  const libraryFeature = useCoreFeature("mediaLibrary");
  const favoritesFeature = useCoreFeature("mediaFavorites");

  const query = useQuery({
    queryKey: [LIBRARY_QUERY_KEYS.favorites, deviceKey, "home"],
    queryFn: ({ signal }) =>
      CoreAPI.mediaSearch(
        {
          query: "",
          systems: [],
          tags: [FAVORITE_TAG_FILTER],
          maxResults: ROW_SIZE,
        },
        signal,
      ),
    enabled:
      connected &&
      libraryFeature.available &&
      favoritesFeature.available &&
      deviceKey !== "",
    staleTime: 30_000,
  });

  return (query.data?.results ?? []).map(searchResultToBrowseEntry);
}
