import { getRouteApi, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Preferences } from "@capacitor/preferences";
import { Capacitor } from "@capacitor/core";
import { VirtualSearchResults } from "@/components/VirtualSearchResults.tsx";
import { BackToTop } from "@/components/BackToTop.tsx";
import { MediaDetailsModal } from "@/components/MediaDetailsModal";
import { logger } from "@/lib/logger";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import { CoreAPI, isExpectedMediaDatabaseError } from "@/lib/coreApi";
import { BackIcon, SearchIcon, HistoryIcon } from "@/lib/images";
import { useNfcWriter, WriteAction, WriteMethod } from "@/lib/writeNfcHook";
import { SearchResultGame, SystemsResponse } from "@/lib/models";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { Button } from "@/components/wui/Button";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
import { DEFAULT_GAMES_INDEX, useStatusStore } from "@/lib/store";
import { useTabSessionStore } from "@/lib/tabSessionStore";
import { TextInput } from "@/components/wui/TextInput";
import { WriteModal } from "@/components/WriteModal";
import { PageFrame } from "@/components/PageFrame";
import {
  SystemSelector,
  SystemSelectorTrigger,
} from "@/components/SystemSelector";
import { TagSelector, TagSelectorTrigger } from "@/components/TagSelector";
import { useRecentSearches } from "@/hooks/useRecentSearches";
import { RecentSearchesModal } from "@/components/RecentSearchesModal";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { isCoreFeatureAvailable } from "@/lib/featureGates";

export interface LoaderData {
  systemQuery: string;
  tagQuery: string[];
  systems: SystemsResponse;
}

const route = getRouteApi("/create/search");

