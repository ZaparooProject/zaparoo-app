import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FolderIcon, HeartIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
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
import { useHapticPress } from "@/hooks/useHapticPress";
import { TagList } from "@/components/TagList";
import { LibraryArtworkFrame } from "@/components/library/LibraryArtworkFrame";
import { libraryMediaRowBoxStyle } from "@/components/library/libraryMediaRowGeometry";

function AdaptiveLibraryTitle({
  title,
  allowWrap,
}: {
  title: string;
  allowWrap: boolean;
}) {
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
          "leading-5": allowWrap,
          "line-clamp-2 text-sm leading-4": compact && !allowWrap,
          "truncate leading-5": !compact && !allowWrap,
        })}
      >
        {title}
      </span>
    </span>
  );
}

/**
 * The artwork row for one Library media entry or folder: thumbnail, title,
 * muted system/detail lines, tag summary, favourite mark and chevron. Every
 * Library list (browse, collections, search results) renders its rows here.
 */
export function LibraryMediaRow(props: {
  entry: MediaBrowseEntry;
  systemId: string;
  deviceKey: string;
  showFilenames: boolean;
  corePlatform: string | null;
  imagesPaused: boolean;
  interactionDisabled: boolean;
  deferImages: boolean;
  textZoomed: boolean;
  minHeight: number;
  leadingInset?: number;
  hasDivider: boolean;
  showSystemName: boolean;
  detail?: string;
  selected: boolean;
  onSelect: (entry: MediaBrowseEntry) => void;
}) {
  const { t } = useTranslation();
  const resolveSystemName = useSystemNameResolver();
  const handleHapticPress = useHapticPress("light", !props.interactionDisabled);
  const rowSystemId = entrySystemId(props.entry, props.systemId);
  const entry = props.entry;
  const isFolder = isPlainFolderEntry(entry);
  const rowRef = useRef<HTMLButtonElement>(null);
  const [imageVisible, setImageVisible] = useState(
    () => !props.deferImages || typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    if (!props.deferImages) return;

    const row = rowRef.current;
    if (!row || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((observed) => observed.isIntersecting)) {
        setImageVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, [props.deferImages]);

  return (
    <button
      ref={rowRef}
      type="button"
      className={classNames(
        "library-browse-row focus-visible:ring-ring flex w-full items-center gap-3 px-1 py-3 text-left focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed",
        {
          "h-full": !props.textZoomed,
          "border-border border-b": props.hasDivider,
        },
      )}
      style={libraryMediaRowBoxStyle(props.minHeight, props.leadingInset)}
      disabled={props.interactionDisabled}
      aria-current={props.selected ? "true" : undefined}
      onPointerUp={handleHapticPress}
      onClick={() => props.onSelect(entry)}
    >
      {isFolder ? (
        <span
          className="text-foreground-hint bg-surface-highlight flex h-16 w-16 shrink-0 items-center justify-center rounded-md"
          aria-hidden="true"
        >
          <FolderIcon size={24} />
        </span>
      ) : (
        <LibraryArtworkFrame
          entry={entry}
          systemId={rowSystemId}
          deviceKey={props.deviceKey}
          maxSize={128}
          priority="thumbnail"
          enabled={!props.imagesPaused && (!props.deferImages || imageVisible)}
          compact
          className="size-16"
        />
      )}
      <span
        className={classNames("flex min-w-0 flex-1 flex-col", {
          "overflow-hidden": !props.textZoomed,
        })}
      >
        <AdaptiveLibraryTitle
          allowWrap={props.textZoomed}
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
              <span
                className={classNames("text-muted-foreground text-sm", {
                  truncate: !props.textZoomed,
                })}
              >
                {resolveSystemName(
                  rowSystemId,
                  entry.systemName || rowSystemId,
                )}
              </span>
            )}
            {props.detail && (
              <span
                className={classNames("text-muted-foreground text-sm", {
                  truncate: !props.textZoomed,
                })}
              >
                {props.detail}
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
          <span role="img" aria-label={t("library.favorite")}>
            <HeartIcon size={18} fill="currentColor" aria-hidden="true" />
          </span>
        )}
        <span aria-hidden="true" className="text-muted-foreground shrink-0">
          <NextIcon size="20" />
        </span>
      </span>
    </button>
  );
}
