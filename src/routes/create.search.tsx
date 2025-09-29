import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Preferences } from "@capacitor/preferences";
import classNames from "classnames";
import { VirtualSearchResults } from "@/components/VirtualSearchResults.tsx";
import { CopyButton } from "@/components/CopyButton.tsx";
import { BackToTop } from "@/components/BackToTop.tsx";
import { CoreAPI } from "../lib/coreApi.ts";
import { CreateIcon, PlayIcon, SearchIcon, HistoryIcon } from "../lib/images";
import { useNfcWriter, WriteAction } from "../lib/writeNfcHook";
import {
  SearchResultGame,
  SystemsResponse
} from "../lib/models";
import { SlideModal } from "../components/SlideModal";
import { Button } from "../components/wui/Button";
import { HeaderButton } from "../components/wui/HeaderButton";
import { useSmartSwipe } from "../hooks/useSmartSwipe";
import { useStatusStore } from "../lib/store";
import { TextInput } from "../components/wui/TextInput";
import { WriteModal } from "../components/WriteModal";
import { PageFrame } from "../components/PageFrame";
import {
  SystemSelector,
  SystemSelectorTrigger
} from "../components/SystemSelector";
import { TagSelector, TagSelectorTrigger } from "../components/TagSelector";
import { useRecentSearches } from "../hooks/useRecentSearches";
import { RecentSearchesModal } from "../components/RecentSearchesModal";

export const Route = createFileRoute("/create/search")({
  loader: async (): Promise<LoaderData> => {
    const [systemPreference, tagPreference, systemsResponse] =
      await Promise.all([
        Preferences.get({ key: "searchSystem" }),
        Preferences.get({ key: "searchTags" }),
        CoreAPI.systems()
      ]);

    let savedTags: string[] = [];
    try {
      if (tagPreference.value) {
        savedTags = JSON.parse(tagPreference.value);
      }
    } catch (e) {
      console.warn("Failed to parse saved tags preference:", e);
    }

    return {
      systemQuery: systemPreference.value || "all",
      tagQuery: savedTags,
      systems: systemsResponse
    };
  },
  // Disable caching to ensure fresh preference is always read
  staleTime: 0,
  gcTime: 0,
  component: Search
});

interface LoaderData {
  systemQuery: string;
  tagQuery: string[];
  systems: SystemsResponse;
}

