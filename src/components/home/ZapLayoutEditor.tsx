import { useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  type SortingStrategy,
} from "@dnd-kit/sortable";
import {
  GalleryHorizontalIcon,
  PlusIcon,
  RectangleHorizontalIcon,
} from "lucide-react";
import { Button } from "@/components/wui/Button";
import { Card } from "@/components/wui/Card";
import { CreateActionIcon } from "@/components/CreateActionIcon";
import { NextIcon } from "@/lib/images";
import { Select } from "@/components/wui/Select";
import {
  ZapButtonDragPreview,
  ZapButtonFrame,
} from "@/components/home/ZapButtonFrame";
import { ZapButtonEditor } from "@/components/home/ZapButtonEditor";
import { ZapCollectionEditor } from "@/components/home/ZapCollectionEditor";
import { ZAP_COLLECTION_LABELS } from "@/lib/zapCollections";
import { SlideModal } from "@/components/SlideModal";
import { useZapDecks } from "@/hooks/useZapDecks";
import { useEditorBar } from "@/components/home/useEditorBar";
import {
  ZapWidgetDragPreview,
  ZapWidgetFrame,
} from "@/components/home/ZapWidgetFrame";
import { useAccessibleLists } from "@/hooks/useAccessibleLists";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useAnnouncer } from "@/components/A11yAnnouncer";
import {
  deleteZapButton,
  deleteZapCollection,
  findZapPlace,
  hideZapWidget,
  moveZapWidget,
  moveZapWidgetBy,
  newZapButton,
  newZapButtonId,
  newZapCollection,
  saveZapButton,
  saveZapCollection,
  showZapWidget,
  zapButtonOf,
  zapCollectionOf,
  ZAP_PLACES,
  type ZapButton,
  type ZapCollection,
  type ZapLayout,
  type ZapPlace,
  type ZapWidgetId,
} from "@/lib/zapLayout";

const ZONE_PREFIX = "place:";

/** Widgets stay where the layout puts them; nothing slides to make room. */
const keepInPlace: SortingStrategy = () => null;

interface ZapLayoutEditorProps {
  layout: ZapLayout;
  onChange: (layout: ZapLayout) => void;
  onReset: () => void;
  onCancel: () => void;
  onDone: () => void;
  /** Widgets that show nothing right now, with the reason to tell the user. */
  notes: Partial<Record<ZapWidgetId, string>>;
  /** Other devices with a saved arrangement that this one can copy. */
  copySources: { id: string; name: string }[];
  onCopy: (deviceId: string) => void;
}

/**
 * Where a dragged widget would land follows the pointer, not the dragged card.
 * A tall card is grabbed by its handle at the bottom, so the card itself sits
 * well above the pointer; reading its edges instead of the pointer lands it
 * far from where the user is aiming. Over the gap between widgets (or an empty
 * place) the nearest widget of that place is used.
 */
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const found = hits.length > 0 ? hits : rectIntersection(args);
  const overId = getFirstCollision(found, "id");
  if (overId === null) return [];
  if (String(overId).startsWith(ZONE_PREFIX)) {
    const items = args.droppableContainers.filter(
      (container) =>
        container.id !== overId &&
        !String(container.id).startsWith(ZONE_PREFIX) &&
        args.droppableRects.get(container.id) &&
        container.data.current?.sortable?.containerId === overId,
    );
    if (items.length > 0) {
      const nearest = closestCenter({ ...args, droppableContainers: items });
      const first = nearest[0];
      if (first) return [first];
    }
  }
  return [{ id: overId }];
};

