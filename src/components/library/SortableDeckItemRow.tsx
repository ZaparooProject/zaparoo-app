import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  GripVerticalIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DeckItem } from "@/lib/models";
import { useHapticPress } from "@/hooks/useHapticPress";
import { Button } from "@/components/wui/Button";
import { DeckArtwork } from "@/components/library/DeckArtwork";

export function SortableDeckItemRow({
  item,
  index,
  count,
  editable,
  busy,
  accessibleLists,
  onSelect,
  onMove,
}: {
  item: DeckItem;
  index: number;
  count: number;
  editable: boolean;
  busy: boolean;
  accessibleLists: boolean;
  onSelect: (item: DeckItem) => void;
  onMove: (index: number, target: number) => void;
}) {
  const { t } = useTranslation();
  const handleHapticPress = useHapticPress();
  const {
    attributes,
    listeners,
    isDragging,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id: item.id, disabled: !editable || busy });
  const name = item.name || item.cardId || t("decks.unnamedItem");
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  const movedRef = useRef<"up" | "down" | null>(null);
  // Moving re-inserts the row and can disable the pressed arrow, which drops
  // focus; keep it on this row's arrows so keyboard users can keep moving.
  useEffect(() => {
    const moved = movedRef.current;
    if (!moved) return;
    movedRef.current = null;
    const preferred = moved === "up" ? upRef.current : downRef.current;
    const fallback = moved === "up" ? downRef.current : upRef.current;
    (preferred && !preferred.disabled ? preferred : fallback)?.focus();
  }, [index]);

  const content = (
    <>
      <DeckArtwork item={item} />
      <span className="min-w-0">
        <span className="block font-medium break-words">{name}</span>
        <span className="text-muted-foreground block text-sm">
          {item.kind === "card"
            ? t("decks.card")
            : item.media
              ? item.media.system
              : t("decks.script")}
        </span>
      </span>
    </>
  );

  return (
    <li className="border-b border-white/25 last:border-b-0">
      <div
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          zIndex: isDragging ? 1 : undefined,
        }}
        className={`relative flex min-h-14 items-center gap-1 px-1 py-3 sm:gap-2 ${isDragging ? "bg-background opacity-30" : ""}`}
      >
        {editable && !accessibleLists && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            aria-label={t("decks.reorderItem", { name })}
            aria-roledescription={t("decks.reorderRole")}
            className="text-muted-foreground flex h-12 w-10 shrink-0 touch-none items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none sm:hidden"
            disabled={busy || count < 2}
          >
            <GripVerticalIcon size={20} aria-hidden="true" />
          </button>
        )}
        {editable ? (
          <div className="flex min-h-12 min-w-0 flex-1 items-center gap-3">
            {content}
          </div>
        ) : (
          <button
            type="button"
            className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
            onPointerUp={handleHapticPress}
            onClick={() => onSelect(item)}
          >
            {content}
            <ChevronRightIcon
              size={20}
              aria-hidden="true"
              className="text-muted-foreground ml-auto shrink-0"
            />
          </button>
        )}
        {editable && (
          <div
            className={
              accessibleLists
                ? "flex shrink-0 gap-1"
                : "hidden shrink-0 gap-1 sm:flex"
            }
          >
            <Button
              icon={<ArrowUpIcon size={18} />}
              variant="text"
              aria-label={t("decks.moveUp", { name })}
              ref={upRef}
              disabled={busy || index === 0}
              onClick={() => {
                movedRef.current = "up";
                onMove(index, index - 1);
              }}
            />
            <Button
              icon={<ArrowDownIcon size={18} />}
              variant="text"
              aria-label={t("decks.moveDown", { name })}
              ref={downRef}
              disabled={busy || index === count - 1}
              onClick={() => {
                movedRef.current = "down";
                onMove(index, index + 1);
              }}
            />
          </div>
        )}
      </div>
    </li>
  );
}
