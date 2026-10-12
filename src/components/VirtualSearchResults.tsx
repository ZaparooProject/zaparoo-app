import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { HeartIcon } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link } from "@tanstack/react-router";
import classNames from "classnames";
import { SearchResultGame } from "@/lib/models.ts";
import { useStatusStore } from "@/lib/store.ts";
import { usePreferencesStore } from "@/lib/preferencesStore.ts";
import { filenameFromPath } from "@/lib/path.ts";
import { hasFavoriteTag, searchResultToBrowseEntry } from "@/lib/libraryMedia";
import { LibraryMediaRow } from "@/components/library/LibraryMediaRow";
import { libraryMediaRowGeometry } from "@/components/library/libraryMediaRowGeometry";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { Card } from "@/components/wui/Card.tsx";
import { NextIcon, SettingsIcon, WarningIcon } from "@/lib/images.tsx";
import { InlineLoading } from "@/components/InlineLoading.tsx";
import { DelayedLoading } from "@/components/DelayedLoading.tsx";
import { Button } from "@/components/wui/Button.tsx";
import { EmptyState } from "@/components/wui/EmptyState.tsx";
import { useInitialPageScrollOffset } from "@/lib/pageScrollContext";
import { useVirtualListScrollMargin } from "@/hooks/useVirtualListScrollMargin";
import { useVirtualInfiniteSearch } from "@/hooks/useVirtualInfiniteSearch";
import { TagList } from "@/components/TagList.tsx";
import { useSystemNameResolver } from "@/hooks/useSystemName";
import { useAccessibleLists } from "@/hooks/useAccessibleLists";
import { useHapticPress } from "@/hooks/useHapticPress";

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
  /** Reports whether the first page of the current search is loading. */
  onLoadingChange?: (loading: boolean) => void;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  loadingDelayMs?: number;
  compactEmptyState?: boolean;
  selectionPresentation?: "modal" | "pane";
  /**
   * "library" renders the artwork rows of Library browse and collection
   * lists, so a Library page keeps one row design when it switches to search.
   */
  rowVariant?: "plain" | "library";
}

