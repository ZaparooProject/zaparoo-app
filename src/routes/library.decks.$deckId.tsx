import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  PencilIcon,
  XIcon,
  LockIcon,
  ListIcon,
  PlayIcon,
  PlusIcon,
  ShareIcon,
  GripVerticalIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CoreAPI, isTransientApiConnectionError } from "@/lib/coreApi";
import {
  canEditDeck,
  MAX_DECK_ITEMS,
  mediaDeckItem,
  refreshDecks,
} from "@/lib/decks";
import {
  LIBRARY_QUERY_KEYS,
  searchResultToBrowseEntry,
} from "@/lib/libraryMedia";
import { logger } from "@/lib/logger";
import { appBackNavigationOptions } from "@/lib/tabSessionStore";
import { useStatusStore } from "@/lib/store";
import {
  useNfcWriter,
  isWriteModalOpen,
  WriteAction,
  WriteMethod,
} from "@/lib/writeNfcHook";
import { usePreferencesStore } from "@/lib/preferencesStore";
import type {
  DeckItem,
  DeckUpdateParams,
  SearchResultGame,
} from "@/lib/models";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { useNfcWriteAvailable } from "@/hooks/useNfcWriteAvailable";
import { useAccessibleLists } from "@/hooks/useAccessibleLists";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { PageFrame } from "@/components/PageFrame";
import { WriteModal } from "@/components/WriteModal";
import { SlideModal } from "@/components/SlideModal";
import { MediaSearchModal } from "@/components/MediaSearchModal";
import { DeckMarkdown } from "@/components/library/DeckMarkdown";
import { DeckDescriptionInput } from "@/components/library/DeckDescriptionInput";
import { DeckItemDetailsModal } from "@/components/library/DeckItemDetailsModal";
import { DeckShareModal } from "@/components/library/DeckShareModal";
import { SortableDeckItemRow } from "@/components/library/SortableDeckItemRow";
import { DeckArtwork } from "@/components/library/DeckArtwork";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { ModalActionRail } from "@/components/wui/ModalActionRail";
import { TextInput } from "@/components/wui/TextInput";
import { Button } from "@/components/wui/Button";
import { EmptyState } from "@/components/wui/EmptyState";
import { BackIcon, CreateIcon } from "@/lib/images";

export const Route = createFileRoute("/library/decks/$deckId")({
  component: DeckDetails,
});

