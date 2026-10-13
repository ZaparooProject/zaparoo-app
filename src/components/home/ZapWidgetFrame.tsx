import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EyeIcon,
  EyeOffIcon,
  GripVerticalIcon,
  PencilIcon,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/wui/Button";
import type { ZapPlace, ZapWidgetId } from "@/lib/zapLayout";

interface ZapWidgetFrameProps {
  id: ZapWidgetId;
  name: string;
  place: ZapPlace;
  index: number;
  count: number;
  /** Plain-language reason the widget shows nothing on this device right now. */
  note?: string;
  accessibleLists: boolean;
  onMoveBy: (id: ZapWidgetId, direction: -1 | 1) => void;
  onHide: (id: ZapWidgetId) => void;
  onShow: (id: ZapWidgetId) => void;
  /** Opens the widget's own settings, for widgets that have some. */
  onEdit?: () => void;
}

/**
 * One built-in widget in the Zap page editor: its name and every way to move
 * it. Dragging is only one of them; each move also has a button so nothing
 * depends on a drag gesture, and the arrows carry a widget across places.
 */
export function ZapWidgetFrame({
  id,
  name,
  place,
  index,
  count,
  note,
  accessibleLists,
  onMoveBy,
  onHide,
  onShow,
  onEdit,
}: ZapWidgetFrameProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    isDragging,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id });
  const hidden = place === "hidden";
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  const movedRef = useRef<"up" | "down" | null>(null);
  // Moving re-inserts the frame and can disable the pressed arrow, which drops
  // focus; keep it on this frame's arrows so keyboard users can keep moving.
  useEffect(() => {
    const moved = movedRef.current;
    if (!moved) return;
    movedRef.current = null;
    const preferred = moved === "up" ? upRef.current : downRef.current;
    const fallback = moved === "up" ? downRef.current : upRef.current;
    (preferred && !preferred.disabled ? preferred : fallback)?.focus();
  }, [place, index]);

  const atStart = place === "main" && index === 0;
  const atEnd = place === "bottom" && index === count - 1;

  return (
    <li
      ref={setNodeRef}
      style={{
        // Translate only: the sorting strategy also scales an item to the size of
        // the slot it moves into, which morphs a card into a misshapen one when
        // widgets in a row differ in size.
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 1 : undefined,
      }}
      className="zap-widget-frame"
      data-hidden={hidden || undefined}
      data-dragging={isDragging || undefined}
    >
      <div className="zap-widget-frame-header">
        {!accessibleLists && !hidden && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            aria-label={t("zapLayout.reorder", { name })}
            aria-roledescription={t("zapLayout.reorderRole")}
            className="text-muted-foreground focus-visible:ring-ring flex h-12 w-10 shrink-0 touch-none items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
          >
            <GripVerticalIcon size={20} aria-hidden="true" />
          </button>
        )}
        <span className="flex-1 font-semibold break-words">{name}</span>
        {hidden ? (
          <Button
            icon={<EyeIcon size={20} />}
            variant="ghost"
            label={t("zapLayout.show")}
            aria-label={t("zapLayout.showWidget", { name })}
            onClick={() => onShow(id)}
          />
        ) : (
          <>
            <Button
              icon={<ArrowUpIcon size={20} />}
              variant="ghost"
              shape="square"
              ref={upRef}
              aria-label={t("zapLayout.moveUp", { name })}
              disabled={atStart}
              onClick={() => {
                movedRef.current = "up";
                onMoveBy(id, -1);
              }}
            />
            <Button
              icon={<ArrowDownIcon size={20} />}
              variant="ghost"
              shape="square"
              ref={downRef}
              aria-label={t("zapLayout.moveDown", { name })}
              disabled={atEnd}
              onClick={() => {
                movedRef.current = "down";
                onMoveBy(id, 1);
              }}
            />
            {onEdit && (
              <Button
                icon={<PencilIcon size={20} />}
                variant="ghost"
                shape="square"
                aria-label={t("zapLayout.editCollection", { name })}
                onClick={onEdit}
              />
            )}
            <Button
              icon={<EyeOffIcon size={20} />}
              variant="ghost"
              shape="square"
              aria-label={t("zapLayout.hideWidget", { name })}
              onClick={() => onHide(id)}
            />
          </>
        )}
      </div>
      {note && !hidden && (
        <p className="text-muted-foreground px-3 pb-3 text-sm" role="note">
          {note}
        </p>
      )}
    </li>
  );
}

/**
 * The copy of a widget that follows the pointer while it is dragged. The frame
 * it was lifted from stays in the list as an empty slot, and this copy is drawn
 * above the page rather than moved within it, so dragging off-screen never
 * grows the page.
 */
export function ZapWidgetDragPreview({
  name,
  note,
}: {
  name: string;
  note?: string;
}) {
  return (
    <div className="zap-widget-frame zap-widget-frame-lifted">
      <div className="zap-widget-frame-header">
        <span className="text-muted-foreground flex h-12 w-10 shrink-0 items-center justify-center">
          <GripVerticalIcon size={20} aria-hidden="true" />
        </span>
        <span className="flex-1 font-semibold break-words">{name}</span>
      </div>
      {note && (
        <p className="text-muted-foreground px-3 pb-3 text-sm">{note}</p>
      )}
    </div>
  );
}
