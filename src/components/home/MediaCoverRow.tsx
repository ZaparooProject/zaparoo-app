import { useId, type WheelEvent } from "react";
import { useTranslation } from "react-i18next";
import { LibraryArtworkFrame } from "@/components/library/LibraryArtworkFrame";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useTactilePress } from "@/hooks/useTactilePress";
import type { MediaBrowseEntry } from "@/lib/models";

interface MediaCoverRowProps {
  headingLabel: string;
  entries: MediaBrowseEntry[];
  onSelect: (entry: MediaBrowseEntry) => void;
}

interface MediaCoverTileProps {
  entry: MediaBrowseEntry;
  deviceKey: string;
  onSelect: (entry: MediaBrowseEntry) => void;
}

function MediaCoverTile({ entry, deviceKey, onSelect }: MediaCoverTileProps) {
  const { t } = useTranslation();
  const tactilePress = useTactilePress({ hasOnClick: true });

  return (
    <button
      type="button"
      data-pressable="true"
      data-pressed={tactilePress.pressed || undefined}
      className="wui-card border-border bg-card-pattern focus-visible:ring-ring flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-lg border border-solid p-0 text-left focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      onClick={() => {
        if (tactilePress.shouldFireClick()) onSelect(entry);
      }}
      aria-label={t("scan.coverRowDetails", { media: entry.name })}
      {...tactilePress.handlers}
    >
      <LibraryArtworkFrame
        entry={entry}
        systemId={entry.systemId ?? ""}
        deviceKey={deviceKey}
        maxSize={256}
        priority="thumbnail"
        className="aspect-[3/4] w-full rounded-none"
      />
      <span className="text-foreground min-h-14 px-2.5 py-2.5 text-sm leading-tight font-semibold">
        <span title={entry.name} className="line-clamp-2">
          {entry.name}
        </span>
      </span>
    </button>
  );
}

/** Shared horizontally scrolling cover row for recent and favourite media. */
export function MediaCoverRow({
  headingLabel,
  entries,
  onSelect,
}: MediaCoverRowProps) {
  const headingId = useId();
  const deviceKey = useActiveDeviceKey();

  if (entries.length === 0) return null;

  const handleHorizontalWheel = (event: WheelEvent<HTMLUListElement>) => {
    const row = event.currentTarget;
    if (row.scrollWidth <= row.clientWidth) return;

    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    const maxScroll = row.scrollWidth - row.clientWidth;
    const canScroll =
      delta < 0 ? row.scrollLeft > 0 : row.scrollLeft < maxScroll - 1;

    if (delta === 0 || !canScroll) return;
    event.preventDefault();
    row.scrollLeft += delta;
  };

  return (
    <section aria-labelledby={headingId}>
      <h2
        id={headingId}
        className="text-muted-foreground mb-2 font-bold capitalize"
      >
        {headingLabel}
      </h2>
      <ul
        className="-mx-4 flex w-[calc(100%+2rem)] snap-x scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-3 sm:mx-0 sm:w-full sm:scroll-px-0 sm:px-0"
        onWheel={handleHorizontalWheel}
      >
        {entries.map((entry) => (
          <li
            key={`${entry.systemId ?? ""}:${entry.path}`}
            className="w-32 shrink-0 snap-start"
          >
            <MediaCoverTile
              entry={entry}
              deviceKey={deviceKey}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
