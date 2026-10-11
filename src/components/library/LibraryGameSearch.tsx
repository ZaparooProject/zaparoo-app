import { useContext, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { CoreAPI } from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";
import {
  librarySearchScrollKey,
  useLibrarySessionStore,
} from "@/lib/librarySessionStore";
import type { SessionSearchParams } from "@/lib/tabSessionStore";
import { BackIcon, SearchIcon } from "@/lib/images";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { useBackButtonHandler } from "@/hooks/useBackButtonHandler";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { PageFrame } from "@/components/PageFrame";
import { VirtualSearchResults } from "@/components/VirtualSearchResults";
import { BackToTop } from "@/components/BackToTop";
import { DEFAULT_LOADING_DELAY_MS } from "@/components/DelayedLoading";
import { TextInput } from "@/components/wui/TextInput";
import { Button } from "@/components/wui/Button";
import { HeaderButton } from "@/components/wui/HeaderButton";
import {
  SystemSelector,
  SystemSelectorTrigger,
} from "@/components/SystemSelector";
import { TagSelector, TagSelectorTrigger } from "@/components/TagSelector";
import { LibraryDetailsSurface } from "@/components/library/LibraryDetailsSurface";
import {
  LibraryMediaSelectionContext,
  useLibraryMediaSelection,
  useLibraryMediaSelectionContext,
} from "@/hooks/useLibraryMediaSelection";

interface LibraryGameSearchProps {
  initialSystemId?: string;
  initialSearch?: SessionSearchParams;
  onBack?: () => void;
  historyBack?: () => void;
  embedded?: boolean;
  scrollRef?: RefObject<HTMLDivElement | null>;
  fixedTags?: string[];
  sessionScope?: string;
  title?: string;
}

export function LibraryGameSearch(props: LibraryGameSearchProps = {}) {
  const shared = useContext(LibraryMediaSelectionContext);
  return shared ? (
    <LibraryGameSearchContent {...props} />
  ) : (
    <StandaloneLibraryGameSearch {...props} />
  );
}

function StandaloneLibraryGameSearch(props: LibraryGameSearchProps) {
  const deviceKey = useActiveDeviceKey();
  const selection = useLibraryMediaSelection(
    `search:${props.sessionScope ?? props.initialSystemId ?? "all"}`,
    deviceKey,
  );
  return (
    <LibraryMediaSelectionContext.Provider value={selection}>
      <LibraryGameSearchContent {...props} ownsDetails />
    </LibraryMediaSelectionContext.Provider>
  );
}

function LibraryGameSearchContent({
  initialSystemId,
  initialSearch,
  onBack,
  historyBack,
  embedded = false,
  scrollRef: externalScrollRef,
  fixedTags = [],
  sessionScope,
  title,
  ownsDetails = false,
}: LibraryGameSearchProps & { ownsDetails?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pageTitle = title ?? t("library.searchTitle");
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    embedded ? undefined : pageTitle,
  );
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = externalScrollRef ?? internalScrollRef;
  const connected = useStatusStore((state) => state.connected);
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const deviceKey = useActiveDeviceKey();
  const searchScope = sessionScope ?? initialSystemId ?? "all";
  const savedSearch = useLibrarySessionStore((state) =>
    state.deviceAddress === deviceKey ? state.searches[searchScope] : undefined,
  );
  const setSessionSearch = useLibrarySessionStore((state) => state.setSearch);
  const activateLibraryDevice = useLibrarySessionStore(
    (state) => state.activateDevice,
  );
  useLayoutEffect(() => {
    activateLibraryDevice(deviceKey);
  }, [activateLibraryDevice, deviceKey]);
  const libraryFeature = useCoreFeature("mediaLibrary");
  const mediaTagsFeature = useCoreFeature("mediaTags", {
    requireKnownSupport: true,
  });
  const browseAllSearchFeature = useCoreFeature("mediaBrowseAllSearch", {
    requireKnownSupport: true,
  });
  const systemsQuery = useQuery({
    queryKey: ["systems", deviceKey, { all: false }],
    queryFn: () => CoreAPI.systems(),
    enabled: connected && gamesIndex.exists,
    staleTime: 60 * 1000,
  });
  const seededSearch = savedSearch ?? initialSearch;
  useLayoutEffect(() => {
    if (
      initialSearch &&
      !savedSearch &&
      useLibrarySessionStore.getState().deviceAddress === deviceKey
    ) {
      setSessionSearch(searchScope, initialSearch);
    }
  }, [deviceKey, initialSearch, savedSearch, searchScope, setSessionSearch]);
  const [query, setQuery] = useState(seededSearch?.query ?? "");
  const [querySystem, setQuerySystem] = useState(
    seededSearch?.system ?? initialSystemId ?? "all",
  );
  const [queryTags, setQueryTags] = useState<string[]>(
    (seededSearch?.tags ?? []).filter((tag) => !fixedTags.includes(tag)),
  );
  const [searchParams, setSearchParams] = useState(seededSearch ?? null);
  const [isSearching, setIsSearching] = useState(false);
  const [systemSelectorOpen, setSystemSelectorOpen] = useState(false);
  const [tagSelectorOpen, setTagSelectorOpen] = useState(false);
  const selection = useLibraryMediaSelectionContext();
  const { result: selectedResult, selectResult: setSelectedResult } = selection;
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
    historyBack ??
    onBack ??
    (() => navigate({ to: "/library", resetScroll: false }));
  useBackButtonHandler(
    "metadata-search",
    () => {
      if (!historyBack) return false;
      historyBack();
      return true;
    },
    50,
    Boolean(historyBack),
  );

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
      <div className="library-search-workspace">
        <div
          role="search"
          aria-label={pageTitle}
          className="library-search-filters space-y-3"
        >
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

          <div className="library-search-filter-selectors">
            <div className="flex flex-col md:flex-1">
              <span
                id="library-search-system-label"
                className="text-foreground mb-1"
              >
                {t("create.search.systemInput")}
              </span>
              <SystemSelectorTrigger
                aria-labelledby="library-search-system-label"
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
                <span
                  id="library-search-tags-label"
                  className="text-foreground mb-1"
                >
                  {t("create.search.tagsInput")}
                </span>
                <TagSelectorTrigger
                  aria-labelledby="library-search-tags-label"
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
            disabledAppearance={isSearching ? "busy" : "unavailable"}
            className="w-full"
          />
        </div>

        <div className="library-search-results">
          <VirtualSearchResults
            query={searchParams?.query ?? ""}
            systems={
              searchParams && searchParams.system !== "all"
                ? [searchParams.system]
                : []
            }
            tags={
              searchParams
                ? Array.from(
                    new Set([...fixedTags, ...(searchParams.tags ?? [])]),
                  )
                : []
            }
            selectedResult={selectedResult}
            setSelectedResult={setSelectedResult}
            selectionPresentation={selection.docked ? "pane" : "modal"}
            hasSearched={
              searchParams !== null &&
              (searchParams.tags.length === 0 || mediaTagsFeature.available)
            }
            searchSystem={searchParams?.system ?? "all"}
            searchTags={searchParams?.tags ?? []}
            onClearFilters={clearFilters}
            isSearching={isSearching}
            onSearchComplete={() => setIsSearching(false)}
            scrollContainerRef={scrollRef}
            loadingDelayMs={DEFAULT_LOADING_DELAY_MS}
          />
        </div>
      </div>
      <BackToTop scrollContainerRef={scrollRef} threshold={200} />
    </>
  );

  const overlays = (
    <>
      {embedded && ownsDetails && (
        <LibraryDetailsSurface
          selection={{ ...selection, docked: false }}
          systemId={selectedResult?.system.id ?? ""}
          deviceKey={deviceKey}
        />
      )}
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
        headerMode="content-wide"
        breadcrumbs={[
          onBack
            ? { label: t("library.title"), onClick: goBack }
            : { to: "/library", label: t("library.title") },
        ]}
        layout="workspace"
        sessionScrollKey={
          initialSearch ? librarySearchScrollKey(searchScope) : undefined
        }
        supportingPane={
          ownsDetails ? (
            <LibraryDetailsSurface
              selection={selection}
              systemId={selectedResult?.system.id ?? ""}
              deviceKey={deviceKey}
            />
          ) : undefined
        }
        onSwipeBack={goBack}
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
