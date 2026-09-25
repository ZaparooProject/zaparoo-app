import {
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { CoreAPI } from "@/lib/coreApi";
import {
  entrySystemId,
  MEDIA_PREFERENCES,
  LIBRARY_QUERY_KEYS,
  searchResultToBrowseEntry,
} from "@/lib/libraryMedia";
import type { MediaBrowseEntry } from "@/lib/models";
import {
  librarySearchScrollKey,
  useLibrarySessionStore,
} from "@/lib/librarySessionStore";
import { useTabSessionStore } from "@/lib/tabSessionStore";
import { useStatusStore } from "@/lib/store";
import { BackIcon, SearchIcon } from "@/lib/images";
import { useBackButtonHandler } from "@/hooks/useBackButtonHandler";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { PageFrame } from "@/components/PageFrame";
import { BackToTop } from "@/components/BackToTop";
import { DelayedLoading } from "@/components/DelayedLoading";
import { EmptyState } from "@/components/wui/EmptyState";
import { Button } from "@/components/wui/Button";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { LibraryBrowseList } from "@/components/library/LibraryBrowseList";
import { LibraryGameSearch } from "@/components/library/LibraryGameSearch";
import { LibraryMediaDetailsModal } from "@/components/library/LibraryMediaDetailsModal";

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
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(t(config.title));
  const connected = useStatusStore((state) => state.connected);
  const coreVersionPending = useStatusStore(
    (state) => state.coreVersionPending,
  );
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const deviceKey = useActiveDeviceKey();
  const activateLibraryDevice = useLibrarySessionStore(
    (state) => state.activateDevice,
  );
  const searchOpen = useLibrarySessionStore(
    (state) => state.embeddedSearchOpen[scope] ?? false,
  );
  const setEmbeddedSearchOpen = useLibrarySessionStore(
    (state) => state.setEmbeddedSearchOpen,
  );
  const forgetScroll = useTabSessionStore((state) => state.forgetScroll);
  const [selectedEntry, setSelectedEntry] = useState<MediaBrowseEntry | null>(
    null,
  );
  const libraryFeature = useCoreFeature("mediaLibrary");
  // Same strictness as the Library entry points, so a collection reachable
  // from Library never opens on "Update Core".
  const collectionFeature = useCoreFeature(config.feature, {
    requireKnownSupport: config.feature !== "mediaFavorites",
  });

  useLayoutEffect(() => {
    activateLibraryDevice(deviceKey);
  }, [activateLibraryDevice, deviceKey]);

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
    enabled:
      connected &&
      gamesIndex.exists &&
      libraryFeature.available &&
      collectionFeature.available,
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
  const hasNextPage = Boolean(collectionQuery.hasNextPage);

  const closeSearch = useCallback(
    () => setEmbeddedSearchOpen(scope, false),
    [scope, setEmbeddedSearchOpen],
  );
  const goBack = useCallback(() => {
    setSelectedEntry(null);
    if (searchOpen) {
      closeSearch();
      return;
    }
    void navigate({ to: "/library", resetScroll: false });
  }, [closeSearch, navigate, searchOpen]);
  const handleBackButton = useCallback(() => {
    goBack();
    return true;
  }, [goBack]);
  useBackButtonHandler(`library-${scope}`, handleBackButton);

  const loadingContent = (
    <DelayedLoading>
      <div className="text-muted-foreground flex items-center justify-center gap-2 py-8">
        <LoadingSpinner size={16} className="text-primary" />
        <span>{t(config.loading)}</span>
      </div>
    </DelayedLoading>
  );

  let content: ReactNode;
  if (!connected) {
    content = <EmptyState title={t("library.disconnected")} />;
  } else if (coreVersionPending) {
    content = loadingContent;
  } else if (!libraryFeature.available || !collectionFeature.available) {
    content = (
      <EmptyState
        title={t("library.updateCore")}
        description={t("features.requiresCoreVersion", {
          version: collectionFeature.requiredVersion,
        })}
      />
    );
  } else if (!gamesIndex.exists) {
    content = <EmptyState title={t("library.databaseRequired")} />;
  } else if (collectionQuery.isLoading) {
    content = loadingContent;
  } else if (collectionQuery.isError) {
    content = (
      <EmptyState
        title={t(config.error)}
        action={
          <Button
            label={t("library.tryAgain")}
            variant="outline"
            onClick={() => void collectionQuery.refetch()}
          />
        }
      />
    );
  } else if (entries.length === 0) {
    content = (
      <EmptyState title={t(config.empty)} description={t(config.hint)} />
    );
  } else {
    content = (
      <LibraryBrowseList
        entries={entries}
        systemId=""
        deviceKey={deviceKey}
        scrollRef={scrollRef}
        hasNextPage={hasNextPage}
        isFetchingNextPage={collectionQuery.isFetchingNextPage}
        imagesPaused={false}
        interactionDisabled={false}
        onFetchMore={() => void collectionQuery.fetchNextPage()}
        onSelect={setSelectedEntry}
        showSystemName
        ariaLabel={t(config.list)}
      />
    );
  }

  return (
    <>
      <PageFrame
        onSwipeBack={goBack}
        scrollRef={scrollRef}
        sessionScrollKey={`library:${scope}:${searchOpen ? "search" : "list"}`}
        headerLeft={
          <HeaderButton
            icon={<BackIcon size="24" />}
            aria-label={t("nav.back")}
            onClick={goBack}
          />
        }
        headerCenter={
          <h1 ref={headingRef} className="text-foreground text-xl">
            {searchOpen ? t(config.search) : t(config.title)}
          </h1>
        }
        headerRight={
          searchOpen ? undefined : (
            <HeaderButton
              icon={<SearchIcon size="24" />}
              aria-label={t(config.search)}
              onClick={() => {
                forgetScroll(librarySearchScrollKey(scope));
                setSelectedEntry(null);
                setEmbeddedSearchOpen(scope, true);
              }}
              disabled={
                !connected ||
                !gamesIndex.exists ||
                !libraryFeature.available ||
                !collectionFeature.available
              }
            />
          )
        }
      >
        {searchOpen ? (
          <LibraryGameSearch
            fixedTags={[config.tag]}
            sessionScope={scope}
            title={t(config.search)}
            onBack={closeSearch}
            embedded
            scrollRef={scrollRef}
          />
        ) : (
          <>
            {content}
            <BackToTop
              scrollContainerRef={scrollRef}
              threshold={200}
              bottomOffset="calc(var(--bottom-nav-base-height) + 1rem)"
            />
          </>
        )}
      </PageFrame>
      <LibraryMediaDetailsModal
        isOpen={selectedEntry !== null}
        close={() => setSelectedEntry(null)}
        entry={selectedEntry}
        systemId={selectedEntry ? entrySystemId(selectedEntry) : ""}
        deviceKey={deviceKey}
      />
    </>
  );
}
