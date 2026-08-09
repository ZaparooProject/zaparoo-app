import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { SearchResultGame } from "@/lib/models";
import { CoreAPI } from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";
import { useLibrarySessionStore } from "@/lib/librarySessionStore";
import { BackIcon, SearchIcon } from "@/lib/images";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
import { PageFrame } from "@/components/PageFrame";
import { VirtualSearchResults } from "@/components/VirtualSearchResults";
import { BackToTop } from "@/components/BackToTop";
import { DEFAULT_LOADING_DELAY_MS } from "@/components/DelayedLoading";
import { TextInput } from "@/components/wui/TextInput";
import { Button } from "@/components/wui/Button";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { searchResultToBrowseEntry } from "@/lib/libraryMedia";
import {
  SystemSelector,
  SystemSelectorTrigger,
} from "@/components/SystemSelector";
import { TagSelector, TagSelectorTrigger } from "@/components/TagSelector";
import { LibraryMediaDetailsModal } from "@/components/library/LibraryMediaDetailsModal";

interface LibraryGameSearchProps {
  initialSystemId?: string;
  onBack?: () => void;
  embedded?: boolean;
  scrollRef?: RefObject<HTMLDivElement | null>;
  fixedTags?: string[];
  sessionScope?: string;
  title?: string;
}

