import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  EyeIcon,
  GripVerticalIcon,
  PencilIcon,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/wui/Button";
import { ZapButtonFace } from "@/components/home/ZapButtonWidget";
import {
  zapButtonSpan,
  zapButtonWidgetId,
  type ZapButton,
  type ZapPlace,
} from "@/lib/zapLayout";

interface ZapButtonFrameProps {
  button: ZapButton;
  place: ZapPlace;
  index: number;
  count: number;
  accessibleLists: boolean;
  onMoveBy: (direction: -1 | 1) => void;
  onEdit: () => void;
  onShow: () => void;
}

/**
 * A custom button in the Zap page editor, drawn at its own width in the row it
 * would sit in, with the ways to move and change it underneath. Dragging is one
 * way to move it; earlier and later are the others.
 */
export function ZapButtonFrame({
  button,
  place,
  index,
  count,
  accessibleLists,
  onMoveBy,
  onEdit,
  onShow,
}: ZapButtonFrameProps) {
  const { t } = useTranslation();
  const name = button.label || t("zapLayout.buttonUnnamed");
  const hidden = place === "hidden";
  const {
    attributes,
    listeners,
    isDragging,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id: zapButtonWidgetId(button.id) });
  const earlierRef = useRef<HTMLButtonElement>(null);
  const laterRef = useRef<HTMLButtonElement>(null);
  const movedRef = useRef<"earlier" | "later" | null>(null);
  // Moving re-inserts the frame and can disable the pressed arrow, which drops
  // focus; keep it on this frame's arrows so keyboard users can keep moving.
  useEffect(() => {
    const moved = movedRef.current;
    if (!moved) return;
    movedRef.current = null;
    const preferred =
      moved === "earlier" ? earlierRef.current : laterRef.current;
    const fallback =
      moved === "earlier" ? laterRef.current : earlierRef.current;
    (preferred && !preferred.disabled ? preferred : fallback)?.focus();
  }, [place, index]);

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
      className="zap-widget-frame zap-button-frame"
      data-span={hidden ? 12 : zapButtonSpan(button)}
      data-hidden={hidden || undefined}
      data-dragging={isDragging || undefined}
    >
      {hidden ? (
        <p className="min-w-0 flex-1 font-semibold break-words">{name}</p>
      ) : (
        <div className="zap-button-frame-face" inert>
          <ZapButtonFace button={button} />
        </div>
      )}
      <div className="zap-button-frame-tools">
        {hidden ? (
          <Button
            icon={<EyeIcon size={20} />}
            variant="ghost"
            label={t("zapLayout.show")}
            aria-label={t("zapLayout.showWidget", { name })}
            onClick={onShow}
          />
        ) : (
          <>
            {!accessibleLists && (
              <button
                ref={setActivatorNodeRef}
                type="button"
                {...attributes}
                {...listeners}
                aria-label={t("zapLayout.reorder", { name })}
                aria-roledescription={t("zapLayout.reorderRole")}
                className="zap-tool-grip text-muted-foreground focus-visible:ring-ring mr-auto flex h-12 w-10 shrink-0 touch-none items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
              >
                <GripVerticalIcon size={20} aria-hidden="true" />
              </button>
            )}
            <Button
              icon={<ArrowLeftIcon size={20} />}
              variant="ghost"
              shape="square"
              ref={earlierRef}
              className="zap-tool-earlier"
              aria-label={t("zapLayout.moveEarlier", { name })}
              disabled={place === "main" && index === 0}
              onClick={() => {
                movedRef.current = "earlier";
                onMoveBy(-1);
              }}
            />
            <Button
              icon={<ArrowRightIcon size={20} />}
              variant="ghost"
              shape="square"
              ref={laterRef}
              className="zap-tool-later"
              aria-label={t("zapLayout.moveLater", { name })}
              disabled={place === "bottom" && index === count - 1}
              onClick={() => {
                movedRef.current = "later";
                onMoveBy(1);
              }}
            />
          </>
        )}
        <Button
          icon={<PencilIcon size={20} />}
          variant="ghost"
          className="zap-tool-edit"
          shape="square"
          aria-label={t("zapLayout.editButton", { name })}
          onClick={onEdit}
        />
      </div>
    </li>
  );
}

/**
 * The copy of a button that follows the pointer while it is dragged. It is as
 * tall as the frame it was lifted from, so the handle it was grabbed by stays
 * under the pointer.
 */
export function ZapButtonDragPreview({ button }: { button: ZapButton }) {
  return (
    <div className="zap-widget-frame zap-widget-frame-lifted zap-button-frame">
      <div className="zap-button-frame-face" inert>
        <ZapButtonFace button={button} />
      </div>
      <div className="zap-button-frame-tools" aria-hidden="true">
        <span className="text-muted-foreground mr-auto flex h-12 w-10 shrink-0 items-center justify-center">
          <GripVerticalIcon size={20} />
        </span>
        <Button
          decorative
          icon={<ArrowLeftIcon size={20} />}
          variant="ghost"
          shape="square"
        />
        <Button
          decorative
          icon={<ArrowRightIcon size={20} />}
          variant="ghost"
          shape="square"
        />
        <Button
          decorative
          icon={<PencilIcon size={20} />}
          variant="ghost"
          shape="square"
        />
      </div>
    </div>
  );
}