export function DeckDetails() {
  const { deckId } = Route.useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const accessibleLists = useAccessibleLists();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const queryClient = useQueryClient();
  const deviceKey = useActiveDeviceKey();
  const connected = useStatusStore((state) => state.connected);
  const showFilenames = usePreferencesStore((state) => state.showFilenames);
  const writeAvailable = useNfcWriteAvailable(deviceKey, connected);
  const preferRemoteWriter = usePreferencesStore(
    (state) => state.preferRemoteWriter,
  );
  const writer = useNfcWriter(WriteMethod.Auto, preferRemoteWriter);
  const [writeIntent, setWriteIntent] = useState(false);
  const writeOpen = isWriteModalOpen(writeIntent, writer);
  const feature = useCoreFeature("decks", { requireKnownSupport: true });
  const deckQuery = useQuery({
    queryKey: [LIBRARY_QUERY_KEYS.decks, deviceKey, deckId],
    queryFn: ({ signal }) => CoreAPI.deckGet(deckId, signal),
    enabled: connected && Boolean(deviceKey) && feature.available,
    refetchOnMount: "always",
    retry: (failureCount, error) =>
      failureCount < 1 && isTransientApiConnectionError(error),
  });
  const deck = deckQuery.data;
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    deck?.name ?? t("decks.title"),
  );
  const [editing, setEditing] = useState(false);
  const editNameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mediaSearchOpen, setMediaSearchOpen] = useState(false);
  const pageScrollRef = useRef<HTMLDivElement>(null);
  const [addedItemScroll, setAddedItemScroll] = useState(0);
  useEffect(() => {
    if (addedItemScroll === 0) return;
    const page = pageScrollRef.current;
    if (page) page.scrollTop = page.scrollHeight;
  }, [addedItemScroll]);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removeItem, setRemoveItem] = useState<DeckItem | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [itemDetailsOpen, setItemDetailsOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const [pendingOrder, setPendingOrder] = useState<{
    deckId: string;
    items: DeckItem[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (editing) editNameRef.current?.focus();
  }, [editing]);
  const cancelEdit = () => {
    if (busy) return;
    setEditing(false);
    setPendingOrder(null);
    setActiveDragId(null);
  };
  const goBack = () => void navigate(appBackNavigationOptions("/library"));

  const update = async (params: Omit<DeckUpdateParams, "deckId">) => {
    if (!deck || !connected || !canEditDeck(deck) || busy) return false;
    setBusy(true);
    try {
      const updated = await CoreAPI.deckUpdate({ deckId, ...params });
      await refreshDecks(queryClient, deviceKey, updated);
      setEditing(false);
      setPendingOrder(null);
      setActiveDragId(null);
      return true;
    } catch (error) {
      logger.error("Failed to update deck", error, {
        category: "api",
        action: "deckUpdate",
      });
      toast.error(t("decks.updateError"));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const addMedia = async (result: SearchResultGame) => {
    if (
      !deck ||
      !connected ||
      !canEditDeck(deck) ||
      deck.itemCount >= MAX_DECK_ITEMS ||
      busy
    )
      return;
    setBusy(true);
    setMediaSearchOpen(false);
    try {
      const entry = searchResultToBrowseEntry(result);
      const updated = await CoreAPI.deckUpdate({
        deckId,
        addItems: [mediaDeckItem(entry, showFilenames)],
      });
      await refreshDecks(queryClient, deviceKey, updated);
      setAddedItemScroll((value) => value + 1);
    } catch (error) {
      logger.error("Failed to add media to deck", error, {
        category: "api",
        action: "deckAddMedia",
      });
      setMediaSearchOpen(true);
      toast.error(t("decks.addError"));
    } finally {
      setBusy(false);
    }
  };
  const removeDeck = async () => {
    if (!deck || !connected || deck.locked || busy) return;
    setBusy(true);
    try {
      await CoreAPI.deckDelete(deckId);
      await refreshDecks(queryClient, deviceKey);
      queryClient.removeQueries({
        queryKey: [LIBRARY_QUERY_KEYS.decks, deviceKey, deckId],
        exact: true,
      });
      setConfirmDelete(false);
      goBack();
    } catch (error) {
      logger.error("Failed to delete deck", error, {
        category: "api",
        action: "deckDelete",
      });
      toast.error(t("decks.deleteError"));
    } finally {
      setBusy(false);
    }
  };
  const playScript = deck ? `**playlist.play:deck://${deck.deckId}` : "";
  const openDeck = async () => {
    if (!connected || opening) return;
    setOpening(true);
    try {
      await CoreAPI.deckOpen(deckId);
    } catch (error) {
      logger.error("Failed to open deck", error, {
        category: "api",
        action: "deckOpen",
      });
      toast.error(t("decks.openError"));
    } finally {
      setOpening(false);
    }
  };
  const playDeck = async () => {
    if (!deck || !connected || playing || opening) return;
    setPlaying(true);
    try {
      await CoreAPI.run({ text: playScript });
    } catch (error) {
      logger.error("Failed to play deck", error, {
        category: "api",
        action: "playDeck",
      });
      toast.error(t("decks.playError"));
    } finally {
      setPlaying(false);
    }
  };
  const writeDeck = () => {
    if (!deck || !connected || !writeAvailable) return;
    setWriteIntent(true);
    void writer.write(WriteAction.Write, playScript).catch((error) => {
      logger.error("Failed to write deck", error, {
        category: "nfc",
        action: "writeDeck",
      });
    });
  };
  const writeItem = (text: string) => {
    if (!deck || !connected || !writeAvailable) return;
    setWriteIntent(true);
    void writer.write(WriteAction.Write, text).catch((error) => {
      logger.error("Failed to write deck item", error, {
        category: "nfc",
        action: "writeDeckItem",
      });
    });
  };
  const items =
    pendingOrder?.deckId === deckId ? pendingOrder.items : (deck?.items ?? []);
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;
  const activeDragItem = items.find((item) => item.id === activeDragId);
  const editable = Boolean(connected && deck && canEditDeck(deck));
  const moveItem = (from: number, to: number) => {
    if (
      !editable ||
      !editing ||
      busy ||
      from < 0 ||
      to < 0 ||
      from >= items.length ||
      to >= items.length ||
      from === to
    )
      return;
    const reordered = arrayMove(items, from, to);
    setPendingOrder({ deckId, items: reordered });
  };
  const dragAnnouncement = (
    key: "dragStart" | "dragOver" | "dragEnd" | "dragCancel",
    activeId: UniqueIdentifier,
    overId?: UniqueIdentifier,
  ) => {
    const item = items.find(({ id }) => id === activeId);
    const position = items.findIndex(({ id }) => id === (overId ?? activeId));
    return t(`decks.${key}`, {
      name: item?.name || item?.cardId || t("decks.unnamedItem"),
      position: position + 1,
      count: items.length,
    });
  };
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDragId(null);
    if (!over) return;
    moveItem(
      items.findIndex((item) => item.id === active.id),
      items.findIndex((item) => item.id === over.id),
    );
  };

  return (
    <>
      <PageFrame
        scrollRef={pageScrollRef}
        onSwipeBack={goBack}
        headerLeft={
          <HeaderButton
            onClick={goBack}
            icon={<BackIcon size="24" />}
            aria-label={t("nav.back")}
          />
        }
        headerCenter={
          <div className="flex min-w-0 items-center gap-2">
            <h1
              ref={headingRef}
              className="text-foreground min-w-0 truncate text-xl"
            >
              {deck?.name ?? t("decks.title")}
            </h1>
            {deck && (!deck.owned || deck.locked) && (
              <span
                role="img"
                aria-label={t(deck.locked ? "decks.locked" : "decks.readOnly")}
                className="text-muted-foreground shrink-0"
              >
                <LockIcon size={18} aria-hidden="true" />
              </span>
            )}
          </div>
        }
        headerRight={
          editable ? (
            <HeaderButton
              icon={editing ? <XIcon size={20} /> : <PencilIcon size={20} />}
              aria-label={t(editing ? "nav.cancel" : "decks.edit")}
              disabled={busy}
              onClick={() => {
                if (editing) {
                  cancelEdit();
                  return;
                }
                setPendingOrder(null);
                setName(deck!.name);
                setDescription(deck!.description);
                setEditing(true);
              }}
            />
          ) : undefined
        }
      >
        {!connected ? (
          <EmptyState title={t("library.disconnected")} />
        ) : !feature.available ? (
          <EmptyState
            title={t("library.updateCore")}
            description={t("features.requiresCoreVersion", {
              version: feature.requiredVersion,
            })}
          />
        ) : deckQuery.isLoading ? (
          <p role="status" className="text-muted-foreground">
            {t("decks.loading")}
          </p>
        ) : deckQuery.isError || !deck ? (
          <EmptyState
            title={t("decks.loadError")}
            action={
              <Button
                label={t("library.tryAgain")}
                variant="outline"
                onClick={() => void deckQuery.refetch()}
              />
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {editing && editable ? (
              <div className="flex flex-col gap-4">
                <TextInput
                  ref={editNameRef}
                  label={t("decks.name")}
                  value={name}
                  setValue={setName}
                  maxLength={100}
                  required
                />
                <DeckDescriptionInput
                  value={description}
                  onChange={setDescription}
                />
              </div>
            ) : deck.description ? (
              <DeckMarkdown>{deck.description}</DeckMarkdown>
            ) : null}
            {!editing && (
              <ModalActionRail
                aria-label={t("decks.actions")}
                itemWidth="content"
                actions={
                  <>
                    <Button
                      label={t("decks.open")}
                      icon={<ListIcon size={20} />}
                      variant="text"
                      layout="responsive"
                      className="whitespace-nowrap"
                      disabled={opening || playing || items.length === 0}
                      onClick={() => void openDeck()}
                    />
                    <Button
                      label={t("decks.play")}
                      icon={<PlayIcon size={20} />}
                      variant="text"
                      layout="responsive"
                      intent="primary"
                      className="whitespace-nowrap"
                      disabled={opening || playing || items.length === 0}
                      onClick={() => void playDeck()}
                    />
                    <Button
                      label={t("library.writeAction")}
                      icon={<CreateIcon size="20" />}
                      variant="text"
                      layout="responsive"
                      className="whitespace-nowrap"
                      disabled={!writeAvailable || opening || playing}
                      onClick={writeDeck}
                    />
                    <Button
                      label={t("decks.share")}
                      icon={<ShareIcon size={20} />}
                      variant="text"
                      layout="responsive"
                      className="whitespace-nowrap"
                      onClick={() => setShareOpen(true)}
                    />
                  </>
                }
              />
            )}
            {items.length === 0 ? (
              <EmptyState size="compact" title={t("decks.noItems")} />
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                accessibility={{
                  screenReaderInstructions: {
                    draggable: t("decks.dragInstructions"),
                  },
                  announcements: {
                    onDragStart: ({ active }) =>
                      dragAnnouncement("dragStart", active.id),
                    onDragOver: ({ active, over }) =>
                      over
                        ? dragAnnouncement("dragOver", active.id, over.id)
                        : undefined,
                    onDragEnd: ({ active, over }) =>
                      dragAnnouncement(
                        over ? "dragEnd" : "dragCancel",
                        active.id,
                        over?.id,
                      ),
                    onDragCancel: ({ active }) =>
                      dragAnnouncement("dragCancel", active.id),
                  },
                }}
                onDragStart={({ active }) => setActiveDragId(Number(active.id))}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setActiveDragId(null)}
              >
                <SortableContext
                  items={items.map(({ id }) => id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ol className="flex flex-col">
                    {items.map((item, index) => (
                      <SortableDeckItemRow
                        key={item.id}
                        item={item}
                        index={index}
                        count={items.length}
                        editable={editable && editing}
                        busy={busy}
                        accessibleLists={accessibleLists}
                        onSelect={(selected) => {
                          setSelectedItemId(selected.id);
                          setItemDetailsOpen(true);
                        }}
                        onMove={moveItem}
                      />
                    ))}
                  </ol>
                </SortableContext>
                <DragOverlay zIndex={40}>
                  {activeDragItem ? (
                    <div
                      aria-hidden="true"
                      className="bg-background flex min-h-14 items-center gap-1 px-1 py-3 sm:gap-2"
                    >
                      <span className="text-muted-foreground flex h-12 w-10 shrink-0 items-center justify-center">
                        <GripVerticalIcon size={20} />
                      </span>
                      <span className="flex min-w-0 flex-1 items-center gap-3">
                        <DeckArtwork item={activeDragItem} />
                        <span className="min-w-0 font-medium break-words">
                          {activeDragItem.name ||
                            activeDragItem.cardId ||
                            t("decks.unnamedItem")}
                        </span>
                      </span>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
            {editable && !editing && items.length < MAX_DECK_ITEMS && (
              <Button
                label={t("decks.addMedia")}
                icon={<PlusIcon size={20} />}
                intent="primary"
                className="w-full"
                disabled={busy}
                onClick={() => setMediaSearchOpen(true)}
              />
            )}
            {!editing && (
              <p className="text-muted-foreground text-center text-sm font-semibold">
                {t("decks.items", { count: items.length })}
              </p>
            )}
            {editing && editable && (
              <div className="flex flex-col gap-2">
                <Button
                  label={t("save")}
                  icon={<SaveIcon size={20} />}
                  intent="primary"
                  className="w-full"
                  disabled={!name.trim() || busy}
                  onClick={() =>
                    void update({
                      name: name.trim(),
                      description: description.trim(),
                      ...(pendingOrder?.deckId === deckId
                        ? { items: items.map(({ id }) => ({ id })) }
                        : {}),
                    })
                  }
                />
                <div className="flex gap-2">
                  <Button
                    label={t("nav.cancel")}
                    icon={<XIcon size={20} />}
                    variant="outline"
                    className="flex-1"
                    disabled={busy}
                    onClick={cancelEdit}
                  />
                  <Button
                    label={t("decks.delete")}
                    icon={<Trash2Icon size={20} />}
                    variant="outline"
                    intent="destructive"
                    className="border-error text-error flex-1"
                    disabled={busy}
                    onClick={() => setConfirmDelete(true)}
                  />
                </div>
              </div>
            )}
            {!deck.owned && !deck.locked && (
              <div className="mt-6">
                <Button
                  label={t("decks.delete")}
                  variant="outline"
                  intent="destructive"
                  className="border-error text-error w-full"
                  onClick={() => setConfirmDelete(true)}
                />
              </div>
            )}
          </div>
        )}
      </PageFrame>
      <MediaSearchModal
        isOpen={mediaSearchOpen}
        close={() => setMediaSearchOpen(false)}
        onSelectMedia={(result) => void addMedia(result)}
        onAddCustom={() => {
          setMediaSearchOpen(false);
          void navigate({
            to: "/library/decks/$deckId/add",
            params: { deckId },
            resetScroll: false,
          });
        }}
      />
      <DeckShareModal
        deckId={deckId}
        isOpen={shareOpen}
        close={() => setShareOpen(false)}
      />
      <DeckItemDetailsModal
        item={selectedItem}
        deckId={deckId}
        isOpen={itemDetailsOpen && selectedItem !== null}
        close={() => setItemDetailsOpen(false)}
        canRemove={editable}
        onRemove={setRemoveItem}
        writeAvailable={Boolean(connected && writeAvailable)}
        onWrite={writeItem}
      />
      {removeItem && (
        <SlideModal
          isOpen
          close={() => setRemoveItem(null)}
          title={t("decks.remove")}
        >
          <div className="flex flex-col gap-4 py-4">
            <p className="text-muted-foreground">
              {t("decks.confirmRemove", {
                name: removeItem.name || removeItem.cardId,
              })}
            </p>
            <div className="flex gap-2">
              <Button
                label={t("nav.cancel")}
                variant="outline"
                className="flex-1"
                onClick={() => setRemoveItem(null)}
              />
              <Button
                label={t("decks.remove")}
                variant="outline"
                intent="destructive"
                className="border-error text-error flex-1"
                disabled={busy}
                onClick={() => {
                  if (editing) {
                    setPendingOrder({
                      deckId,
                      items: items.filter(({ id }) => id !== removeItem.id),
                    });
                    setRemoveItem(null);
                    return;
                  }
                  void update({ removeItemIds: [removeItem.id] }).then(
                    (success) => {
                      if (success) setRemoveItem(null);
                    },
                  );
                }}
              />
            </div>
          </div>
        </SlideModal>
      )}
      <SlideModal
        isOpen={confirmDelete}
        close={() => setConfirmDelete(false)}
        title={t("decks.delete")}
      >
        <div className="flex flex-col gap-4 py-4">
          <p className="text-muted-foreground">
            {t("decks.confirmDelete", { name: deck?.name })}
          </p>
          <div className="flex gap-2">
            <Button
              label={t("nav.cancel")}
              variant="outline"
              className="flex-1"
              onClick={() => setConfirmDelete(false)}
            />
            <Button
              label={t("decks.delete")}
              variant="outline"
              intent="destructive"
              className="border-error text-error flex-1"
              disabled={busy}
              onClick={() => void removeDeck()}
            />
          </div>
        </div>
      </SlideModal>
      <WriteModal
        isOpen={writeOpen}
        close={() => {
          setWriteIntent(false);
          void writer.end();
        }}
        verifyError={writer.verifyError !== null}
        retry={() => void writer.retry()}
        retapRequired={writer.retapRequired}
      />
    </>
  );
}