export function VirtualSearchResults({
  query,
  systems,
  tags = [],
  selectedResult,
  setSelectedResult,
  selectionPresentation = "modal",
  hasSearched = false,
  searchSystem = "all",
  searchTags = [],
  onClearFilters,
  onLoadingChange,
  scrollContainerRef,
  loadingDelayMs = 0,
  compactEmptyState = false,
  rowVariant = "plain",
}: VirtualSearchResultsProps) {
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const { t } = useTranslation();
  const accessibleLists = useAccessibleLists();
  const accessibleResultsRef = useRef<HTMLDivElement>(null);
  const loadMoreStartRef = useRef<number | null>(null);
  const resolveSystemName = useSystemNameResolver();
  const libraryRows = rowVariant === "library";
  const deviceKey = useActiveDeviceKey();
  const showFilenames = usePreferencesStore((state) => state.showFilenames);
  const corePlatform = useStatusStore((state) => state.corePlatform);
  const textZoomLevel =
    usePreferencesStore((state) => state.textZoomLevel) ?? 1;
  // Library rows always show the system, so they use that list's row height.
  const libraryGeometry = libraryMediaRowGeometry(true, textZoomLevel);

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

  const searchLoading = hasSearched && isLoading;
  useEffect(() => {
    onLoadingChange?.(searchLoading);
  }, [onLoadingChange, searchLoading]);

  const libraryRowHeight = libraryGeometry.rowHeight;
  const libraryLeadingInset = libraryGeometry.leadingInset;
  const libraryRowMinHeight = useCallback(
    (index: number) =>
      index === 0 ? libraryRowHeight - libraryLeadingInset : libraryRowHeight,
    [libraryLeadingInset, libraryRowHeight],
  );

  // Calculate estimated item height based on whether displayed tags are shown.
  const estimateSize = useCallback(
    (index: number) => {
      if (index >= allItems.length) return 60; // Loading item
      if (libraryRows) return libraryRowMinHeight(index);
      const item = allItems[index];
      // Increased estimates to accommodate wrapped text and reduce layout shifts
      // Base height: 32px (pt-3 pb-5) + content + 1px border = total (gap handled by virtualizer)
      // Without tags: ~60px content + 32px padding + 1px border = 93px
      // With tags: ~80px content + 32px padding + 1px border = 113px
      const displayTags = item?.disambiguatingTags;
      return displayTags && displayTags.length > 0 ? 113 : 93;
    },
    [allItems, libraryRows, libraryRowMinHeight],
  );

  const initialScrollOffset = useInitialPageScrollOffset();
  const { listRef, scrollMargin, scrollPaddingStart } =
    useVirtualListScrollMargin(scrollContainerRef);
  const setAccessibleListRef = useCallback(
    (element: HTMLDivElement | null) => {
      accessibleResultsRef.current = element;
      listRef(element);
    },
    [listRef],
  );
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: totalCount + (hasNextPage ? 1 : 0), // +1 for loading sentinel
    getScrollElement: () => scrollContainerRef?.current || null,
    estimateSize,
    overscan: 5,
    scrollMargin,
    scrollPaddingStart,
    initialOffset: initialScrollOffset,
    // Leading row space belongs to the list, not its page-scroll origin.
    // Library rows carry their own spacing and start at the page inset.
    paddingStart: libraryRows ? 0 : 8,
    gap: libraryRows ? 0 : 8,
  });

  // Fetch next page when approaching the end
  const virtualItems = virtualizer.getVirtualItems();

  useLayoutEffect(() => {
    // Cached route data can mount before TanStack Virtual's initial observer
    // update rerenders the list, so force one post-attachment range update.
    virtualizer.measure();
  }, [libraryRows, textZoomLevel, virtualizer]);

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
            `[data-result-index="${focusIndex}"] button`,
          )
          ?.focus({ preventScroll: true });
      });
    }
    loadMoreStartRef.current = null;
  }, [allItems.length, hasNextPage, isFetchingNextPage]);

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
            className="focus-visible:ring-offset-background text-foreground focus-visible:ring-ring flex size-12 min-w-12 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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
        size={compactEmptyState ? "compact" : "default"}
        className={compactEmptyState ? undefined : "mt-6"}
        title={t("create.search.startSearching")}
        description={t("create.search.startSearchingHint")}
      />
    );
  }

  // Show loading spinner when searching initially
  if (isLoading) {
    return (
      <DelayedLoading delayMs={loadingDelayMs}>
        <InlineLoading label={t("create.search.loading")} />
      </DelayedLoading>
    );
  }

  if (isError) {
    return (
      <EmptyState
        className="mt-6"
        title={t("create.search.searchError")}
        action={
          <Button
            label={t("create.search.tryAgain")}
            onClick={() => refetch()}
            variant="outline"
          />
        }
      />
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
        size={compactEmptyState ? "compact" : "default"}
        className={compactEmptyState ? undefined : "mt-6"}
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

  const isSelected = (game: SearchResultGame) =>
    selectionPresentation === "pane" &&
    selectedResult?.path === game.path &&
    selectedResult.system.id === game.system.id;
  // The one place a result row is chosen: plain list rows, or Library's
  // artwork rows built from the same entry the Library details use.
  const renderRow = (
    game: SearchResultGame,
    index: number,
    isLast: boolean,
    deferImages: boolean,
  ) =>
    libraryRows ? (
      <LibraryMediaRow
        entry={searchResultToBrowseEntry(game)}
        systemId={game.system.id}
        deviceKey={deviceKey}
        showFilenames={showFilenames}
        corePlatform={corePlatform}
        imagesPaused={false}
        interactionDisabled={false}
        deferImages={deferImages}
        textZoomed={libraryGeometry.textZoomed}
        minHeight={libraryRowHeight}
        leadingInset={index === 0 ? libraryLeadingInset : undefined}
        showSystemName
        selected={isSelected(game)}
        hasDivider={!isLast}
        onSelect={() => setSelectedResult(game)}
      />
    ) : (
      <SearchResultItem
        game={game}
        systemName={resolveSystemName(game.system.id, game.system.name)}
        selected={isSelected(game)}
        setSelectedResult={setSelectedResult}
        isLast={isLast}
        index={index}
      />
    );
  const rowWrapperMinHeight = (index: number) =>
    libraryRows ? `${libraryRowMinHeight(index)}px` : undefined;

  return (
    <>
      {/* Screen reader announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {t("create.search.resultsFound", { count: totalCount })}
      </div>

      {accessibleLists ? (
        <div ref={setAccessibleListRef} data-testid="search-results">
          <div role="list" aria-label={t("create.search.resultsLabel")}>
            {allItems.map((game, index) => (
              <div
                key={`${game.system.id}:${game.path}:${index}`}
                role="listitem"
                data-result-index={index}
                aria-posinset={index + 1}
                aria-setsize={hasNextPage ? undefined : totalCount}
                style={{ minHeight: rowWrapperMinHeight(index) }}
              >
                {renderRow(
                  game,
                  index,
                  !hasNextPage && index === allItems.length - 1,
                  true,
                )}
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
                disabledAppearance="busy"
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
          ref={listRef}
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
                  style={{
                    position: "absolute",
                    width: "100%",
                    transform: `translateY(${virtualItem.start - scrollMargin}px)`,
                  }}
                >
                  <DelayedLoading delayMs={loadingDelayMs}>
                    <InlineLoading label={t("create.search.loading")} />
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
                  minHeight: rowWrapperMinHeight(virtualItem.index),
                  transform: `translateY(${virtualItem.start - scrollMargin}px)`,
                }}
              >
                {renderRow(
                  game,
                  virtualItem.index,
                  virtualItem.index === totalCount - 1,
                  false,
                )}
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
  selected: boolean;
  setSelectedResult: (game: SearchResultGame | null) => void;
  isLast: boolean;
  index: number;
}

const SearchResultItem = React.memo(function SearchResultItem({
  game,
  systemName,
  selected,
  setSelectedResult,
  isLast,
  index,
}: SearchResultItemProps) {
  const { t } = useTranslation();
  const showFilenames = usePreferencesStore((s) => s.showFilenames);
  const handleHapticPress = useHapticPress();

  // Primary display: filename if global pref enabled, otherwise clean name
  const displayName = showFilenames
    ? filenameFromPath(game.path) || game.name
    : game.name;

  const displayTags = game.disambiguatingTags ?? [];

  return (
    <button
      type="button"
      className={classNames(
        "library-browse-row focus-visible:ring-ring flex w-full cursor-pointer flex-row items-center justify-between gap-1 px-1 pt-3 pb-5 text-left focus-visible:ring-2 focus-visible:outline-none",
        { "border-border border-b": !isLast },
      )}
      data-testid={`result-${index}`}
      aria-current={selected ? "true" : undefined}
      onPointerUp={handleHapticPress}
      // A modal selection covers the list, so a row can only ever select.
      onClick={() => setSelectedResult(game)}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="font-semibold">{displayName}</p>
        <p className="text-sm">{systemName}</p>
        <TagList tags={displayTags} preserveOrder />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {hasFavoriteTag(game.tags) && (
          <span role="img" aria-label={t("library.favorite")}>
            <HeartIcon size={18} fill="currentColor" aria-hidden="true" />
          </span>
        )}
        <span aria-hidden="true" className="text-muted-foreground shrink-0">
          <NextIcon size="20" />
        </span>
      </div>
    </button>
  );
});