export function LibraryGameSearch({
  initialSystemId,
  onBack,
  embedded = false,
  scrollRef: externalScrollRef,
  fixedTags = [],
  sessionScope,
  title,
}: LibraryGameSearchProps = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pageTitle = title ?? t("library.searchTitle");
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(pageTitle);
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = externalScrollRef ?? internalScrollRef;
  const connected = useStatusStore((state) => state.connected);
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const targetDeviceAddress = useStatusStore(
    (state) => state.targetDeviceAddress,
  );
  const searchScope = sessionScope ?? initialSystemId ?? "all";
  const savedSearch = useLibrarySessionStore((state) =>
    state.deviceAddress === targetDeviceAddress
      ? state.searches[searchScope]
      : undefined,
  );
  const setSessionSearch = useLibrarySessionStore((state) => state.setSearch);
  const activateLibraryDevice = useLibrarySessionStore(
    (state) => state.activateDevice,
  );
  useLayoutEffect(() => {
    activateLibraryDevice(targetDeviceAddress);
  }, [activateLibraryDevice, targetDeviceAddress]);
  const libraryFeature = useCoreFeature("mediaLibrary");
  const mediaTagsFeature = useCoreFeature("mediaTags", {
    requireKnownSupport: true,
  });
  const browseAllSearchFeature = useCoreFeature("mediaBrowseAllSearch", {
    requireKnownSupport: true,
  });
  const systemsQuery = useQuery({
    queryKey: ["systems", targetDeviceAddress, { all: false }],
    queryFn: () => CoreAPI.systems(),
    enabled: connected && gamesIndex.exists,
    staleTime: 60 * 1000,
  });
  const [query, setQuery] = useState(savedSearch?.query ?? "");
  const [querySystem, setQuerySystem] = useState(
    savedSearch?.system ?? initialSystemId ?? "all",
  );
  const [queryTags, setQueryTags] = useState<string[]>(
    (savedSearch?.tags ?? []).filter((tag) => !fixedTags.includes(tag)),
  );
  const [searchParams, setSearchParams] = useState(savedSearch ?? null);
  const [isSearching, setIsSearching] = useState(false);
  const [systemSelectorOpen, setSystemSelectorOpen] = useState(false);
  const [tagSelectorOpen, setTagSelectorOpen] = useState(false);
  const [selectedResult, setSelectedResult] = useState<SearchResultGame | null>(
    null,
  );
  const selectedEntry = useMemo(
    () => (selectedResult ? searchResultToBrowseEntry(selectedResult) : null),
    [selectedResult],
  );
  const canUseSearch =
    connected && gamesIndex.exists && libraryFeature.available;
  const effectiveQueryTags = mediaTagsFeature.available ? queryTags : [];
  const requestTags = Array.from(
    new Set([...fixedTags, ...effectiveQueryTags]),
  );
  const hasSearchConstraint =
    query.trim() !== "" || querySystem !== "all" || requestTags.length > 0;
  const canSubmitSearch =
    canUseSearch && (browseAllSearchFeature.available || hasSearchConstraint);
  const goBack =
    onBack ?? (() => navigate({ to: "/library", resetScroll: false }));
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false,
  });

  const search = () => {
    if (!canSubmitSearch) return;
    setSelectedResult(null);
    setIsSearching(true);
    const nextSearch = {
      query: query.trim(),
      system: querySystem,
      tags: effectiveQueryTags,
    };
    setSearchParams(nextSearch);
    setSessionSearch(searchScope, nextSearch);
  };

  const clearFilters = () => {
    setQuerySystem("all");
    setQueryTags([]);
    setSelectedResult(null);
  };

  const content = (
    <>
      <div role="search" aria-label={pageTitle} className="space-y-3">
        <TextInput
          label={t("library.searchInput")}
          placeholder={t("library.searchPlaceholder")}
          value={query}
          setValue={setQuery}
          type="search"
          clearable
          disabled={!canUseSearch}
          onKeyUp={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
              search();
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
              systemsData={systemsQuery.data}
              placeholder={t("create.search.allSystems")}
              mode="single"
              onClick={() => setSystemSelectorOpen(true)}
              disabled={!canUseSearch}
            />
          </div>

          {mediaTagsFeature.available && (
            <div className="flex flex-col md:flex-1">
              <label className="mb-1 text-white">
                {t("create.search.tagsInput")}
              </label>
              <TagSelectorTrigger
                selectedTags={queryTags}
                placeholder={t("create.search.allTags")}
                onClick={() => setTagSelectorOpen(true)}
                disabled={!canUseSearch}
              />
            </div>
          )}
        </div>

        <Button
          label={t("library.searchAction")}
          icon={<SearchIcon size="20" />}
          onClick={search}
          disabled={!canSubmitSearch || isSearching}
          className="w-full"
        />
      </div>

      <VirtualSearchResults
        query={searchParams?.query ?? ""}
        systems={
          searchParams && searchParams.system !== "all"
            ? [searchParams.system]
            : []
        }
        tags={
          searchParams
            ? Array.from(new Set([...fixedTags, ...(searchParams.tags ?? [])]))
            : []
        }
        selectedResult={selectedResult}
        setSelectedResult={setSelectedResult}
        hasSearched={searchParams !== null}
        searchSystem={searchParams?.system ?? "all"}
        searchTags={searchParams?.tags ?? []}
        onClearFilters={clearFilters}
        isSearching={isSearching}
        onSearchComplete={() => setIsSearching(false)}
        scrollContainerRef={scrollRef}
        loadingDelayMs={DEFAULT_LOADING_DELAY_MS}
      />
      <BackToTop
        scrollContainerRef={scrollRef}
        threshold={200}
        bottomOffset="calc(80px + 1rem)"
      />
    </>
  );

  const overlays = (
    <>
      <LibraryMediaDetailsModal
        isOpen={selectedEntry !== null}
        close={() => setSelectedResult(null)}
        entry={selectedEntry}
        systemId={selectedResult?.system.id ?? ""}
        targetDeviceAddress={targetDeviceAddress}
      />
      <SystemSelector
        isOpen={systemSelectorOpen}
        onClose={() => setSystemSelectorOpen(false)}
        onSelect={(systems) => {
          setQuerySystem(systems[0] ?? "all");
          setSelectedResult(null);
        }}
        selectedSystems={querySystem === "all" ? [] : [querySystem]}
        mode="single"
        title={t("create.search.selectSystem")}
        includeAllOption
        defaultSelection="all"
      />
      {mediaTagsFeature.available && (
        <TagSelector
          isOpen={tagSelectorOpen}
          onClose={() => setTagSelectorOpen(false)}
          onSelect={(tags) => {
            setQueryTags(tags);
            setSelectedResult(null);
          }}
          selectedTags={queryTags}
          systems={querySystem === "all" ? [] : [querySystem]}
          title={t("create.search.selectTags")}
        />
      )}
    </>
  );

  if (embedded) {
    return (
      <>
        {content}
        {overlays}
      </>
    );
  }

  return (
    <>
      <PageFrame
        {...swipeHandlers}
        scrollRef={scrollRef}
        headerLeft={
          <HeaderButton
            icon={<BackIcon size="24" />}
            aria-label={t("nav.back")}
            onClick={goBack}
          />
        }
        headerCenter={
          <h1 ref={headingRef} className="text-foreground text-xl">
            {pageTitle}
          </h1>
        }
      >
        {content}
      </PageFrame>
      {overlays}
    </>
  );
}