function PlaceZone({
  place,
  name,
  ids,
  children,
}: {
  place: ZapPlace;
  name: string;
  ids: ZapWidgetId[];
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const { setNodeRef } = useDroppable({ id: `${ZONE_PREFIX}${place}` });

  return (
    <section
      aria-labelledby={headingId}
      className="zap-editor-place"
      data-place={place}
    >
      <h2
        id={headingId}
        className="text-muted-foreground mb-2 font-bold capitalize"
      >
        {name}
      </h2>
      <SortableContext
        id={`${ZONE_PREFIX}${place}`}
        items={ids}
        strategy={keepInPlace}
      >
        <ul
          ref={setNodeRef}
          className="zap-editor-list"
          aria-labelledby={headingId}
        >
          {children}
          {ids.length === 0 && (
            <li className="text-muted-foreground zap-editor-empty text-sm">
              {place === "hidden"
                ? t("zapLayout.hiddenEmpty")
                : t("zapLayout.dropHere")}
            </li>
          )}
        </ul>
      </SortableContext>
    </section>
  );
}

/**
 * The Zap page while it is being arranged. Each place lists its widgets; a
 * widget moves by drag, by keyboard, by its arrows, or by choosing a place.
 */
function LayoutScreen({
  layout,
  onChange,
  onReset,
  onCancel,
  onDone,
  notes,
  copySources,
  onCopy,
  onOpenButton,
  onOpenCollection,
}: ZapLayoutEditorProps & {
  onOpenButton: (button: ZapButton, isNew: boolean, place: ZapPlace) => void;
  onOpenCollection: (
    collection: ZapCollection,
    isNew: boolean,
    place: ZapPlace,
  ) => void;
}) {
  const { t } = useTranslation();
  const accessibleLists = useAccessibleLists();
  const titleId = useId();
  const { rootRef, barRef } = useEditorBar();
  // A phone's bar has no room for the word, so Add is just its plus there.
  const roomyBar = useMediaQuery("(min-width: 480px)");
  const [activeId, setActiveId] = useState<ZapWidgetId | null>(null);
  // Dragging across places rearranges the layout as it goes, so cancelling
  // puts it back the way it was when the widget was picked up.
  const liftedFrom = useRef<ZapLayout | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const { decks } = useZapDecks();
  const { announce: sayMoved } = useAnnouncer();
  const widgetName = (id: ZapWidgetId) => {
    const button = zapButtonOf(layout, id);
    if (button) return button.label || t("zapLayout.buttonUnnamed");
    const collection = zapCollectionOf(layout, id);
    if (collection) {
      const { source } = collection;
      return (
        collection.title ||
        (source.kind === "deck"
          ? (decks.find((deck) => deck.deckId === source.deckId)?.name ??
            t("zapLayout.deckMissing"))
          : t(ZAP_COLLECTION_LABELS[source.collection]))
      );
    }
    return t(`zapLayout.widgets.${id}`);
  };
  const [choosing, setChoosing] = useState(false);
  // Dragging announces itself; a move by arrow button says where it landed.
  const announceMove = (next: ZapLayout, id: ZapWidgetId) => {
    const { place, index } = findZapPlace(next, id);
    sayMoved(
      t("zapLayout.moved", {
        name: widgetName(id),
        place: placeNames[place],
        position: index + 1,
        count: next.places[place].length,
      }),
    );
  };
  const placeNames: Record<ZapPlace, string> = {
    main: t("zapLayout.places.main"),
    side: t("zapLayout.places.side"),
    bottom: t("zapLayout.places.bottom"),
    hidden: t("zapLayout.places.hidden"),
  };

  const placeOf = (id: UniqueIdentifier): ZapPlace | null => {
    const key = String(id);
    if (key.startsWith(ZONE_PREFIX))
      return key.slice(ZONE_PREFIX.length) as ZapPlace;
    return (
      ZAP_PLACES.find((place) =>
        layout.places[place].includes(key as ZapWidgetId),
      ) ?? null
    );
  };

  // The layout is rearranged as the pointer passes over widgets, so the dashed
  // slot is always where the widget would land once dropped. Previewing the
  // move by sliding widgets into each other's boxes cannot be accurate when
  // the widgets in a row differ in size: the row reflows once it is real.
  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || over.id === active.id) return;
    const from = placeOf(active.id);
    const to = placeOf(over.id);
    if (!from || !to) return;
    const overKey = String(over.id);
    const overZone = overKey.startsWith(ZONE_PREFIX);
    if (from === to && overZone) return;
    const overIndex = overZone
      ? layout.places[to].length
      : layout.places[to].indexOf(overKey as ZapWidgetId);
    onChange(
      moveZapWidget(
        layout,
        active.id as ZapWidgetId,
        to,
        Math.max(0, overIndex),
      ),
    );
  };

  // The layout already follows the pointer, so dropping only has to settle:
  // a drop on nothing puts the widget back where it was picked up.
  const handleDragEnd = ({ over }: DragEndEvent) => {
    setActiveId(null);
    const lifted = liftedFrom.current;
    liftedFrom.current = null;
    if (!over && lifted) onChange(lifted);
  };

  const announce = (
    key: "dragStart" | "dragOver" | "dragEnd" | "dragCancel",
    activeId: UniqueIdentifier,
    overId?: UniqueIdentifier,
  ) => {
    const place = placeOf(overId ?? activeId);
    return t(`zapLayout.${key}`, {
      name: widgetName(activeId as ZapWidgetId),
      place: place ? placeNames[place] : "",
    });
  };

  return (
    <div
      ref={rootRef}
      className="zap-editor"
      aria-labelledby={titleId}
      role="region"
    >
      <div ref={barRef} className="zap-editor-bar">
        <Button
          variant="ghost"
          label={t("zapLayout.cancel")}
          onClick={onCancel}
        />
        <h2 id={titleId} className="zap-editor-title">
          {t("zapLayout.title")}
        </h2>
        <div className="zap-editor-bar-end">
          <Button
            variant="secondary"
            shape="square"
            icon={<PlusIcon size={20} />}
            label={roomyBar ? t("zapLayout.addButton") : undefined}
            aria-label={t("zapLayout.addButtonTitle")}
            onClick={() => setChoosing(true)}
          />
          <Button
            intent="primary"
            label={t("zapLayout.done")}
            onClick={onDone}
          />
        </div>
      </div>
      <div className="zap-editor-body">
        {/* The bar has no room for the title on a phone; it heads the page
            there instead. */}
        <h2 className="zap-editor-heading text-foreground text-xl">
          {t("zapLayout.title")}
        </h2>
        <p className="text-muted-foreground text-sm min-[1024px]:hidden">
          {t("zapLayout.stackNote")}
        </p>
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          accessibility={{
            screenReaderInstructions: {
              draggable: t("zapLayout.dragInstructions"),
            },
            announcements: {
              onDragStart: ({ active }) => announce("dragStart", active.id),
              onDragOver: ({ active, over }) =>
                over ? announce("dragOver", active.id, over.id) : undefined,
              onDragEnd: ({ active, over }) =>
                announce(over ? "dragEnd" : "dragCancel", active.id, over?.id),
              onDragCancel: ({ active }) => announce("dragCancel", active.id),
            },
          }}
          onDragStart={({ active }) => {
            liftedFrom.current = layout;
            setActiveId(active.id as ZapWidgetId);
          }}
          onDragOver={handleDragOver}
          onDragCancel={() => {
            if (liftedFrom.current) onChange(liftedFrom.current);
            liftedFrom.current = null;
            setActiveId(null);
          }}
          onDragEnd={handleDragEnd}
        >
          <div className="zap-editor-places">
            {ZAP_PLACES.map((place) => (
              <PlaceZone
                key={place}
                place={place}
                name={placeNames[place]}
                ids={layout.places[place]}
              >
                {layout.places[place].map((id, index) => {
                  const button = zapButtonOf(layout, id);
                  const count = layout.places[place].length;
                  const onMoveBy = (direction: -1 | 1) => {
                    const next = moveZapWidgetBy(layout, id, direction);
                    onChange(next);
                    announceMove(next, id);
                  };
                  if (button) {
                    return (
                      <ZapButtonFrame
                        key={id}
                        button={button}
                        place={place}
                        index={index}
                        count={count}
                        accessibleLists={accessibleLists}
                        onMoveBy={onMoveBy}
                        onEdit={() => onOpenButton(button, false, place)}
                        onShow={() => onChange(showZapWidget(layout, id))}
                      />
                    );
                  }
                  const collection = zapCollectionOf(layout, id);
                  return (
                    <ZapWidgetFrame
                      key={id}
                      id={id}
                      name={widgetName(id)}
                      onEdit={
                        collection
                          ? () => onOpenCollection(collection, false, place)
                          : undefined
                      }
                      place={place}
                      index={index}
                      count={count}
                      note={notes[id]}
                      accessibleLists={accessibleLists}
                      onMoveBy={(widget, direction) => {
                        const next = moveZapWidgetBy(layout, widget, direction);
                        onChange(next);
                        announceMove(next, widget);
                      }}
                      onHide={(widget) =>
                        onChange(hideZapWidget(layout, widget))
                      }
                      onShow={(widget) =>
                        onChange(showZapWidget(layout, widget))
                      }
                    />
                  );
                })}
              </PlaceZone>
            ))}
          </div>
          <DragOverlay>
            {activeId ? (
              zapButtonOf(layout, activeId) ? (
                <ZapButtonDragPreview
                  button={zapButtonOf(layout, activeId) as ZapButton}
                />
              ) : (
                <ZapWidgetDragPreview
                  name={widgetName(activeId)}
                  note={notes[activeId]}
                />
              )
            ) : null}
          </DragOverlay>
        </DndContext>
        <div className="zap-editor-reset">
          {copySources.length > 0 && (
            <Select
              className="min-h-12"
              aria-label={t("zapLayout.copyFrom")}
              value=""
              onChange={(event) => {
                if (event.target.value) onCopy(event.target.value);
              }}
            >
              <option value="" disabled>
                {t("zapLayout.copyFrom")}
              </option>
              {copySources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </Select>
          )}
          <Button
            variant="text"
            label={t("zapLayout.resetDefault")}
            onClick={onReset}
          />
        </div>
      </div>
      <SlideModal
        isOpen={choosing}
        close={() => setChoosing(false)}
        title={t("zapLayout.addChooserTitle")}
      >
        <div className="flex flex-col gap-3 pb-2">
          <Card
            onClick={() => {
              setChoosing(false);
              onOpenButton(newZapButton(newZapButtonId()), true, "main");
            }}
          >
            <div className="flex flex-row flex-wrap items-center gap-3">
              <CreateActionIcon icon={<RectangleHorizontalIcon size={20} />} />
              <div className="flex min-w-0 grow basis-[8rem] flex-col gap-1">
                <span className="font-semibold">
                  {t("zapLayout.addKindButton")}
                </span>
                <span className="text-muted-foreground text-sm leading-relaxed">
                  {t("zapLayout.addKindButtonHint")}
                </span>
              </div>
              <span
                aria-hidden="true"
                className="text-muted-foreground shrink-0"
              >
                <NextIcon size="20" />
              </span>
            </div>
          </Card>
          <Card
            onClick={() => {
              setChoosing(false);
              onOpenCollection(
                newZapCollection(newZapButtonId()),
                true,
                "bottom",
              );
            }}
          >
            <div className="flex flex-row flex-wrap items-center gap-3">
              <CreateActionIcon icon={<GalleryHorizontalIcon size={20} />} />
              <div className="flex min-w-0 grow basis-[8rem] flex-col gap-1">
                <span className="font-semibold">
                  {t("zapLayout.addKindCollection")}
                </span>
                <span className="text-muted-foreground text-sm leading-relaxed">
                  {t("zapLayout.addKindCollectionHint")}
                </span>
              </div>
              <span
                aria-hidden="true"
                className="text-muted-foreground shrink-0"
              >
                <NextIcon size="20" />
              </span>
            </div>
          </Card>
        </div>
      </SlideModal>
    </div>
  );
}