export function Search() {
  const { t } = useTranslation();
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("create.search.title"),
  );
  const loaderData = route.useLoaderData();
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const setGamesIndex = useStatusStore((state) => state.setGamesIndex);
  const connected = useStatusStore((state) => state.connected);
  const coreVersion = useStatusStore((state) => state.coreVersion);
  const coreVersionPending = useStatusStore(
    (state) => state.coreVersionPending,
  );
  const savedSearch = useTabSessionStore((state) => state.createSearch);
  const setSessionSearch = useTabSessionStore((state) => state.setCreateSearch);
  const restoredSearch =
    savedSearch &&
    (savedSearch.system === "all" ||
      loaderData.systems.systems.some(
        (system) => system.id === savedSearch.system,
      ))
      ? savedSearch
      : null;

  const [querySystem, setQuerySystem] = useState(
    restoredSearch?.system ?? loaderData.systemQuery,
  );
  const [queryTags, setQueryTags] = useState<string[]>(
    restoredSearch?.tags ?? loaderData.tagQuery,
  );
  const [query, setQuery] = useState(restoredSearch?.query ?? "");
  const [systemSelectorOpen, setSystemSelectorOpen] = useState(false);
  const [tagSelectorOpen, setTagSelectorOpen] = useState(false);
  const [recentSearchesOpen, setRecentSearchesOpen] = useState(false);

  // State for tracking actual searched parameters and results
  const [searchParams, setSearchParams] = useState(restoredSearch);
  const [isSearching, setIsSearching] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const mediaTagsAvailable =
    connected &&
    !coreVersionPending &&
    isCoreFeatureAvailable("mediaTags", coreVersion);
  const effectiveQueryTags = mediaTagsAvailable ? queryTags : [];
  const browseAllSearchAvailable =
    connected &&
    !coreVersionPending &&
    isCoreFeatureAvailable("mediaBrowseAllSearch", coreVersion);
  const hasSearchConstraint = (
    searchQuery: string,
    system: string,
    tags: string[],
  ) => searchQuery.trim().length > 0 || system !== "all" || tags.length > 0;
  // Current Core keeps exists true once committed systems are readable during
  // indexing; older versions report false, preserving compatibility here.
  const baseSearchReady = connected && gamesIndex.exists;
  const canSearch =
    baseSearchReady &&
    (browseAllSearchAvailable ||
      hasSearchConstraint(query, querySystem, effectiveQueryTags));

  // Recent searches hook
  const {
    recentSearches,
    addRecentSearch,
    clearRecentSearches,
    getSearchDisplayText,
  } = useRecentSearches();

  // Manual search function
  const performSearch = async () => {
    if (!canSearch) {
      return;
    }

    // Clear any prior selection so the detail modal closes and write/copy/run
    // can't act on a stale row that may not be in the new result set.
    setSelectedResult(null);

    setIsSearching(true);
    const nextSearch = {
      query,
      system: querySystem,
      tags: effectiveQueryTags,
    };
    setSearchParams(nextSearch);
    setSessionSearch(nextSearch);

    try {
      await addRecentSearch({
        query: query,
        system: querySystem,
        tags: effectiveQueryTags,
      });
    } catch (e) {
      logger.warn("Failed to record recent search", e, {
        category: "storage",
        action: "addRecentSearch",
        severity: "warning",
      });
    }
  };

  const [selectedResult, setSelectedResult] = useState<SearchResultGame | null>(
    null,
  );

  const preferRemoteWriter = usePreferencesStore(
    (state) => state.preferRemoteWriter,
  );
  const nfcWriter = useNfcWriter(WriteMethod.Auto, preferRemoteWriter);
  const [writeOpen, setWriteOpen] = useState(false);
  const closeWriteModal = async () => {
    setWriteOpen(false);
    try {
      await nfcWriter.end();
    } catch (err) {
      logger.error("Failed to end NFC writer session", err, {
        category: "nfc",
        action: "closeWriteModal",
        severity: "error",
      });
    }
  };

  // Close modal when NFC operation completes; keep it open on verification
  // failure so the in-modal retry UI is shown.
  useEffect(() => {
    if (nfcWriter.status !== null && nfcWriter.verifyError === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Close the modal after the external NFC operation completes.
      setWriteOpen(false);
    }
  }, [nfcWriter]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await CoreAPI.media();
        if (cancelled) return;
        setGamesIndex(s.database);
      } catch (e) {
        if (cancelled) return;
        if (isExpectedMediaDatabaseError(e)) {
          setGamesIndex(DEFAULT_GAMES_INDEX);
          return;
        }
        logger.error("Failed to fetch media index:", e, {
          category: "api",
          action: "media",
          severity: "error",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setGamesIndex]);

  useEffect(() => {
    if (!mediaTagsAvailable) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Close unavailable controls when Core capability changes.
      setTagSelectorOpen(false);
    }
  }, [mediaTagsAvailable]);

  const router = useRouter();
  const goBack = () => router.history.back();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false,
  });

  // Handle system selection from selector
  const handleSystemSelect = async (systems: string[]) => {
    const selectedSystem =
      (systems.length === 1 ? systems[0] : undefined) ?? "all";
    setQuerySystem(selectedSystem);
    setSelectedResult(null);
    try {
      await Preferences.set({ key: "searchSystem", value: selectedSystem });
    } catch (err) {
      logger.warn("Failed to persist search filter", err, {
        category: "storage",
        action: "handleSystemSelect",
        severity: "warning",
      });
    }
  };

  // Handle tag selection from selector
  const handleTagSelect = async (tags: string[]) => {
    setQueryTags(tags);
    setSelectedResult(null);
    try {
      await Preferences.set({ key: "searchTags", value: JSON.stringify(tags) });
    } catch (err) {
      logger.warn("Failed to persist search filter", err, {
        category: "storage",
        action: "handleTagSelect",
        severity: "warning",
      });
    }
  };

  // Clear all filters (system and tags) but keep search query
  const handleClearFilters = async () => {
    setQuerySystem("all");
    setQueryTags([]);
    setSelectedResult(null);
    try {
      await Promise.all([
        Preferences.set({ key: "searchSystem", value: "all" }),
        Preferences.set({ key: "searchTags", value: JSON.stringify([]) }),
      ]);
    } catch (err) {
      logger.warn("Failed to persist search filter", err, {
        category: "storage",
        action: "handleClearFilters",
        severity: "warning",
      });
    }
  };

  // Handle selecting a recent search to prefill the form and execute search
  const handleRecentSearchSelect = async (
    recentSearch: (typeof recentSearches)[0],
  ) => {
    const searchTags = mediaTagsAvailable ? recentSearch.tags : [];
    setQuery(recentSearch.query);
    setQuerySystem(recentSearch.system);
    setQueryTags(searchTags);
    setSelectedResult(null);

    // Save preferences to match the selected search
    try {
      await Promise.all([
        Preferences.set({ key: "searchSystem", value: recentSearch.system }),
        Preferences.set({
          key: "searchTags",
          value: JSON.stringify(searchTags),
        }),
      ]);
    } catch (err) {
      logger.warn("Failed to persist search filter", err, {
        category: "storage",
        action: "handleRecentSearchSelect",
        severity: "warning",
      });
    }

    // Automatically execute the search
    if (
      baseSearchReady &&
      (browseAllSearchAvailable ||
        hasSearchConstraint(
          recentSearch.query,
          recentSearch.system,
          searchTags,
        ))
    ) {
      setIsSearching(true);
      const nextSearch = {
        query: recentSearch.query,
        system: recentSearch.system,
        tags: searchTags,
      };
      setSearchParams(nextSearch);
      setSessionSearch(nextSearch);
    }
  };

  return (
    <>
      <PageFrame
        {...swipeHandlers}
        headerLeft={
          <HeaderButton
            onClick={goBack}
            icon={<BackIcon size="24" />}
            aria-label={t("nav.back")}
          />
        }
        headerCenter={
          <h1 ref={headingRef} className="text-foreground text-xl">
            {t("create.search.title")}
          </h1>
        }
        scrollRef={scrollContainerRef}
        headerRight={
          <HeaderButton
            onClick={() => setRecentSearchesOpen(true)}
            disabled={recentSearches.length === 0}
            active={recentSearchesOpen}
            icon={<HistoryIcon size="24" />}
            title={t("create.search.recentSearches")}
            aria-label={t("create.search.recentSearches")}
          />
        }
      >
        <div
          role="search"
          aria-label={t("create.search.title")}
          className="space-y-3"
        >
          <TextInput
            label={t("create.search.gameInput")}
            placeholder={t("create.search.gameInputPlaceholder")}
            value={query}
            setValue={(v) => setQuery(v)}
            type="search"
            clearable={true}
            disabled={!connected || !gamesIndex.exists}
            onKeyUp={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
                if (canSearch) {
                  performSearch();
                }
              }
            }}
          />

          <div className="flex flex-col gap-3 md:flex-row">
            <div className="flex flex-col md:flex-1">
              <span id="search-system-label" className="mb-1 text-white">
                {t("create.search.systemInput")}
              </span>
              <SystemSelectorTrigger
                aria-labelledby="search-system-label"
                selectedSystems={querySystem === "all" ? [] : [querySystem]}
                systemsData={loaderData.systems}
                placeholder={t("create.search.allSystems")}
                mode="single"
                onClick={() => setSystemSelectorOpen(true)}
                disabled={!connected || !gamesIndex.exists}
              />
            </div>

            {mediaTagsAvailable && (
              <div className="flex flex-col md:flex-1">
                <span id="search-tags-label" className="mb-1 text-white">
                  {t("create.search.tagsInput")}
                </span>
                <TagSelectorTrigger
                  aria-labelledby="search-tags-label"
                  selectedTags={queryTags}
                  placeholder={t("create.search.allTags")}
                  onClick={() => setTagSelectorOpen(true)}
                  disabled={!connected || !gamesIndex.exists}
                />
              </div>
            )}
          </div>

          <Button
            label={t("create.search.searchButton")}
            icon={<SearchIcon size="20" />}
            onClick={performSearch}
            disabled={!canSearch || isSearching}
            className="w-full"
          />
        </div>

        <VirtualSearchResults
          query={searchParams?.query || ""}
          systems={
            searchParams
              ? searchParams.system === "all"
                ? []
                : [searchParams.system]
              : []
          }
          tags={searchParams?.tags || []}
          selectedResult={selectedResult}
          setSelectedResult={setSelectedResult}
          hasSearched={searchParams !== null}
          searchSystem={searchParams?.system || "all"}
          searchTags={searchParams?.tags || []}
          onClearFilters={handleClearFilters}
          isSearching={isSearching}
          onSearchComplete={() => setIsSearching(false)}
          scrollContainerRef={scrollContainerRef}
        />
      </PageFrame>

      <MediaDetailsModal
        isOpen={selectedResult !== null && !writeOpen}
        close={() => setSelectedResult(null)}
        media={selectedResult}
        onWrite={async (textToWrite) => {
          try {
            // Open the modal first: write() resolves when the whole operation
            // completes, not when it starts.
            setWriteOpen(true);
            await nfcWriter.write(WriteAction.Write, textToWrite);
          } catch (err) {
            logger.error("NFC write failed", err, {
              category: "nfc",
              action: "writeFromSearch",
              severity: "error",
            });
            showRateLimitedErrorToast(
              t("error", {
                msg: err instanceof Error ? err.message : String(err),
              }),
            );
          }
        }}
        onCopy={async (textToCopy) => {
          try {
            await navigator.clipboard.writeText(textToCopy);
          } catch (webErr) {
            if (Capacitor.isNativePlatform()) {
              try {
                const { Clipboard } = await import("@capacitor/clipboard");
                await Clipboard.write({ string: textToCopy });
              } catch (nativeErr) {
                logger.error("Failed to copy to clipboard", nativeErr, {
                  category: "share",
                  action: "copyResult",
                  severity: "error",
                });
              }
            } else {
              logger.error("Failed to copy to clipboard", webErr, {
                category: "share",
                action: "copyResult",
                severity: "error",
              });
            }
          }
        }}
        onPreview={async (textToRun) => {
          try {
            await CoreAPI.run({
              uid: "",
              text: textToRun,
            });
          } catch (e) {
            logger.error("CoreAPI.run failed", e, {
              category: "api",
              action: "run",
              severity: "error",
            });
            showRateLimitedErrorToast(
              t("error", {
                msg: e instanceof Error ? e.message : String(e),
              }),
            );
          }
        }}
        previewDisabled={!connected}
      />
      <BackToTop
        scrollContainerRef={scrollContainerRef}
        threshold={200}
        bottomOffset="calc(var(--bottom-nav-base-height) + 1rem)"
      />
      <WriteModal
        isOpen={writeOpen}
        close={closeWriteModal}
        verifyError={nfcWriter.verifyError !== null}
        retry={() => void nfcWriter.retry()}
      />
      <SystemSelector
        isOpen={systemSelectorOpen}
        onClose={() => setSystemSelectorOpen(false)}
        onSelect={handleSystemSelect}
        selectedSystems={querySystem === "all" ? [] : [querySystem]}
        mode="single"
        title={t("create.search.selectSystem")}
        includeAllOption={true}
        defaultSelection="all"
      />
      {mediaTagsAvailable && (
        <TagSelector
          isOpen={tagSelectorOpen}
          onClose={() => setTagSelectorOpen(false)}
          onSelect={handleTagSelect}
          selectedTags={queryTags}
          systems={querySystem === "all" ? [] : [querySystem]}
          title={t("create.search.selectTags")}
        />
      )}
      <RecentSearchesModal
        isOpen={recentSearchesOpen}
        onClose={() => setRecentSearchesOpen(false)}
        recentSearches={recentSearches}
        onSearchSelect={handleRecentSearchSelect}
        onClearHistory={clearRecentSearches}
        getSearchDisplayText={getSearchDisplayText}
      />
    </>
  );
}
