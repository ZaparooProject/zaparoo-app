import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PlusIcon } from "lucide-react";
import { CoreAPI } from "@/lib/coreApi";
import { canEditDeck, MAX_DECK_ITEMS } from "@/lib/decks";
import { LIBRARY_QUERY_KEYS } from "@/lib/libraryMedia";
import { useHapticPress } from "@/hooks/useHapticPress";
import { DelayedLoading } from "@/components/DelayedLoading";
import { InlineLoading } from "@/components/InlineLoading";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import { EmptyState } from "@/components/wui/EmptyState";
import { ModalActionBar } from "@/components/wui/ModalActionBar";
import { TextInput } from "@/components/wui/TextInput";
import { NextIcon } from "@/lib/images";
import type { LibraryAddToDeckFlow } from "@/components/library/useLibraryAddToDeck";

/** Deck picker and new-deck dialogs that take over from the details surface. */
export function LibraryAddToDeckModals({
  flow,
}: {
  flow: LibraryAddToDeckFlow;
}) {
  const { t } = useTranslation();
  const handleDeckPress = useHapticPress();
  const deckList = useQuery({
    queryKey: [LIBRARY_QUERY_KEYS.decks, flow.deviceKey],
    queryFn: ({ signal }) => CoreAPI.decks(signal),
    enabled:
      flow.pickerOpen &&
      flow.liveConnected &&
      flow.decksEnabled &&
      Boolean(flow.deviceKey),
  });
  const editableDecks = (deckList.data?.decks ?? []).filter(canEditDeck);
  const matchingDecks = editableDecks.filter((deck) =>
    deck.name.toLowerCase().includes(flow.search.trim().toLowerCase()),
  );

  return (
    <>
      <SlideModal
        isOpen={flow.pickerOpen && !flow.creating}
        close={flow.closePicker}
        title={t("decks.addAction")}
        footer={
          <Button
            label={t("decks.new")}
            icon={<PlusIcon size={20} />}
            variant="outline"
            className="w-full"
            disabled={flow.saving || !flow.liveConnected}
            disabledAppearance={flow.saving ? "busy" : "unavailable"}
            onClick={() => flow.setCreating(true)}
          />
        }
      >
        <div className="flex flex-col gap-3 py-2">
          <TextInput
            type="search"
            aria-label={t("decks.search")}
            placeholder={t("decks.search")}
            value={flow.search}
            setValue={flow.setSearch}
            clearable
          />
          {deckList.isLoading ? (
            <DelayedLoading>
              <InlineLoading label={t("decks.loading")} />
            </DelayedLoading>
          ) : deckList.isError ? (
            <EmptyState
              size="compact"
              title={t("decks.loadError")}
              action={
                <Button
                  label={t("library.tryAgain")}
                  variant="outline"
                  onClick={() => void deckList.refetch()}
                />
              }
            />
          ) : matchingDecks.length > 0 ? (
            <div
              role="group"
              aria-label={t("decks.title")}
              className="flex flex-col"
            >
              {matchingDecks.map((deck) => (
                <button
                  key={deck.deckId}
                  type="button"
                  className="border-border focus-visible:ring-ring flex min-h-14 w-full items-center justify-between gap-3 border-b px-1 py-3 text-left last:border-b-0 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    flow.saving ||
                    !flow.liveConnected ||
                    deck.itemCount >= MAX_DECK_ITEMS
                  }
                  onPointerUp={handleDeckPress}
                  onClick={() => void flow.add(deck.deckId)}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium break-words">{deck.name}</span>
                    <span className="text-muted-foreground text-sm">
                      {t("library.itemCount", { count: deck.itemCount })}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-muted-foreground shrink-0"
                  >
                    <NextIcon size="20" />
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              size="compact"
              title={t(flow.search.trim() ? "decks.noMatching" : "decks.empty")}
            />
          )}
        </div>
      </SlideModal>
      <SlideModal
        isOpen={flow.pickerOpen && flow.creating}
        close={() => flow.setCreating(false)}
        dismissible={!flow.saving}
        title={t("decks.new")}
        footer={
          <ModalActionBar
            secondaryAction={
              <Button
                label={t("nav.cancel")}
                variant="secondary"
                disabled={flow.saving}
                disabledAppearance="busy"
                onClick={() => flow.setCreating(false)}
              />
            }
            primaryAction={
              <Button
                label={t("decks.createAndAdd")}
                intent="primary"
                disabled={
                  !flow.newDeckName.trim() || flow.saving || !flow.liveConnected
                }
                disabledAppearance={flow.saving ? "busy" : "unavailable"}
                onClick={() => void flow.add()}
              />
            }
          />
        }
      >
        <div className="py-2">
          <TextInput
            label={t("decks.name")}
            value={flow.newDeckName}
            setValue={flow.setNewDeckName}
            maxLength={100}
            disabled={flow.saving}
            required
            onKeyUp={(event) => {
              if (event.key === "Enter") void flow.add();
            }}
          />
        </div>
      </SlideModal>
    </>
  );
}
