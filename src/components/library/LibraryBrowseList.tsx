import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import type { ReactNode, RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useAccessibleLists } from "@/hooks/useAccessibleLists";
import { useStatusStore } from "@/lib/store";
import { mediaRefKey } from "@/lib/libraryMedia";
import type { LibraryBrowseRange } from "@/lib/libraryBrowse";
import type { MediaBrowseEntry } from "@/lib/models";
import { InlineLoading } from "@/components/InlineLoading";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/wui/Button";
import { useAnnouncer } from "@/components/A11yAnnouncer";
import { DelayedLoading } from "@/components/DelayedLoading";
import { useInitialPageScrollOffset } from "@/lib/pageScrollContext";
import { useVirtualListScrollMargin } from "@/hooks/useVirtualListScrollMargin";
import { LibraryMediaRow } from "@/components/library/LibraryMediaRow";
import {
  libraryMediaRowBoxStyle,
  libraryMediaRowGeometry,
} from "@/components/library/libraryMediaRowGeometry";

// Matches the virtualizer's scroll-end delay so jumps and flings settle before
// unloaded rows are requested.
const LOAD_INDEX_DELAY_MS = 150;

function inRanges(
  ranges: readonly LibraryBrowseRange[] | undefined,
  index: number,
): boolean {
  return (
    ranges?.some((range) => index >= range.start && index < range.end) ?? false
  );
}

function LibraryBrowsePlaceholderRow(props: {
  textZoomed: boolean;
  minHeight: number;
  leadingInset?: number;
  hasDivider: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={classNames("flex w-full items-center gap-3 px-1 py-3", {
        "h-full": !props.textZoomed,
        "border-border border-b": props.hasDivider,
      })}
      style={libraryMediaRowBoxStyle(props.minHeight, props.leadingInset)}
    >
      <Skeleton className="h-16 w-16 shrink-0" />
      <Skeleton className="h-5 w-2/3" />
    </div>
  );
}

export interface LibraryBrowseListHandle {
  scrollToIndex: (index: number) => void;
}

export const LibraryBrowseList = forwardRef<
  LibraryBrowseListHandle,
  {
    /** Absolute rows; `undefined` marks a row that has not loaded yet. */
    entries: readonly (MediaBrowseEntry | undefined)[];
    systemId: string;
    deviceKey: string;
    scrollRef: RefObject<HTMLDivElement | null>;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    imagesPaused: boolean;
    interactionDisabled: boolean;
    onFetchMore: () => void;
    onSelect: (entry: MediaBrowseEntry) => void;
    selectedEntry?: MediaBrowseEntry | null;
    onLoadIndex?: (index: number, options?: { retry?: boolean }) => void;
    isLoadingIndex?: boolean;
    failedRanges?: readonly LibraryBrowseRange[];
    showSystemName?: boolean;
    /** Extra muted line under the system name; takes the tag line's space. */
    entryDetail?: (entry: MediaBrowseEntry) => string | undefined;
    ariaLabel?: string;
  }
