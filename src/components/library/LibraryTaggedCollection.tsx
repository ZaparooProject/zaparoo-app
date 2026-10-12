import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { CoreAPI } from "@/lib/coreApi";
import {
  MEDIA_PREFERENCES,
  LIBRARY_QUERY_KEYS,
  searchResultToBrowseEntry,
} from "@/lib/libraryMedia";
import {
  librarySearchScrollKey,
  useLibrarySessionStore,
} from "@/lib/librarySessionStore";
import { useTabSessionStore } from "@/lib/tabSessionStore";
import { useStatusStore } from "@/lib/store";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { useLibraryMediaSelection } from "@/hooks/useLibraryMediaSelection";
import { LibraryCollectionPage } from "@/components/library/LibraryCollectionPage";

const PAGE_SIZE = 100;

const COLLECTIONS = {
  favorites: {
    tag: MEDIA_PREFERENCES.favorite,
    feature: "mediaFavorites",
    title: "library.favorites",
    search: "library.searchFavorites",
    list: "library.favoritesList",
    loading: "library.loadingFavorites",
    error: "library.favoritesError",
    empty: "library.noFavorites",
    hint: "library.noFavoritesHint",
  },
  liked: {
    tag: MEDIA_PREFERENCES.liked,
    feature: "mediaPreferences",
    title: "library.liked",
    search: "library.searchLiked",
    list: "library.likedList",
    loading: "library.loadingLiked",
    error: "library.likedError",
    empty: "library.noLiked",
    hint: "library.noLikedHint",
  },
  disliked: {
    tag: MEDIA_PREFERENCES.disliked,
    feature: "mediaPreferences",
    title: "library.disliked",
    search: "library.searchDisliked",
    list: "library.dislikedList",
    loading: "library.loadingDisliked",
    error: "library.dislikedError",
    empty: "library.noDisliked",
    hint: "library.noDislikedHint",
  },
  "play-later": {
    tag: MEDIA_PREFERENCES.playlater,
    feature: "mediaPreferences",
    title: "library.playLater",
    search: "library.searchPlayLater",
    list: "library.playLaterList",
    loading: "library.loadingPlayLater",
    error: "library.playLaterError",
    empty: "library.noPlayLater",
    hint: "library.noPlayLaterHint",
  },
} as const;

export type LibraryCollection = keyof typeof COLLECTIONS;

export function LibraryTaggedCollection({
  collection,
}: {
  collection: LibraryCollection;
}) {
  const config = COLLECTIONS[collection];
  const scope = collection;
  const { t } = useTranslation();
  const connected = useStatusStore((state) => state.connected);
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const deviceKey = useActiveDeviceKey();
  const searchOpen = useLibrarySessionStore(
    (state) =>
      state.deviceAddress === deviceKey &&
      state.embeddedSearchOpen[scope] === true,
  );
  const setEmbeddedSearchOpen = useLibrarySessionStore(
    (state) => state.setEmbeddedSearchOpen,
  );
  const forgetScroll = useTabSessionStore((state) => state.forgetScroll);
  const selection = useLibraryMediaSelection(
    searchOpen ? `search:${scope}` : `collection:${scope}`,
    deviceKey,
  );
  const libraryFeature = useCoreFeature("mediaLibrary");
  // Same strictness as the Library entry points, so a collection reachable
  // from Library never opens on "Update Core".
  const collectionFeature = useCoreFeature(config.feature, {
    requireKnownSupport: config.feature !== "mediaFavorites",
  });
  const supported = libraryFeature.available && collectionFeature.available;

  const collectionQuery = useInfiniteQuery({
    queryKey:
      collection === "favorites"
        ? [LIBRARY_QUERY_KEYS.favorites, deviceKey]
        : [LIBRARY_QUERY_KEYS.collections, deviceKey, collection],
    queryFn: ({ pageParam, signal }) =>
      CoreAPI.mediaSearch(
        {
          query: "",
          systems: [],
          tags: [config.tag],
          maxResults: PAGE_SIZE,
          ...(pageParam ? { cursor: pageParam } : {}),
        },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pagination?.hasNextPage
        ? (lastPage.pagination.nextCursor ?? undefined)
        : undefined,
    enabled: connected && gamesIndex.exists && supported,
    staleTime: 30 * 1000,
    refetchOnMount: "always",
  });
  const entries = useMemo(
    () =>
      collectionQuery.data?.pages.flatMap((page) =>
        page.results.map(searchResultToBrowseEntry),
      ) ?? [],
    [collectionQuery.data?.pages],
  );

  return (
    <LibraryCollectionPage
      id={scope}
      labels={config}
      deviceKey={deviceKey}
      selection={selection}
      unsupportedRequiredVersion={
        supported ? null : collectionFeature.requiredVersion
      }
      databaseRequired={!gamesIndex.exists}
      query={collectionQuery}
      entries={entries}
      hasNextPage={Boolean(collectionQuery.hasNextPage)}
      isFetchingNextPage={collectionQuery.isFetchingNextPage}
      onFetchMore={() => void collectionQuery.fetchNextPage()}
      search={{
        title: t(config.search),
        open: searchOpen,
        disabled: !connected || !gamesIndex.exists || !supported,
        onOpen: () => {
          forgetScroll(librarySearchScrollKey(scope));
          setEmbeddedSearchOpen(scope, true);
        },
        onClose: () => setEmbeddedSearchOpen(scope, false),
        body: { fixedTags: [config.tag], sessionScope: scope },
      }}
    />
  );
}
