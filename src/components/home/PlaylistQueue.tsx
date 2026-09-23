import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useTactilePress } from "@/hooks/useTactilePress";
import type { PlaylistItemInfo, PlaylistState } from "@/lib/models";

function PlaylistQueueItem({
  item,
  index,
  total,
  current,
  disabled,
  onSelect,
}: {
  item: PlaylistItemInfo;
  index: number;
  total: number;
  current: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const { pressed, shouldFireClick, handlers } = useTactilePress({
    intent: "default",
    disabled,
    hasOnClick: true,
  });
  const label =
    item.name.trim() ||
    item.zapScript.trim() ||
    t("scan.playlistPosition", { current: index + 1, total });

  return (
    <li>
      <button
        type="button"
        aria-current={current ? "true" : undefined}
        disabled={disabled}
        data-pressed={pressed}
        className="wui-playlist-item border-bd-outline flex min-h-12 w-full touch-manipulation items-start gap-3 border-b border-solid px-3 py-3 text-left text-sm last:border-b-0 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => {
          if (shouldFireClick()) onSelect();
        }}
        {...handlers}
      >
        <span
          aria-hidden="true"
          className="text-muted-foreground w-5 shrink-0 text-right tabular-nums"
        >
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 break-words">{label}</span>
      </button>
    </li>
  );
}

interface PlaylistQueueProps {
  playlist: PlaylistState;
  connected: boolean;
  onSelect: (index: number) => void;
}

export function PlaylistQueue({
  playlist,
  connected,
  onSelect,
}: PlaylistQueueProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLOListElement>(null);
  const playlistPosition = playlist.total > 0 ? playlist.index + 1 : 0;

  useEffect(() => {
    const container = scrollRef.current;
    const current = currentRef.current?.querySelector<HTMLElement>(
      '[aria-current="true"]',
    );
    if (!container || !current) return;

    const headerHeight = headerRef.current?.offsetHeight ?? 0;
    const listViewportHeight = container.clientHeight - headerHeight;
    const centeredTop =
      current.offsetTop -
      headerHeight -
      (listViewportHeight - current.offsetHeight) / 2;
    container.scrollTop =
      centeredTop < current.offsetHeight / 2 ? 0 : Math.max(0, centeredTop);
  }, [playlist.id, playlist.index]);

  return (
    <div
      ref={scrollRef}
      role="region"
      aria-labelledby={headingId}
      // Scrollable regions must be keyboard-focusable.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      className="border-bd-filled bg-background mt-3 max-h-44 overflow-y-auto rounded-lg border border-solid shadow-inner"
    >
      <div
        ref={headerRef}
        className="border-bd-outline bg-surface-inset sticky top-0 z-10 flex min-h-11 items-center justify-between gap-3 border-b border-solid px-3 py-2"
      >
        <h3 id={headingId} className="min-w-0 truncate text-sm font-semibold">
          {playlist.name || playlist.id}
        </h3>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {t("scan.playlistPosition", {
            current: playlistPosition,
            total: playlist.total,
          })}
        </span>
      </div>
      <ol ref={currentRef}>
        {playlist.items.map((item, index) => (
          <PlaylistQueueItem
            key={`${index}:${item.zapScript}`}
            item={item}
            index={index}
            total={playlist.total}
            current={index === playlist.index}
            disabled={!connected}
            onSelect={() => onSelect(index)}
          />
        ))}
      </ol>
    </div>
  );
}