>(function LibraryBrowseList(props, ref) {
  const { t } = useTranslation();
  const { announce } = useAnnouncer();
  const showFilenames = usePreferencesStore((state) => state.showFilenames);
  const textZoomLevel =
    usePreferencesStore((state) => state.textZoomLevel) ?? 1;
  const accessibleLists = useAccessibleLists();
  const corePlatform = useStatusStore((state) => state.corePlatform);
  const { textZoomed, rowHeight, leadingInset, rowMinHeight } =
    libraryMediaRowGeometry(props.showSystemName ?? false, textZoomLevel);
  const selectedKey = props.selectedEntry
    ? JSON.stringify(mediaRefKey(props.selectedEntry, props.systemId))
    : null;
  const rowRefs = useRef(new Map<number, HTMLDivElement>());
  const loadMoreStartRef = useRef<number | null>(null);
  const loadEarlierRangeRef = useRef<LibraryBrowseRange | null>(null);
  const initialScrollOffset = useInitialPageScrollOffset();
  const { listRef, scrollMargin, scrollPaddingStart } =
    useVirtualListScrollMargin(props.scrollRef);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual exposes imperative functions that React Compiler cannot memoize safely.
  const virtualizer = useVirtualizer({
    count: props.entries.length + (props.hasNextPage ? 1 : 0),
    getScrollElement: () => props.scrollRef.current,
    estimateSize: rowMinHeight,
    overscan: 2,
    initialOffset: initialScrollOffset,
    scrollMargin,
    scrollPaddingStart,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const isScrolling = virtualizer.isScrolling;
  const fetchMore = props.onFetchMore;
  const loadIndex = props.onLoadIndex;

  useLayoutEffect(() => {
    // Cached route data and text zoom can change measured row dimensions after
    // the virtualizer's initial observer pass.
    virtualizer.measure();
  }, [textZoomLevel, virtualizer]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex: (index: number) => {
        if (accessibleLists) {
          rowRefs.current.get(index)?.scrollIntoView({ block: "start" });
          return;
        }
        virtualizer.scrollToIndex(index, { align: "start" });
      },
    }),
    [accessibleLists, virtualizer],
  );

  useEffect(() => {
    const requestedAt = loadMoreStartRef.current;
    if (requestedAt === null || props.entries.length <= requestedAt) return;

    announce(
      t("library.loadedMore", {
        count: props.entries.length - requestedAt,
      }),
    );
    if (!props.hasNextPage) {
      requestAnimationFrame(() => {
        rowRefs.current
          .get(requestedAt)
          ?.querySelector<HTMLButtonElement>("button")
          ?.focus();
      });
    }
    loadMoreStartRef.current = null;
  }, [announce, props.entries.length, props.hasNextPage, t]);

  useEffect(() => {
    const lastItem = virtualItems.at(-1);
    // A jump to an earlier bucket can shorten the list before it scrolls to
    // the target, leaving the old position at the new end for a frame.
    if (
      !accessibleLists &&
      !props.interactionDisabled &&
      lastItem &&
      lastItem.index >= props.entries.length - 5 &&
      props.hasNextPage &&
      !props.isFetchingNextPage
    ) {
      fetchMore();
    }
  }, [
    accessibleLists,
    fetchMore,
    props.entries.length,
    props.hasNextPage,
    props.interactionDisabled,
    props.isFetchingNextPage,
    virtualItems,
  ]);

  useEffect(() => {
    const range = loadEarlierRangeRef.current;
    if (!range) return;

    let firstLoaded: number | null = null;
    let loadedCount = 0;
    for (let index = range.start; index < range.end; index++) {
      if (props.entries[index] === undefined) continue;
      firstLoaded ??= index;
      loadedCount++;
    }
    if (firstLoaded === null) return;

    announce(t("library.loadedMore", { count: loadedCount }));
    const focusIndex = firstLoaded;
    requestAnimationFrame(() => {
      rowRefs.current
        .get(focusIndex)
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus();
    });
    loadEarlierRangeRef.current = null;
  }, [announce, props.entries, t]);

  useEffect(() => {
    if (
      !loadIndex ||
      accessibleLists ||
      isScrolling ||
      props.interactionDisabled ||
      props.isLoadingIndex
    ) {
      return;
    }

    // Wait for scrolling to settle and read the visible range without overscan,
    // so rows passed during a fling or next to a jump target are not fetched.
    const timer = setTimeout(() => {
      if (virtualizer.isScrolling || !virtualizer.range) return;
      const lastVisible = Math.min(
        virtualizer.range.endIndex,
        props.entries.length - 1,
      );
      for (
        let index = virtualizer.range.startIndex;
        index <= lastVisible;
        index++
      ) {
        if (
          props.entries[index] === undefined &&
          !inRanges(props.failedRanges, index)
        ) {
          loadIndex(index);
          return;
        }
      }
    }, LOAD_INDEX_DELAY_MS);
    return () => clearTimeout(timer);
  }, [
    accessibleLists,
    isScrolling,
    loadIndex,
    props.entries,
    props.failedRanges,
    props.interactionDisabled,
    props.isLoadingIndex,
    virtualItems,
    virtualizer,
  ]);

  const renderEntry = (
    entry: MediaBrowseEntry,
    index: number,
    deferImages: boolean,
  ) => (
    <LibraryMediaRow
      entry={entry}
      systemId={props.systemId}
      deviceKey={props.deviceKey}
      showFilenames={showFilenames}
      corePlatform={corePlatform}
      imagesPaused={props.imagesPaused}
      interactionDisabled={props.interactionDisabled}
      deferImages={deferImages}
      textZoomed={textZoomed}
      minHeight={rowHeight}
      leadingInset={index === 0 ? leadingInset : undefined}
      showSystemName={props.showSystemName ?? false}
      detail={props.entryDetail?.(entry)}
      selected={
        selectedKey !== null &&
        JSON.stringify(mediaRefKey(entry, props.systemId)) === selectedKey
      }
      hasDivider={props.hasNextPage || index < props.entries.length - 1}
      onSelect={props.onSelect}
    />
  );
  const setSize = props.hasNextPage ? -1 : props.entries.length;

  const renderLoadEarlier = (range: LibraryBrowseRange) => (
    <Button
      label={
        props.isLoadingIndex
          ? t("library.loadingMore")
          : t("library.loadEarlier")
      }
      variant="outline"
      disabled={props.isLoadingIndex}
      disabledAppearance="busy"
      onClick={() => {
        loadEarlierRangeRef.current = range;
        props.onLoadIndex?.(range.end - 1, { retry: true });
      }}
    />
  );

  if (accessibleLists) {
    const rows: ReactNode[] = [];
    for (let index = 0; index < props.entries.length; index++) {
      const entry = props.entries[index];
      if (entry) {
        const rowIndex = index;
        rows.push(
          <div
            key={`${entry.mediaId ?? entry.path}:${index}`}
            ref={(element) => {
              if (element) rowRefs.current.set(rowIndex, element);
              else rowRefs.current.delete(rowIndex);
            }}
            role="listitem"
            aria-posinset={index + 1}
            aria-setsize={setSize}
            style={{
              minHeight: `${rowMinHeight(index)}px`,
              scrollMarginTop: `${scrollPaddingStart}px`,
            }}
          >
            {renderEntry(entry, index, true)}
          </div>,
        );
        continue;
      }

      const start = index;
      while (
        index + 1 < props.entries.length &&
        props.entries[index + 1] === undefined
      ) {
        index++;
      }
      rows.push(
        <div
          key={`unloaded:${start}`}
          role="listitem"
          className="flex justify-center py-3"
        >
          {renderLoadEarlier({ start, end: index + 1 })}
        </div>,
      );
    }

    return (
      <>
        <div
          role="list"
          ref={listRef}
          aria-label={props.ariaLabel ?? t("library.entriesLabel")}
        >
          {rows}
        </div>
        {props.hasNextPage && (
          <div className="flex justify-center py-3">
            <Button
              label={
                props.isFetchingNextPage
                  ? t("library.loadingMore")
                  : t("library.loadMore")
              }
              variant="outline"
              disabled={props.isFetchingNextPage}
              disabledAppearance="busy"
              onClick={() => {
                loadMoreStartRef.current = props.entries.length;
                props.onFetchMore();
              }}
            />
          </div>
        )}
      </>
    );
  }

  return (
    <div
      ref={listRef}
      role="list"
      aria-label={props.ariaLabel ?? t("library.entriesLabel")}
      style={{
        height: `${virtualizer.getTotalSize()}px`,
        width: "100%",
        position: "relative",
      }}
    >
      {virtualItems.map((virtualItem) => {
        const entry = props.entries[virtualItem.index];
        const loading = virtualItem.index >= props.entries.length;
        if (loading) {
          return props.isFetchingNextPage ? (
            <div
              key={virtualItem.key}
              style={{
                position: "absolute",
                width: "100%",
                transform: `translateY(${virtualItem.start - scrollMargin}px)`,
              }}
            >
              <DelayedLoading>
                <InlineLoading label={t("library.loadingMore")} />
              </DelayedLoading>
            </div>
          ) : null;
        }
        const failedRange = entry
          ? undefined
          : props.failedRanges?.find(
              (range) => virtualItem.index === range.end - 1,
            );

        return (
          <div
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            role={entry || failedRange ? "listitem" : undefined}
            aria-posinset={entry ? virtualItem.index + 1 : undefined}
            aria-setsize={entry ? setSize : undefined}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              minHeight: `${rowMinHeight(virtualItem.index)}px`,
              transform: `translateY(${virtualItem.start - scrollMargin}px)`,
            }}
          >
            {entry ? (
              renderEntry(entry, virtualItem.index, false)
            ) : failedRange ? (
              <div className="flex h-full items-center justify-center">
                {renderLoadEarlier(failedRange)}
              </div>
            ) : (
              <LibraryBrowsePlaceholderRow
                textZoomed={textZoomed}
                minHeight={rowHeight}
                leadingInset={
                  virtualItem.index === 0 ? leadingInset : undefined
                }
                hasDivider={
                  props.hasNextPage ||
                  virtualItem.index < props.entries.length - 1
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
});