function Search() {
  const loaderData = Route.useLoaderData();
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const setGamesIndex = useStatusStore((state) => state.setGamesIndex);
  const connected = useStatusStore((state) => state.connected);

  const [querySystem, setQuerySystem] = useState(loaderData.systemQuery);
  const [queryTags, setQueryTags] = useState<string[]>(loaderData.tagQuery);
  const [query, setQuery] = useState("");
  const [systemSelectorOpen, setSystemSelectorOpen] = useState(false);
  const [tagSelectorOpen, setTagSelectorOpen] = useState(false);
  const [recentSearchesOpen, setRecentSearchesOpen] = useState(false);

  // State for tracking actual searched parameters and results
  const [searchParams, setSearchParams] = useState<{
    query: string;
    system: string;
    tags: string[];
  } | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Recent searches hook
  const {
    recentSearches,
    addRecentSearch,
    clearRecentSearches,
    getSearchDisplayText
  } = useRecentSearches();

  // Manual search function
  const performSearch = async () => {
    if (!connected || !gamesIndex.exists || gamesIndex.indexing) {
      return;
    }

    setIsSearching(true);
    setSearchParams({
      query: query,
      system: querySystem,
      tags: queryTags
    });

    // Add to recent searches
    await addRecentSearch({
      query: query,
      system: querySystem,
      tags: queryTags
    });
  };

  const [selectedResult, setSelectedResult] = useState<SearchResultGame | null>(
    null
  );

  // Check if search has valid parameters
  const canSearch = connected && gamesIndex.exists && !gamesIndex.indexing;
  const hasSearchParameters =
    query.trim() !== "" || querySystem !== "all" || queryTags.length > 0;

  const nfcWriter = useNfcWriter();
  const [writeOpen, setWriteOpen] = useState(false);
  const closeWriteModal = async () => {
    setWriteOpen(false);
    await nfcWriter.end();
  };

  const { t } = useTranslation();

  useEffect(() => {
    if (nfcWriter.status !== null) {
      setWriteOpen(false);
    }
  }, [nfcWriter]);

  useEffect(() => {
    CoreAPI.media().then((s) => {
      setGamesIndex(s.database);
    });
  }, [setGamesIndex]);

  // Check if tags API is available for backwards compatibility
  const { isError: tagsApiError } = useQuery({
    queryKey: ["tagsAvailable"],
    queryFn: () => CoreAPI.mediaTags([]),
    retry: false,
    staleTime: 60000, // Cache for 1 minute
    enabled: connected // Only check when connected
  });

  const navigate = useNavigate();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: () => navigate({ to: "/create" }),
    preventScrollOnSwipe: false
  });

  // Handle system selection from selector
  const handleSystemSelect = async (systems: string[]) => {
    const selectedSystem = systems.length === 1 ? systems[0] : "all";
    setQuerySystem(selectedSystem);
    setSelectedResult(null);
    await Preferences.set({ key: "searchSystem", value: selectedSystem });
  };

  // Handle tag selection from selector
  const handleTagSelect = async (tags: string[]) => {
    setQueryTags(tags);
    setSelectedResult(null);
    await Preferences.set({ key: "searchTags", value: JSON.stringify(tags) });
  };

  // Clear all filters (system and tags) but keep search query
  const handleClearFilters = async () => {
    setQuerySystem("all");
    setQueryTags([]);
    setSelectedResult(null);
    await Promise.all([
      Preferences.set({ key: "searchSystem", value: "all" }),
      Preferences.set({ key: "searchTags", value: JSON.stringify([]) })
    ]);
  };

  // Handle selecting a recent search to prefill the form and execute search
  const handleRecentSearchSelect = async (recentSearch: typeof recentSearches[0]) => {
    setQuery(recentSearch.query);
    setQuerySystem(recentSearch.system);
    setQueryTags(recentSearch.tags);
    setSelectedResult(null);

    // Save preferences to match the selected search
    await Promise.all([
      Preferences.set({ key: "searchSystem", value: recentSearch.system }),
      Preferences.set({ key: "searchTags", value: JSON.stringify(recentSearch.tags) })
    ]);

    // Automatically execute the search
    if (connected && gamesIndex.exists && !gamesIndex.indexing) {
      setIsSearching(true);
      setSearchParams({
        query: recentSearch.query,
        system: recentSearch.system,
        tags: recentSearch.tags
      });
    }
  };

  return (
    <>
      <PageFrame
        {...swipeHandlers}
        title={t("create.search.title")}
        back={() => navigate({ to: "/create" })}
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
            disabled={!connected || !gamesIndex.exists || gamesIndex.indexing}
            onKeyUp={(e) => {
              if (e.key === "Enter" || e.keyCode === 13) {
                e.currentTarget.blur();
                if (canSearch && hasSearchParameters) {
                  performSearch();
                }
              }
            }}
          />

          <div className="flex flex-col gap-3 md:flex-row">
            <div className="flex flex-col md:flex-1">
              <label className="mb-1 text-white">
                {t("create.search.systemInput")}
              </label>
              <SystemSelectorTrigger
                selectedSystems={querySystem === "all" ? [] : [querySystem]}
                systemsData={loaderData.systems}
                placeholder={t("create.search.allSystems")}
                mode="single"
                onClick={() => setSystemSelectorOpen(true)}
                className={classNames({
                  "opacity-50":
                    !connected || !gamesIndex.exists || gamesIndex.indexing
                })}
              />
            </div>

            <div className="flex flex-col md:flex-1">
              <label className="mb-1 text-white">
                {t("create.search.tagsInput")}
              </label>
              <TagSelectorTrigger
                selectedTags={queryTags}
                placeholder={t("create.search.allTags")}
                onClick={() => setTagSelectorOpen(true)}
                disabled={tagsApiError}
                className={classNames({
                  "opacity-50":
                    !connected || !gamesIndex.exists || gamesIndex.indexing
                })}
              />
            </div>
          </div>

          <Button
            label={t("create.search.searchButton")}
            icon={<SearchIcon size="20" />}
            onClick={performSearch}
            disabled={!canSearch || !hasSearchParameters || isSearching}
            className="w-full"
          />
        </div>

        <VirtualSearchResults
          query={searchParams?.query || ""}
          systems={searchParams ? (searchParams.system === "all" ? [] : [searchParams.system]) : []}
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

      <SlideModal
        isOpen={selectedResult !== null && !writeOpen}
        close={() => setSelectedResult(null)}
        title={selectedResult?.name || "Game Details"}
      >
        <div className="flex flex-col gap-3 pt-2">
          <p>
            {t("create.search.systemLabel")} {selectedResult?.system.name}
          </p>
          <p>
            {t("create.search.pathLabel")} {selectedResult?.path}{" "}
            {selectedResult?.path !== "" && (
              <CopyButton text={selectedResult?.path ?? ""} />
            )}
          </p>
          <div className="flex flex-row gap-2 pt-1">
            <Button
              label={t("create.search.writeLabel")}
              icon={<CreateIcon size="20" />}
              disabled={!selectedResult}
              onClick={() => {
                if (selectedResult) {
                  nfcWriter.write(WriteAction.Write, selectedResult.path);
                  setWriteOpen(true);
                }
              }}
              className="grow"
            />
            <Button
              label={t("create.search.playLabel")}
              icon={<PlayIcon size="20" />}
              variant="outline"
              disabled={!selectedResult || !connected}
              onClick={() => {
                if (selectedResult) {
                  CoreAPI.run({
                    uid: "",
                    text: selectedResult.path
                  });
                }
              }}
            />
          </div>
        </div>
      </SlideModal>
      <BackToTop scrollContainerRef={scrollContainerRef} threshold={200} />
      <WriteModal isOpen={writeOpen} close={closeWriteModal} />
      <SystemSelector
        isOpen={systemSelectorOpen}
        onClose={() => setSystemSelectorOpen(false)}
        onSelect={handleSystemSelect}
        selectedSystems={querySystem === "all" ? [] : [querySystem]}
        mode="single"
        title={t("create.search.selectSystem")}
        includeAllOption={false}
      />
      <TagSelector
        isOpen={tagSelectorOpen}
        onClose={() => setTagSelectorOpen(false)}
        onSelect={handleTagSelect}
        selectedTags={queryTags}
        systems={querySystem === "all" ? [] : [querySystem]}
        title={t("create.search.selectTags")}
      />
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
