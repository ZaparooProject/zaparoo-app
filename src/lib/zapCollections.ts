import type { Deck, MediaBrowseEntry } from "@/lib/models";
import type { ZapCollectionName } from "@/lib/zapLayout";

/** The translation key for a library collection's own name. */
export const ZAP_COLLECTION_LABELS: Record<ZapCollectionName, string> = {
  top: "library.topPlayed",
  liked: "library.liked",
  disliked: "library.disliked",
  playLater: "library.playLater",
};

/** The media a deck links to; cards and scripts with no media have no cover. */
export function deckMediaEntries(deck: Deck | undefined): MediaBrowseEntry[] {
  return (deck?.items ?? []).flatMap((item) =>
    item.media?.system.trim() && item.media.path.trim()
      ? [
          {
            type: "media" as const,
            name: item.media.name || item.name,
            path: item.media.path,
            systemId: item.media.system,
            systemIds: [item.media.system],
          },
        ]
      : [],
  );
}
