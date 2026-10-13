import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { MediaCoverRow } from "@/components/home/MediaCoverRow";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { CoreAPI } from "@/lib/coreApi";
import {
  LIBRARY_QUERY_KEYS,
  MEDIA_PREFERENCES,
  searchResultToBrowseEntry,
} from "@/lib/libraryMedia";
import {
  MEDIA_HISTORY_QUERY_KEYS,
  topEntryToBrowseEntry,
} from "@/lib/mediaHistory";
import { useStatusStore } from "@/lib/store";
import type { MediaBrowseEntry } from "@/lib/models";
import { deckMediaEntries, ZAP_COLLECTION_LABELS } from "@/lib/zapCollections";
import type { ZapCollection } from "@/lib/zapLayout";

/** Enough to be useful in one swipe, as the built-in rows are. */
const ROW_SIZE = 12;

const TAGGED = {
  liked: { tag: MEDIA_PREFERENCES.liked, scope: "liked" },
  disliked: { tag: MEDIA_PREFERENCES.disliked, scope: "disliked" },
  playLater: { tag: MEDIA_PREFERENCES.playlater, scope: "play-later" },
} as const;

interface RowProps {
  heading: string;
  onSelect: (entry: MediaBrowseEntry) => void;
}

function TaggedRow({
  name,
  heading,
  onSelect,
}: RowProps & { name: keyof typeof TAGGED }) {
  const connected = useStatusStore((state) => state.connected);
  const deviceKey = useActiveDeviceKey();
  const libraryFeature = useCoreFeature("mediaLibrary");
  const feature = useCoreFeature("mediaPreferences", {
    requireKnownSupport: true,
  });
  const { tag, scope } = TAGGED[name];
  const query = useQuery({
    queryKey: [LIBRARY_QUERY_KEYS.collections, deviceKey, scope, "home"],
    queryFn: ({ signal }) =>
      CoreAPI.mediaSearch(
        { query: "", systems: [], tags: [tag], maxResults: ROW_SIZE },
        signal,
      ),
    enabled:
      connected &&
      libraryFeature.available &&
      feature.available &&
      deviceKey !== "",
    staleTime: 30_000,
  });
  return (
    <MediaCoverRow
      headingLabel={heading}
      entries={(query.data?.results ?? []).map(searchResultToBrowseEntry)}
      onSelect={onSelect}
    />
  );
}

function TopRow({ heading, onSelect }: RowProps) {
  const connected = useStatusStore((state) => state.connected);
  const deviceKey = useActiveDeviceKey();
  const feature = useCoreFeature("mediaRecents", { requireKnownSupport: true });
  const query = useQuery({
    queryKey: [MEDIA_HISTORY_QUERY_KEYS.history, deviceKey, "top", "home"],
    queryFn: ({ signal }) =>
      CoreAPI.mediaHistoryTop({ limit: ROW_SIZE }, signal),
    enabled: connected && feature.available && deviceKey !== "",
    staleTime: 30_000,
  });
  return (
    <MediaCoverRow
      headingLabel={heading}
      entries={(query.data?.entries ?? []).map(topEntryToBrowseEntry)}
      onSelect={onSelect}
    />
  );
}

function DeckRow({
  deckId,
  title,
  onSelect,
}: {
  deckId: string;
  title: string;
  onSelect: (entry: MediaBrowseEntry) => void;
}) {
  const connected = useStatusStore((state) => state.connected);
  const deviceKey = useActiveDeviceKey();
  const feature = useCoreFeature("decks", { requireKnownSupport: true });
  const query = useQuery({
    queryKey: [LIBRARY_QUERY_KEYS.decks, deviceKey, deckId],
    queryFn: ({ signal }) => CoreAPI.deckGet(deckId, signal),
    enabled: connected && feature.available && deviceKey !== "",
    staleTime: 30_000,
    retry: false,
  });
  return (
    <MediaCoverRow
      headingLabel={title || query.data?.name || ""}
      entries={deckMediaEntries(query.data).slice(0, ROW_SIZE)}
      onSelect={onSelect}
    />
  );
}

/**
 * A row of covers from a library collection or a deck, chosen by the user.
 * Like the built-in Favorites and Recently played rows, it shows nothing while
 * it has nothing to show.
 */
export function ZapCollectionWidget({
  collection,
  onSelect,
}: {
  collection: ZapCollection;
  onSelect: (entry: MediaBrowseEntry) => void;
}) {
  const { t } = useTranslation();
  const { source } = collection;
  if (source.kind === "deck") {
    return (
      <DeckRow
        deckId={source.deckId}
        title={collection.title}
        onSelect={onSelect}
      />
    );
  }
  const heading =
    collection.title || t(ZAP_COLLECTION_LABELS[source.collection]);
  return source.collection === "top" ? (
    <TopRow heading={heading} onSelect={onSelect} />
  ) : (
    <TaggedRow name={source.collection} heading={heading} onSelect={onSelect} />
  );
}
