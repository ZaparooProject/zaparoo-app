import React, { useCallback, useEffect, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link } from "@tanstack/react-router";
import { SearchResultGame } from "@/lib/models.ts";
import { useStatusStore } from "@/lib/store.ts";
import { Card } from "@/components/wui/Card.tsx";
import { NextIcon, SettingsIcon, WarningIcon } from "@/lib/images.tsx";
import { LoadingSpinner } from "@/components/ui/loading-spinner.tsx";
import { Button } from "@/components/wui/Button.tsx";
import { useVirtualInfiniteSearch } from "@/hooks/useVirtualInfiniteSearch";


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
  scrollContainerRef
}: VirtualSearchResultsProps) {
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const { t } = useTranslation();

  const {
    allItems,
    totalCount,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    isError,
    fetchNextPage,
    refetch
  } = useVirtualInfiniteSearch({
    query,
    systems,
    tags,
    enabled: hasSearched && gamesIndex.exists && !gamesIndex.indexing
  });

  // Call onSearchComplete when loading finishes
  useEffect(() => {
    if (!isLoading && hasSearched && onSearchComplete) {
      onSearchComplete();
    }
  }, [isLoading, hasSearched, onSearchComplete]);

  // Calculate estimated item height based on whether tags are shown
  const estimateSize = useCallback((index: number) => {
    if (index >= allItems.length) return 60; // Loading item
    const item = allItems[index];
    // Increased estimates to accommodate wrapped text and reduce layout shifts
    // Base height: 32px (pt-3 pb-5) + content + 1px border = total (gap handled by virtualizer)
    // Without tags: ~60px content + 32px padding + 1px border = 93px
    // With tags: ~80px content + 32px padding + 1px border = 113px
    return item.tags && item.tags.length > 0 ? 113 : 93;
  }, [allItems]);

  const virtualizer = useVirtualizer({
    count: totalCount + (hasNextPage ? 1 : 0), // +1 for loading sentinel
    getScrollElement: () => scrollContainerRef?.current || null,
    estimateSize,
    overscan: 5,
    scrollMargin: 8,
    gap: 8
  });

  // Fetch next page when approaching the end
  useEffect(() => {
    const [lastItem] = [...virtualizer.getVirtualItems()].reverse();

    if (!lastItem) return;

    if (
      lastItem.index >= totalCount - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [
    hasNextPage,
    fetchNextPage,
    totalCount,
    isFetchingNextPage,
    virtualizer.getVirtualItems()
  ]);

  // Screen reader announcement for search results
  const getAriaLiveMessage = () => {
    if (isLoading) return t("create.search.loading");
    if (isError) return t("create.search.searchError");
    if (totalCount > 0) {
      return `${totalCount} ${totalCount === 1 ? 'result' : 'results'} found`;
    }
    return "";
  };

  if (!gamesIndex.exists) {
    return (
      <Card className="mt-3">
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="px-1.5 text-error">
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
              focus: "database"
            }}
          >
            <Button icon={<SettingsIcon size="24" />} variant="text" />
          </Link>
        </div>
      </Card>
    );
  }

  // Show initial state when no search has been performed
  if (!hasSearched) {
    return (
      <div className="text-center text-white/60 mt-6">
        <p className="text-lg mb-2">{t("create.search.startSearching")}</p>
        <p className="text-sm">{t("create.search.startSearchingHint")}</p>
      </div>
    );
  }

  // Show loading spinner when searching initially
  if (isLoading || isSearching) {
    return (
      <div className="flex items-center gap-2 justify-center text-white/60 mt-6">
        <LoadingSpinner size={16} className="text-primary" />
        <span>{t("create.search.loading")}</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center mt-6">
        <p className="text-white mb-3">{t("create.search.searchError")}</p>
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
    const hasActiveFilters = searchSystem !== "all" || (searchTags && searchTags.length > 0);
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
      <div className="text-center mt-6">
        <p className="text-white mb-3">{mainMessage}</p>
        {suggestionMessage && (
          <p className="text-sm text-white/70 mb-3">
            {suggestionMessage}
          </p>
        )}
        {hasActiveFilters && onClearFilters && (
          <div className="flex justify-center mt-2">
            <Button
              label={t("create.search.clearFilters")}
              onClick={onClearFilters}
              variant="outline"
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Screen reader announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {getAriaLiveMessage()}
      </div>

      {/* Virtual scrolling container */}
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative'
        }}
        data-testid="search-results"
      >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const isLoading = virtualItem.index >= totalCount;
            const game = allItems[virtualItem.index];

            return (
              <div
                key={virtualItem.key}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`
                }}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2 justify-center text-white/60">
                    <LoadingSpinner size={16} className="text-primary" />
                    <span>{t("create.search.loading")}</span>
                  </div>
                ) : (
                  <SearchResultItem
                    game={game}
                    selectedResult={selectedResult}
                    setSelectedResult={setSelectedResult}
                    isLast={virtualItem.index === totalCount - 1}
                    index={virtualItem.index}
                  />
                )}
              </div>
            );
          })}
      </div>
    </>
  );
}

interface SearchResultItemProps {
  game: SearchResultGame;
  selectedResult: SearchResultGame | null;
  setSelectedResult: (game: SearchResultGame | null) => void;
  isLast: boolean;
  index: number;
}

const SearchResultItem = React.memo(function SearchResultItem({
  game,
  selectedResult,
  setSelectedResult,
  isLast,
  index
}: SearchResultItemProps) {
  const handleGameSelect = () => {
    if (
      selectedResult &&
      selectedResult.path === game.path
    ) {
      setSelectedResult(null);
    } else if (
      selectedResult &&
      selectedResult.path !== game.path
    ) {
      setSelectedResult(null);
      setTimeout(() => {
        setSelectedResult(game);
      }, 150);
    } else {
      setSelectedResult(game);
    }
  };

  return (
    <div
      className="flex cursor-pointer flex-row items-center justify-between gap-1 px-1 pt-3 pb-5"
      style={{
        borderBottom: isLast ? "" : "1px solid rgba(255,255,255,0.6)"
      }}
      role="button"
      tabIndex={0}
      data-testid={`result-${index}`}
      onClick={(e) => {
        e.preventDefault();
        handleGameSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleGameSelect();
        }
      }}
    >
      <div className="flex flex-col">
        <p className="font-semibold">{game.name}</p>
        <p className="text-sm">{game.system.name}</p>
        {game.tags && game.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {game.tags.slice(0, 4).map((tag, tagIndex) => (
              <span
                key={tagIndex}
                className="inline-block px-2 py-0.5 text-xs rounded-full bg-white/20 text-white/80"
              >
                {tag.tag}
              </span>
            ))}
            {game.tags.length > 4 && (
              <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-white/10 text-white/60">
                +{game.tags.length - 4}
              </span>
            )}
          </div>
        )}
      </div>
      <div>
        <NextIcon size="20" />
      </div>
    </div>
  );
});