import type { QueryClient } from "@tanstack/react-query";
import { LIBRARY_QUERY_KEYS } from "@/lib/libraryMedia";
import {
  getDefaultMediaWriteValue,
  getMediaWritePath,
} from "@/lib/mediaWriteTarget";
import type {
  Deck,
  DeckItem,
  DeckItemInput,
  MediaBrowseEntry,
} from "@/lib/models";

export const MAX_DECK_ITEMS = 120;

export function mediaDeckItem(
  entry: MediaBrowseEntry,
  showFilenames: boolean,
): Exclude<DeckItemInput, { id: number }> {
  const zapscript = showFilenames
    ? getMediaWritePath(entry)
    : getDefaultMediaWriteValue(entry);
  if (!zapscript)
    throw new Error("Media result has no playable script or path");
  return { kind: "script", name: entry.name, zapscript };
}

export function deckItemLaunchText(
  item: DeckItem,
  deckId: string,
): string | null {
  if (item.kind === "script") {
    return item.zapscript?.trim() || null;
  }
  const scripts = item.scripts ?? [];
  if (scripts.length === 0) return null;
  if (scripts.length === 1) return scripts[0]?.zapscript.trim() || null;
  return `**playlist.open:${JSON.stringify({
    id: `deck://${deckId}/${item.cardId}`,
    name: item.name,
    items: scripts.map(({ name, zapscript }) => ({ name, zapscript })),
  })}`;
}

export function canEditDeck(deck: Deck): boolean {
  return deck.owned && !deck.locked;
}

export async function refreshDecks(
  queryClient: QueryClient,
  deviceKey: string,
  deck?: Deck,
): Promise<void> {
  if (deck) {
    queryClient.setQueryData(
      [LIBRARY_QUERY_KEYS.decks, deviceKey, deck.deckId],
      deck,
    );
  }
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: [LIBRARY_QUERY_KEYS.decks, deviceKey],
    }),
    queryClient.resetQueries({
      queryKey: [LIBRARY_QUERY_KEYS.favorites, deviceKey],
    }),
    queryClient.resetQueries({
      queryKey: [LIBRARY_QUERY_KEYS.collections, deviceKey],
    }),
    queryClient.invalidateQueries({
      queryKey: [LIBRARY_QUERY_KEYS.meta, deviceKey],
    }),
    queryClient.invalidateQueries({
      queryKey: [LIBRARY_QUERY_KEYS.browseIndex, deviceKey],
    }),
    queryClient.resetQueries({
      queryKey: [LIBRARY_QUERY_KEYS.browse, deviceKey],
    }),
    queryClient.resetQueries({ queryKey: ["infiniteMediaSearch"] }),
  ]);
}