/**
 * The Zap page while it is being arranged. Each place lists its widgets; a
 * widget moves by drag, by keyboard, by its arrows, or by choosing a place. A
 * button opens its own screen in place of the arrangement, not a dialog on top
 * of it: ZapScript's pickers are dialogs, and a dialog opened over a dialog
 * would close it and lose what was typed.
 */
export function ZapLayoutEditor(props: ZapLayoutEditorProps) {
  const { layout, onChange } = props;
  const [editing, setEditing] = useState<
    | { kind: "button"; button: ZapButton; isNew: boolean; place: ZapPlace }
    | {
        kind: "collection";
        collection: ZapCollection;
        isNew: boolean;
        place: ZapPlace;
      }
    | null
  >(null);

  if (editing?.kind === "button") {
    return (
      <ZapButtonEditor
        button={editing.button}
        isNew={editing.isNew}
        onClose={() => setEditing(null)}
        onSave={(button) => {
          onChange(saveZapButton(layout, button, editing.place));
          setEditing(null);
        }}
        onDelete={(id) => {
          onChange(deleteZapButton(layout, id));
          setEditing(null);
        }}
      />
    );
  }

  if (editing?.kind === "collection") {
    return (
      <ZapCollectionEditor
        collection={editing.collection}
        isNew={editing.isNew}
        onClose={() => setEditing(null)}
        onSave={(collection) => {
          onChange(saveZapCollection(layout, collection, editing.place));
          setEditing(null);
        }}
        onDelete={(id) => {
          onChange(deleteZapCollection(layout, id));
          setEditing(null);
        }}
      />
    );
  }

  return (
    <LayoutScreen
      {...props}
      onOpenButton={(button, isNew, place) =>
        setEditing({ kind: "button", button, isNew, place })
      }
      onOpenCollection={(collection, isNew, place) =>
        setEditing({ kind: "collection", collection, isNew, place })
      }
    />
  );
}
