import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FolderIcon, Heart } from "lucide-react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useStatusStore } from "@/lib/store";
import {
  compactLibraryTag,
  entrySystemId,
  hasFavoriteTag,
  isPlainFolderEntry,
  libraryEntryDisplayName,
  libraryEntryTags,
} from "@/lib/libraryMedia";
import type { MediaBrowseEntry } from "@/lib/models";
import { NextIcon } from "@/lib/images";
import { useSystemNameResolver } from "@/hooks/useSystemName";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { DelayedLoading } from "@/components/DelayedLoading";
import { useInitialPageScrollOffset } from "@/lib/pageScrollContext";
import { TagList } from "@/components/TagList";
import { LibraryArtwork } from "@/components/library/LibraryArtwork";

const ROW_HEIGHT = 88;

function AdaptiveLibraryTitle({ title }: { title: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const update = () =>
      setCompact(measure.scrollWidth > container.clientWidth);
    const frame = requestAnimationFrame(update);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(container);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [title]);

  return (
    <span ref={containerRef} className="relative w-full min-w-0">
      <span
        ref={measureRef}
        className="pointer-events-none invisible absolute font-semibold whitespace-nowrap"
        aria-hidden="true"
      >
        {title}
      </span>
      <span
        className={classNames("font-semibold break-words", {
          "line-clamp-2 text-sm leading-4": compact,
          "truncate leading-5": !compact,
        })}
      >
        {title}
      </span>
    </span>
  );
}

function LibraryBrowseRow(props: {
  entry: MediaBrowseEntry;
  systemId: string;
  targetDeviceAddress: string;
  showFilenames: boolean;
  corePlatform: string | null;
  imagesPaused: boolean;
  interactionDisabled: boolean;
  hasDivider: boolean;
  showSystemName: boolean;
  onSelect: (entry: MediaBrowseEntry) => void;
}) {
  const { t } = useTranslation();
  const resolveSystemName = useSystemNameResolver();
  const rowSystemId = entrySystemId(props.entry, props.systemId);
  const entry = props.entry;
  const isFolder = isPlainFolderEntry(entry);

  return (
    <button
      type="button"
      className={classNames(
        "flex h-full w-full items-center gap-3 px-1 py-3 text-left focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none disabled:cursor-not-allowed",
        { "border-b border-white/25": props.hasDivider },
      )}
      disabled={props.interactionDisabled}
      onClick={() => props.onSelect(entry)}
    >
      {isFolder ? (
        <span
          className="text-foreground-hint flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-white/5"
          aria-hidden="true"
        >
          <FolderIcon size={28} />
        </span>
      ) : (
        <LibraryArtwork
          entry={entry}
          systemId={rowSystemId}
          targetDeviceAddress={props.targetDeviceAddress}
          maxSize={128}
          priority="thumbnail"
          enabled={!props.imagesPaused}
          className="h-16 w-16 shrink-0 object-contain"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AdaptiveLibraryTitle
          title={libraryEntryDisplayName(
            entry,
            props.showFilenames,
            props.corePlatform,
          )}
        />
        {isFolder ? (
          entry.fileCount !== undefined && (
            <span className="text-muted-foreground text-sm">
              {t("library.fileCount", { count: entry.fileCount })}
            </span>
          )
        ) : (
          <>
            {props.showSystemName && rowSystemId && (
              <span className="text-muted-foreground truncate text-sm">
                {resolveSystemName(
                  rowSystemId,
                  entry.systemName || rowSystemId,
                )}
              </span>
            )}
            <TagList
              tags={libraryEntryTags(entry)}
              preserveOrder
              formatTag={compactLibraryTag}
            />
          </>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {!isFolder && hasFavoriteTag(entry.tags) && (
          <span aria-label={t("library.favorite")}>
            <Heart size={18} fill="currentColor" aria-hidden="true" />
          </span>
        )}
        <span aria-hidden="true">
          <NextIcon size="20" />
        </span>
      </span>
    </button>
  );
}

export interface LibraryBrowseListHandle {
  scrollToIndex: (index: number) => void;
}

export const LibraryBrowseList = forwardRef<
  LibraryBrowseListHandle,
  {
    entries: MediaBrowseEntry[];
    systemId: string;
    targetDeviceAddress: string;
    scrollRef: RefObject<HTMLDivElement | null>;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    imagesPaused: boolean;
    interactionDisabled: boolean;
    onFetchMore: () => void;
    onSelect: (entry: MediaBrowseEntry) => void;
    showSystemName?: boolean;
    ariaLabel?: string;
  }
>(function LibraryBrowseList(props, ref) {
  const { t } = useTranslation();
  const showFilenames = usePreferencesStore((state) => state.showFilenames);
  const corePlatform = useStatusStore((state) => state.corePlatform);
  const rowHeight = props.showSystemName ? 104 : ROW_HEIGHT;
  const initialScrollOffset = useInitialPageScrollOffset();
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual exposes imperative functions that React Compiler cannot memoize safely.
  const virtualizer = useVirtualizer({
    count: props.entries.length + (props.hasNextPage ? 1 : 0),
    getScrollElement: () => props.scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 2,
    initialOffset: initialScrollOffset,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const fetchMore = props.onFetchMore;

  useLayoutEffect(() => {
    // Cached route data can mount before TanStack Virtual's initial observer
    // update rerenders the list, so force one post-attachment range update.
    virtualizer.measure();
  }, [virtualizer]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex: (index: number) =>
        virtualizer.scrollToIndex(index, { align: "start" }),
    }),
    [virtualizer],
  );

  useEffect(() => {
    const lastItem = virtualItems.at(-1);
    if (
      lastItem &&
      lastItem.index >= props.entries.length - 5 &&
      props.hasNextPage &&
      !props.isFetchingNextPage
    ) {
      fetchMore();
    }
  }, [
    fetchMore,
    props.entries.length,
    props.hasNextPage,
    props.isFetchingNextPage,
    virtualItems,
  ]);

  return (
    <div
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
        return (
          <div
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            role="listitem"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {loading ? (
              props.isFetchingNextPage && (
                <DelayedLoading>
                  <div className="text-muted-foreground flex h-full items-center justify-center gap-2">
                    <LoadingSpinner size={16} className="text-primary" />
                    <span>{t("library.loadingMore")}</span>
                  </div>
                </DelayedLoading>
              )
            ) : entry ? (
              <LibraryBrowseRow
                entry={entry}
                systemId={props.systemId}
                targetDeviceAddress={props.targetDeviceAddress}
                showFilenames={showFilenames}
                corePlatform={corePlatform}
                imagesPaused={props.imagesPaused}
                interactionDisabled={props.interactionDisabled}
                showSystemName={props.showSystemName ?? false}
                hasDivider={
                  props.hasNextPage ||
                  virtualItem.index < props.entries.length - 1
                }
                onSelect={props.onSelect}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
});
