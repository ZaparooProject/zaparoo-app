import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { Heart } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link } from "@tanstack/react-router";
import { SearchResultGame } from "@/lib/models.ts";
import { useStatusStore } from "@/lib/store.ts";
import { usePreferencesStore } from "@/lib/preferencesStore.ts";
import { filenameFromPath } from "@/lib/path.ts";
import { hasFavoriteTag } from "@/lib/libraryMedia";
import { Card } from "@/components/wui/Card.tsx";
import { NextIcon, SettingsIcon, WarningIcon } from "@/lib/images.tsx";
import { LoadingSpinner } from "@/components/ui/loading-spinner.tsx";
import { DelayedLoading } from "@/components/DelayedLoading.tsx";
import { Button } from "@/components/wui/Button.tsx";
import { EmptyState } from "@/components/wui/EmptyState.tsx";
import { useInitialPageScrollOffset } from "@/lib/pageScrollContext";
import { useVirtualInfiniteSearch } from "@/hooks/useVirtualInfiniteSearch";
import { TagList } from "@/components/TagList.tsx";
import { useSystemNameResolver } from "@/hooks/useSystemName";
import { useAccessibleLists } from "@/hooks/useAccessibleLists";

export interface VirtualSearchResultsProps {
  query: string;
  systems: string[];
  tags?: string[];
  selectedResult: SearchResultGame | null;
  setSelectedResult: (game: SearchResultGame | null) => void;
  hasSearched?: boolean;
  searchSystem?: string;
  searchTags?: string[];
  onClearFilters?: () => void;
  isSearching?: boolean;
  onSearchComplete?: () => void;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  loadingDelayMs?: number;
}

