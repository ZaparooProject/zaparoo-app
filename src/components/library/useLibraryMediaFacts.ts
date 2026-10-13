import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  fetchLibraryMediaMeta,
  LIBRARY_QUERY_KEYS,
  mediaRefKey,
  type LibraryDetailFactType,
} from "@/lib/libraryMedia";
import { libraryTagDisplayLabel } from "@/lib/libraryTagLabels";
import type { MediaBrowseEntry, TagInfo } from "@/lib/models";

/** One cached metadata request per media, shared by every details surface. */
export function useLibraryMediaMeta(
  entry: MediaBrowseEntry | null,
  systemId: string,
  deviceKey: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [
      LIBRARY_QUERY_KEYS.meta,
      deviceKey,
      ...(entry ? mediaRefKey(entry, systemId) : [null, "", ""]),
    ],
    queryFn: ({ signal }) => {
      if (!entry) throw new Error("Media selection is unavailable");
      return fetchLibraryMediaMeta(entry, systemId, signal);
    },
    enabled: enabled && entry !== null,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
  });
}

/** Display value for one fact tag, with player counts spelled out. */
export function useLibraryFactValueLabel() {
  const { t } = useTranslation();
  return (type: LibraryDetailFactType, tag: TagInfo) => {
    const value = libraryTagDisplayLabel(tag, t);
    if (type !== "players") return value;
    const count = Number(value);
    return Number.isInteger(count) && count >= 0
      ? t("library.playerCount", { count })
      : t("library.playersValue", { value });
  };
}
