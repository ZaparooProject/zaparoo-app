import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CoreAPI } from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";
import { systemHasIndexedMedia } from "@/lib/systemFilters";
import type { SessionSearchParams } from "@/lib/tabSessionStore";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { DEFAULT_LOADING_DELAY_MS } from "@/components/DelayedLoading";

export interface MediaSearchFormOptions {
  /** Draft filters shown before anything is submitted. */
  initialDraft?: Partial<SessionSearchParams>;
  /** A search to show results for straight away (restored or URL-seeded). */
  initialSearch?: SessionSearchParams | null;
  /** Tags every search here carries; never shown or edited as a filter. */
  fixedTags?: string[];
  /** Extra availability gate on top of connection and the media index. */
  available?: boolean;
  /** False while the form's surface is closed, to hold its systems request. */
  active?: boolean;
  /**
   * How a submitted tag search behaves on a Core without tag support. True
   * runs it without its tags once support is known to be missing; false holds
   * it, because the tags are the point of the search.
   */
  dropUnsupportedTags?: boolean;
  /** Show all systems when the chosen one is not indexed on this device. */
  resetUnavailableSystem?: boolean;
  /**
   * A search started: "submit" from the form, "apply" from a caller handing
   * over a complete search (such as a recent search).
   */
  onSearch?: (search: SessionSearchParams, source: "submit" | "apply") => void;
  /** The system or tag draft changed. */
  onFiltersChange?: (filters: { system: string; tags: string[] }) => void;
}

/**
 * Draft, gates and submitted state for the media search form shared by Create
 * search, the insert-media dialog and Library search. Callers own persistence
 * and selection through the callbacks.
 */
export function useMediaSearchForm(options: MediaSearchFormOptions = {}) {
  const {
    initialDraft,
    initialSearch = null,
    fixedTags = [],
    available = true,
    active = true,
    dropUnsupportedTags = false,
    resetUnavailableSystem = false,
    onSearch,
    onFiltersChange,
  } = options;
  const connected = useStatusStore((state) => state.connected);
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const coreVersionPending = useStatusStore(
    (state) => state.coreVersionPending,
  );
  const deviceKey = useActiveDeviceKey();
  const mediaTagsFeature = useCoreFeature("mediaTags", {
    requireKnownSupport: true,
  });
  const mediaTagsAvailable = mediaTagsFeature.available;
  const mediaTagsSupportKnown =
    !coreVersionPending && mediaTagsFeature.currentVersion !== null;
  const browseAllSearchAvailable = useCoreFeature("mediaBrowseAllSearch", {
    requireKnownSupport: true,
  }).available;
  // Core keeps exists true once committed systems are searchable during an
  // index; older versions report false until indexing finishes.
  const canUseSearch = connected && gamesIndex.exists && available;
  const systemsQuery = useQuery({
    queryKey: ["systems", deviceKey, { all: false }],
    queryFn: () => CoreAPI.systems(),
    enabled: connected && gamesIndex.exists && active,
    staleTime: 60 * 1000,
  });

  const [query, setQuery] = useState(initialDraft?.query ?? "");
  const [chosenSystem, setChosenSystem] = useState(
    initialDraft?.system ?? "all",
  );
  const [tags, setTagsState] = useState<string[]>(
    (initialDraft?.tags ?? []).filter((tag) => !fixedTags.includes(tag)),
  );
  const [searchParams, setSearchParams] = useState(initialSearch);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [systemSelectorOpen, setSystemSelectorOpen] = useState(false);
  const [tagSelectorOpen, setTagSelectorOpen] = useState(false);
  // The tag selector cannot outlive tag support (for example a device change).
  if (!mediaTagsAvailable && tagSelectorOpen) setTagSelectorOpen(false);

  const system =
    !resetUnavailableSystem ||
    chosenSystem === "all" ||
    !systemsQuery.data ||
    systemsQuery.data.systems.some(
      (candidate) =>
        candidate.id === chosenSystem && systemHasIndexedMedia(candidate),
    )
      ? chosenSystem
      : "all";
  const effectiveTags = mediaTagsAvailable ? tags : [];
  const withFixedTags = (searchTags: string[]) =>
    Array.from(new Set([...fixedTags, ...searchTags]));

  // Cores without browse-all search need a query, system or tag to search.
  const allowsSearch = (search: SessionSearchParams) =>
    canUseSearch &&
    (browseAllSearchAvailable ||
      search.query.trim() !== "" ||
      search.system !== "all" ||
      withFixedTags(search.tags).length > 0);
  const canSubmit = allowsSearch({ query, system, tags: effectiveTags });

  const submit = () => {
    if (!canSubmit) return;
    const search = { query: query.trim(), system, tags: effectiveTags };
    setSearchParams(search);
    onSearch?.(search, "submit");
  };

  const setSystem = (next: string) => {
    setChosenSystem(next);
    onFiltersChange?.({ system: next, tags });
  };

  const setTags = (next: string[]) => {
    setTagsState(next);
    onFiltersChange?.({ system, tags: next });
  };

  const clearFilters = () => {
    setChosenSystem("all");
    setTagsState([]);
    onFiltersChange?.({ system: "all", tags: [] });
  };

  /** Fill the form from a complete search and run it when it is allowed. */
  const apply = (search: SessionSearchParams) => {
    setQuery(search.query);
    setChosenSystem(search.system);
    setTagsState(search.tags);
    onFiltersChange?.({ system: search.system, tags: search.tags });
    if (!allowsSearch(search)) return;
    setSearchParams(search);
    onSearch?.(search, "apply");
  };

  const tagSupportSettled = dropUnsupportedTags
    ? mediaTagsSupportKnown
    : mediaTagsAvailable;
  const shownSearch =
    searchParams && (searchParams.tags.length === 0 || tagSupportSettled)
      ? {
          ...searchParams,
          tags: mediaTagsAvailable ? searchParams.tags : [],
        }
      : null;

  return {
    query,
    setQuery,
    system,
    setSystem,
    tags,
    setTags,
    clearFilters,
    submit,
    apply,
    canUseSearch,
    canSubmit,
    mediaTagsAvailable,
    systemsData: systemsQuery.data,
    resultsLoading,
    systemSelectorOpen,
    setSystemSelectorOpen,
    tagSelectorOpen,
    setTagSelectorOpen,
    /** Search props for VirtualSearchResults. */
    results: {
      query: shownSearch?.query ?? "",
      systems:
        shownSearch && shownSearch.system !== "all" ? [shownSearch.system] : [],
      tags: shownSearch ? withFixedTags(shownSearch.tags) : [],
      hasSearched: shownSearch !== null,
      searchSystem: shownSearch?.system ?? "all",
      searchTags: shownSearch?.tags ?? [],
      onLoadingChange: setResultsLoading,
      loadingDelayMs: DEFAULT_LOADING_DELAY_MS,
    },
  };
}

export type MediaSearchFormState = ReturnType<typeof useMediaSearchForm>;
