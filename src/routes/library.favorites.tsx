import {
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CoreAPI } from "@/lib/coreApi";
import {
  entrySystemId,
  FAVORITE_TAG_FILTER,
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
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
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
const FAVORITES_SCOPE = "favorites";

export const Route = createFileRoute("/library/favorites")({
  component: LibraryFavorites,
});

export function LibraryFavorites() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("library.favorites"),
  );
  const connected = useStatusStore((state) => state.connected);
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const targetDeviceAddress = useStatusStore(
    (state) => state.targetDeviceAddress,
  );
  const activateLibraryDevice = useLibrarySessionStore(
    (state) => state.activateDevice,
  );
  const searchOpen = useLibrarySessionStore(
    (state) => state.embeddedSearchOpen[FAVORITES_SCOPE] ?? false,
  );
  const setEmbeddedSearchOpen = useLibrarySessionStore(
    (state) => state.setEmbeddedSearchOpen,
  );
  const forgetScroll = useTabSessionStore((state) => state.forgetScroll);
  const [selectedEntry, setSelectedEntry] = useState<MediaBrowseEntry | null>(
    null,
  );
  const libraryFeature = useCoreFeature("mediaLibrary");
  const favoritesFeature = useCoreFeature("mediaFavorites");

  useLayoutEffect(() => {
    activateLibraryDevice(targetDeviceAddress);
  }, [activateLibraryDevice, targetDeviceAddress]);

  const favoritesQuery = useInfiniteQuery({
    queryKey: [LIBRARY_QUERY_KEYS.favorites, targetDeviceAddress],
    queryFn: ({ pageParam, signal }) =>
      CoreAPI.mediaSearch(
        {
          query: "",
          systems: [],
          tags: [FAVORITE_TAG_FILTER],
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
      favoritesFeature.available,
    staleTime: 30 * 1000,
  });
  const entries = useMemo(
    () =>
      favoritesQuery.data?.pages.flatMap((page) =>
        page.results.map(searchResultToBrowseEntry),
      ) ?? [],
    [favoritesQuery.data?.pages],
  );
  const hasNextPage = Boolean(favoritesQuery.hasNextPage);

  const closeSearch = () => setEmbeddedSearchOpen(FAVORITES_SCOPE, false);
  const goBack = () => {
    setSelectedEntry(null);
    if (searchOpen) {
      closeSearch();
      return;
    }
    void navigate({ to: "/library", resetScroll: false });
  };
  useBackButtonHandler("library-favorites", () => {
    goBack();
    return true;
  });
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false,
  });

  let content: ReactNode;
  if (!connected) {
    content = <EmptyState title={t("library.disconnected")} />;
  } else if (!libraryFeature.available || !favoritesFeature.available) {
    content = (
      <EmptyState
        title={t("library.updateCore")}
        description={t("features.requiresCoreVersion", {
          version: favoritesFeature.requiredVersion,
        })}
      />
    );
  } else if (!gamesIndex.exists) {
    content = <EmptyState title={t("library.databaseRequired")} />;
  } else if (favoritesQuery.isLoading) {
    content = (
      <DelayedLoading>
        <div className="text-muted-foreground flex items-center justify-center gap-2 py-8">
          <LoadingSpinner size={16} className="text-primary" />
          <span>{t("library.loadingFavorites")}</span>
        </div>
      </DelayedLoading>
    );
  } else if (favoritesQuery.isError) {
    content = (
      <EmptyState
        title={t("library.favoritesError")}
        action={
          <Button
            label={t("library.tryAgain")}
            variant="outline"
            onClick={() => void favoritesQuery.refetch()}
          />
        }
      />
    );
  } else if (entries.length === 0) {
    content = (
      <EmptyState
        title={t("library.noFavorites")}
        description={t("library.noFavoritesHint")}
      />
    );
  } else {
    content = (
      <LibraryBrowseList
        entries={entries}
        systemId=""
        targetDeviceAddress={targetDeviceAddress}
        scrollRef={scrollRef}
        hasNextPage={hasNextPage}
        isFetchingNextPage={favoritesQuery.isFetchingNextPage}
        imagesPaused={false}
        interactionDisabled={false}
        onFetchMore={() => void favoritesQuery.fetchNextPage()}
        onSelect={setSelectedEntry}
        showSystemName
        ariaLabel={t("library.favoritesList")}
      />
    );
  }

  return (
    <>
      <PageFrame
        {...swipeHandlers}
        scrollRef={scrollRef}
        sessionScrollKey={`library:favorites:${searchOpen ? "search" : "list"}`}
        headerLeft={
          <HeaderButton
            icon={<BackIcon size="24" />}
            aria-label={t("nav.back")}
            onClick={goBack}
          />
        }
        headerCenter={
          <h1 ref={headingRef} className="text-foreground text-xl">
            {searchOpen ? t("library.searchFavorites") : t("library.favorites")}
          </h1>
        }
        headerRight={
          searchOpen ? undefined : (
            <HeaderButton
              icon={<SearchIcon size="24" />}
              aria-label={t("library.searchFavorites")}
              onClick={() => {
                forgetScroll(librarySearchScrollKey(FAVORITES_SCOPE));
                setSelectedEntry(null);
                setEmbeddedSearchOpen(FAVORITES_SCOPE, true);
              }}
              disabled={
                !connected ||
                !gamesIndex.exists ||
                !libraryFeature.available ||
                !favoritesFeature.available
              }
            />
          )
        }
      >
        {searchOpen ? (
          <LibraryGameSearch
            fixedTags={[FAVORITE_TAG_FILTER]}
            sessionScope={FAVORITES_SCOPE}
            title={t("library.searchFavorites")}
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
              bottomOffset="calc(80px + 1rem)"
            />
          </>
        )}
      </PageFrame>
      <LibraryMediaDetailsModal
        isOpen={selectedEntry !== null}
        close={() => setSelectedEntry(null)}
        entry={selectedEntry}
        systemId={selectedEntry ? entrySystemId(selectedEntry) : ""}
        targetDeviceAddress={targetDeviceAddress}
      />
    </>
  );
}