export function VirtualSearchResults({
  query,
  systems,
  tags = [],
  selectedResult,
  setSelectedResult,
  hasSearched = false,
  searchSystem = "all",
  searchTags = [],
  onClearFilters,
  isSearching = false,
  onSearchComplete,
  scrollContainerRef,
  loadingDelayMs = 0,
}: VirtualSearchResultsProps) {
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const { t } = useTranslation();
  const accessibleLists = useAccessibleLists();
  const accessibleResultsRef = useRef<HTMLDivElement>(null);
  const loadMoreStartRef = useRef<number | null>(null);
  const resolveSystemName = useSystemNameResolver();

  const {
    allItems,
    totalCount,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    isError,
    fetchNextPage,
    refetch,
  } = useVirtualInfiniteSearch({
    query,
    systems,
    tags,
    // Core keeps exists true once committed systems are searchable during an
    // index; older versions report false until indexing finishes.
    enabled: hasSearched && gamesIndex.exists,
  });

  // Call onSearchComplete when loading finishes
  useEffect(() => {
    if (!isLoading && hasSearched && onSearchComplete) {
      onSearchComplete();
    }
  }, [isLoading, hasSearched, onSearchComplete]);

  // Calculate estimated item height based on whether displayed tags are shown.
  const estimateSize = useCallback(
    (index: number) => {
      if (index >= allItems.length) return 60; // Loading item
      const item = allItems[index];
      // Increased estimates to accommodate wrapped text and reduce layout shifts
      // Base height: 32px (pt-3 pb-5) + content + 1px border = total (gap handled by virtualizer)
      // Without tags: ~60px content + 32px padding + 1px border = 93px
      // With tags: ~80px content + 32px padding + 1px border = 113px
      const displayTags = item?.disambiguatingTags;
      return displayTags && displayTags.length > 0 ? 113 : 93;
    },
    [allItems],
  );

  const initialScrollOffset = useInitialPageScrollOffset();
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: totalCount + (hasNextPage ? 1 : 0), // +1 for loading sentinel
    getScrollElement: () => scrollContainerRef?.current || null,
    estimateSize,
    overscan: 5,
    scrollMargin: 8,
    initialOffset: initialScrollOffset,
    gap: 8,
  });

  // Fetch next page when approaching the end
  const virtualItems = virtualizer.getVirtualItems();

  useLayoutEffect(() => {
    // Cached route data can mount before TanStack Virtual's initial observer
    // update rerenders the list, so force one post-attachment range update.
    virtualizer.measure();
  }, [virtualizer]);

  useEffect(() => {
    const [lastItem] = [...virtualItems].reverse();

    if (!lastItem) return;

    if (
      !accessibleLists &&
      lastItem.index >= totalCount - 5 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [
    accessibleLists,
    virtualItems,
    hasNextPage,
    fetchNextPage,
    totalCount,
    isFetchingNextPage,
  ]);

  useEffect(() => {
    const requestedAt = loadMoreStartRef.current;
    if (requestedAt === null || isFetchingNextPage) return;

    const appendedResults = allItems.length > requestedAt;
    const reachedEnd = !hasNextPage;
    if (!appendedResults && !reachedEnd) return;

    if (reachedEnd) {
      const focusIndex = appendedResults
        ? requestedAt
        : Math.max(0, requestedAt - 1);
      requestAnimationFrame(() => {
        accessibleResultsRef.current
          ?.querySelector<HTMLButtonElement>(
            `[data-testid="result-${focusIndex}"]`,
          )
          ?.focus({ preventScroll: true });
      });
    }
    loadMoreStartRef.current = null;
  }, [allItems.length, hasNextPage, isFetchingNextPage]);

  // Screen reader announcement for search results
  const getAriaLiveMessage = () => {
    if (isLoading) return t("create.search.loading");
    if (isError) return t("create.search.searchError");
    if (totalCount > 0) {
      return t("create.search.resultsFound", { count: totalCount });
    }
    return "";
  };

  if (!gamesIndex.exists) {
    return (
      <Card className="mt-3">
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="text-error px-1.5">
            <WarningIcon size="24" />
          </div>
          <div className="flex grow flex-col">
            <span className="font-medium">
              {t("create.search.gamesDbUpdate")}
            </span>
          </div>
          <Link
            to="/settings"
            search={{
              focus: "database",
            }}
            aria-label={t("create.search.gamesDbSettings")}
            className="focus-visible:ring-offset-background flex h-10 w-10 min-w-10 items-center justify-center rounded-full px-1.5 text-white focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <SettingsIcon size="24" aria-hidden="true" />
          </Link>
        </div>
      </Card>
    );
  }

  // Show initial state when no search has been performed
  if (!hasSearched) {
    return (
      <EmptyState
        className="mt-6"
        title={t("create.search.startSearching")}
        description={t("create.search.startSearchingHint")}
      />
    );
  }

  // Show loading spinner when searching initially
  if (isLoading || isSearching) {
    return (
      <DelayedLoading delayMs={loadingDelayMs}>
        <div
          className="text-muted-foreground mt-6 flex items-center justify-center gap-2"
          role="status"
        >
          <LoadingSpinner size={16} className="text-primary" decorative />
          <span>{t("create.search.loading")}</span>
        </div>
      </DelayedLoading>
    );
  }

  if (isError) {
    return (
      <div className="mt-6 flex flex-col items-center">
        <p className="mb-3 text-white" role="alert">
          {t("create.search.searchError")}
        </p>
        <Button
          label={t("create.search.tryAgain")}
          onClick={() => refetch()}
          variant="outline"
        />
      </div>
    );
  }

  // Enhanced empty state with helpful suggestions
  if (totalCount === 0) {
    const hasActiveFilters =
      searchSystem !== "all" || (searchTags && searchTags.length > 0);
    const hasQuery = query && query.trim().length > 0;

    let mainMessage: string;
    let suggestionMessage: string;

    if (!hasQuery) {
      // No search query - just show simple message
      mainMessage = t("create.search.noResultsFoundSimple");
      suggestionMessage = hasActiveFilters
        ? t("create.search.tryRemovingFiltersOnly")
        : "";
    } else {
      // Has search query
      mainMessage = t("create.search.noResultsFound", { query: query });
      if (hasActiveFilters) {
        suggestionMessage = t("create.search.tryDifferentSearch");
      } else {
        suggestionMessage = t("create.search.tryDifferentTerms");
      }
    }

    return (
      <EmptyState
        className="mt-6"
        title={mainMessage}
        description={suggestionMessage || undefined}
        action={
          hasActiveFilters && onClearFilters ? (
            <Button
              label={t("create.search.clearFilters")}
              onClick={onClearFilters}
              variant="outline"
            />
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      {/* Screen reader announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {getAriaLiveMessage()}
      </div>

      {accessibleLists ? (
        <div ref={accessibleResultsRef} data-testid="search-results">
          <div role="list" aria-label={t("create.search.resultsLabel")}>
            {allItems.map((game, index) => (
              <div
                key={`${game.system.id}:${game.path}:${index}`}
                role="listitem"
                aria-posinset={index + 1}
                aria-setsize={hasNextPage ? undefined : totalCount}
              >
                <SearchResultItem
                  game={game}
                  systemName={resolveSystemName(
                    game.system.id,
                    game.system.name,
                  )}
                  selectedResult={selectedResult}
                  setSelectedResult={setSelectedResult}
                  isLast={!hasNextPage && index === allItems.length - 1}
                  index={index}
                />
              </div>
            ))}
          </div>
          {hasNextPage && (
            <div className="flex justify-center py-3">
              <Button
                label={
                  isFetchingNextPage
                    ? t("create.search.loading")
                    : t("create.search.loadMore")
                }
                variant="outline"
                disabled={isFetchingNextPage}
                onClick={() => {
                  loadMoreStartRef.current = allItems.length;
                  void fetchNextPage();
                }}
              />
            </div>
          )}
        </div>
      ) : (
        <div
          role="list"
          aria-label={t("create.search.resultsLabel")}
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
          data-testid="search-results"
        >
          {virtualItems.map((virtualItem) => {
            const isLoadingRow = virtualItem.index >= totalCount;
            const game = allItems[virtualItem.index];

            if (isLoadingRow) {
              return loadingDelayMs === 0 || isFetchingNextPage ? (
                <div
                  key={virtualItem.key}
                  role="status"
                  style={{
                    position: "absolute",
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <DelayedLoading delayMs={loadingDelayMs}>
                    <div className="text-muted-foreground flex items-center justify-center gap-2">
                      <LoadingSpinner
                        size={16}
                        className="text-primary"
                        decorative
                      />
                      <span>{t("create.search.loading")}</span>
                    </div>
                  </DelayedLoading>
                </div>
              ) : null;
            }
            if (!game) return null;

            return (
              <div
                key={virtualItem.key}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
                role="listitem"
                aria-posinset={virtualItem.index + 1}
                aria-setsize={hasNextPage ? undefined : totalCount}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <SearchResultItem
                  game={game}
                  systemName={resolveSystemName(
                    game.system.id,
                    game.system.name,
                  )}
                  selectedResult={selectedResult}
                  setSelectedResult={setSelectedResult}
                  isLast={virtualItem.index === totalCount - 1}
                  index={virtualItem.index}
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

interface SearchResultItemProps {
  game: SearchResultGame;
  systemName: string;
  selectedResult: SearchResultGame | null;
  setSelectedResult: (game: SearchResultGame | null) => void;
  isLast: boolean;
  index: number;
}

const SearchResultItem = React.memo(function SearchResultItem({
  game,
  systemName,
  selectedResult,
  setSelectedResult,
  isLast,
  index,
}: SearchResultItemProps) {
  const { t } = useTranslation();
  const showFilenames = usePreferencesStore((s) => s.showFilenames);

  // Primary display: filename if global pref enabled, otherwise clean name
  const displayName = showFilenames
    ? filenameFromPath(game.path) || game.name
    : game.name;

  const displayTags = game.disambiguatingTags ?? [];

  const handleGameSelect = () => {
    if (selectedResult && selectedResult.path === game.path) {
      setSelectedResult(null);
    } else if (selectedResult && selectedResult.path !== game.path) {
      setSelectedResult(null);
      setTimeout(() => {
        setSelectedResult(game);
      }, 150);
    } else {
      setSelectedResult(game);
    }
  };

  return (
    <button
      type="button"
      className="flex w-full cursor-pointer flex-row items-center justify-between gap-1 px-1 pt-3 pb-5 text-left focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
      style={{
        borderBottom: isLast ? "" : "1px solid rgba(255,255,255,0.6)",
      }}
      data-testid={`result-${index}`}
      onClick={(e) => {
        e.preventDefault();
        handleGameSelect();
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="font-semibold">{displayName}</p>
        <p className="text-sm">{systemName}</p>
        <TagList tags={displayTags} preserveOrder />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {hasFavoriteTag(game.tags) && (
          <span role="img" aria-label={t("library.favorite")}>
            <Heart size={18} fill="currentColor" aria-hidden="true" />
          </span>
        )}
        <span aria-hidden="true">
          <NextIcon size="20" />
        </span>
      </div>
    </button>
  );
});
