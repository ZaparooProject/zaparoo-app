import { getRouteApi, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Preferences } from "@capacitor/preferences";
import { Capacitor } from "@capacitor/core";
import classNames from "classnames";
import { Folder, FileCode, Tag, Copy } from "lucide-react";
import { VirtualSearchResults } from "@/components/VirtualSearchResults.tsx";
import { BackToTop } from "@/components/BackToTop.tsx";
import { TagBadge } from "@/components/TagBadge.tsx";
import { logger } from "@/lib/logger";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import { CoreAPI, isExpectedMediaDatabaseError } from "@/lib/coreApi";
import {
  BackIcon,
  CreateIcon,
  PlayIcon,
  SearchIcon,
  HistoryIcon,
  DeviceIcon,
} from "@/lib/images";
import { useNfcWriter, WriteAction, WriteMethod } from "@/lib/writeNfcHook";
import { SearchResultGame, SystemsResponse } from "@/lib/models";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { filenameFromPath } from "@/lib/path";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
import { useHaptics } from "@/hooks/useHaptics";
import { DEFAULT_GAMES_INDEX, useStatusStore } from "@/lib/store";
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
  usePageHeadingFocus(t("create.search.title"));
  const loaderData = route.useLoaderData();
  const { impact } = useHaptics();
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const setGamesIndex = useStatusStore((state) => state.setGamesIndex);
  const connected = useStatusStore((state) => state.connected);
  const coreVersion = useStatusStore((state) => state.coreVersion);
  const coreVersionPending = useStatusStore(
    (state) => state.coreVersionPending,
  );
  const showFilenames = usePreferencesStore((s) => s.showFilenames);

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
  const baseSearchReady =
    connected && gamesIndex.exists && !gamesIndex.indexing;
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
    setSearchParams({
      query: query,
      system: querySystem,
      tags: effectiveQueryTags,
    });

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
  const [writeMode, setWriteMode] = useState<"path" | "zapScript">("zapScript");

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

  // Close modal when NFC operation completes
  useEffect(() => {
    if (nfcWriter.status !== null) {
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

  // Set default write mode when selected result changes
  useEffect(() => {
    if (selectedResult) {
      setWriteMode(selectedResult.zapScript ? "zapScript" : "path");
    }
  }, [selectedResult]);

  useEffect(() => {
    if (!mediaTagsAvailable) {
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
      setSearchParams({
        query: recentSearch.query,
        system: recentSearch.system,
        tags: searchTags,
      });
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
          <h1 className="text-foreground text-xl">
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
            disabled={!connected || !gamesIndex.exists || gamesIndex.indexing}
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
                    !connected || !gamesIndex.exists || gamesIndex.indexing,
                })}
              />
            </div>

            {mediaTagsAvailable && (
              <div className="flex flex-col md:flex-1">
                <label className="mb-1 text-white">
                  {t("create.search.tagsInput")}
                </label>
                <TagSelectorTrigger
                  selectedTags={queryTags}
                  placeholder={t("create.search.allTags")}
                  onClick={() => setTagSelectorOpen(true)}
                  className={classNames({
                    "opacity-50":
                      !connected || !gamesIndex.exists || gamesIndex.indexing,
                  })}
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

      <SlideModal
        isOpen={selectedResult !== null && !writeOpen}
        close={() => setSelectedResult(null)}
        title={
          selectedResult
            ? showFilenames
              ? filenameFromPath(selectedResult.path) || selectedResult.name
              : selectedResult.name
            : "Game Details"
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          {/* Primary Info */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
              <div className="flex items-center gap-2 sm:min-w-[100px]">
                <DeviceIcon size="16" className="text-white/60" />
                <span className="text-sm text-white/60">
                  {t("create.search.systemLabel")}
                </span>
              </div>
              <span className="flex-1 font-medium">
                {selectedResult?.system.name}
              </span>
            </div>
            {selectedResult?.tags && selectedResult.tags.length > 0 && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                <div className="flex items-center gap-2 sm:min-w-[100px]">
                  <Tag size={16} className="text-white/60" />
                  <span className="text-sm text-white/60">
                    {t("create.search.tagsLabel")}
                  </span>
                </div>
                <div className="flex flex-1 flex-wrap gap-1.5">
                  {selectedResult.tags.map((tag, tagIndex) => (
                    <TagBadge key={tagIndex} type={tag.type} tag={tag.tag} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Technical Details - Selectable Options */}
          <fieldset
            className="space-y-2"
            role="radiogroup"
            aria-label={t("create.search.selectWriteValue")}
          >
            <legend className="sr-only">
              {t("create.search.selectWriteValue")}
            </legend>

            {/* Path Option */}
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="write-mode-path"
                name="write-mode"
                value="path"
                checked={writeMode === "path"}
                onChange={() => {
                  impact("light");
                  setWriteMode("path");
                }}
                className="sr-only"
              />
              <label
                htmlFor="write-mode-path"
                aria-label={`${t("create.search.pathLabel")}: ${selectedResult?.path || ""}${writeMode === "path" ? `, ${t("selected")}` : ""}`}
                className={classNames(
                  "flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-all duration-200",
                  {
                    "border-white/30 bg-white/10": writeMode === "path",
                    "border-white/10 bg-white/5 hover:bg-white/[0.07]":
                      writeMode !== "path",
                  },
                )}
              >
                <div
                  className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:gap-3"
                  aria-hidden="true"
                >
                  <div className="flex items-center gap-2 sm:min-w-[100px]">
                    <Folder size={16} className="flex-shrink-0 text-white/60" />
                    <span className="text-sm text-white/60">
                      {t("create.search.pathLabel")}
                    </span>
                  </div>
                  <code className="flex-1 text-left font-mono text-sm break-all text-white/90">
                    {selectedResult?.path}
                  </code>
                </div>
                <div
                  aria-hidden="true"
                  className={classNames(
                    "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all",
                    {
                      "border-white bg-white": writeMode === "path",
                      "border-white/30": writeMode !== "path",
                    },
                  )}
                >
                  {writeMode === "path" && (
                    <div className="bg-background h-2 w-2 rounded-full" />
                  )}
                </div>
              </label>
            </div>

            {/* ZapScript Option */}
            {selectedResult?.zapScript && (
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="write-mode-zapscript"
                  name="write-mode"
                  value="zapScript"
                  checked={writeMode === "zapScript"}
                  onChange={() => {
                    impact("light");
                    setWriteMode("zapScript");
                  }}
                  className="sr-only"
                />
                <label
                  htmlFor="write-mode-zapscript"
                  aria-label={`${t("create.search.zapscriptLabel")}: ${selectedResult.zapScript}${writeMode === "zapScript" ? `, ${t("selected")}` : ""}`}
                  className={classNames(
                    "flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-all duration-200",
                    {
                      "border-white/30 bg-white/10": writeMode === "zapScript",
                      "border-white/10 bg-white/5 hover:bg-white/[0.07]":
                        writeMode !== "zapScript",
                    },
                  )}
                >
                  <div
                    className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:gap-3"
                    aria-hidden="true"
                  >
                    <div className="flex items-center gap-2 sm:min-w-[100px]">
                      <FileCode
                        size={16}
                        className="flex-shrink-0 text-white/60"
                      />
                      <span className="text-sm text-white/60">
                        {t("create.search.zapscriptLabel")}
                      </span>
                    </div>
                    <code className="flex-1 text-left font-mono text-sm break-words text-white/90">
                      {selectedResult.zapScript}
                    </code>
                  </div>
                  <div
                    aria-hidden="true"
                    className={classNames(
                      "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all",
                      {
                        "border-white bg-white": writeMode === "zapScript",
                        "border-white/30": writeMode !== "zapScript",
                      },
                    )}
                  >
                    {writeMode === "zapScript" && (
                      <div className="bg-background h-2 w-2 rounded-full" />
                    )}
                  </div>
                </label>
              </div>
            )}
          </fieldset>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2">
            <Button
              label={t("create.search.writeLabel")}
              icon={<CreateIcon size="20" />}
              intent="primary"
              disabled={!selectedResult}
              onClick={async () => {
                if (!selectedResult) return;
                const textToWrite =
                  writeMode === "zapScript" && selectedResult.zapScript
                    ? selectedResult.zapScript
                    : selectedResult.path;
                try {
                  await nfcWriter.write(WriteAction.Write, textToWrite);
                  setWriteOpen(true);
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
              className="w-full"
            />
            <div className="flex flex-row gap-2">
              <Button
                label={t("create.search.copyLabel")}
                icon={<Copy size="20" />}
                variant="outline"
                disabled={!selectedResult}
                onClick={async () => {
                  if (!selectedResult) return;
                  const textToCopy =
                    writeMode === "zapScript" && selectedResult.zapScript
                      ? selectedResult.zapScript
                      : selectedResult.path;
                  try {
                    await navigator.clipboard.writeText(textToCopy);
                  } catch (webErr) {
                    if (Capacitor.isNativePlatform()) {
                      try {
                        const { Clipboard } =
                          await import("@capacitor/clipboard");
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
                className="flex-1"
              />
              <Button
                label={t("create.search.playLabel")}
                icon={<PlayIcon size="20" />}
                variant="outline"
                disabled={!selectedResult || !connected}
                onClick={async () => {
                  if (!selectedResult) return;
                  const textToRun =
                    writeMode === "zapScript" && selectedResult.zapScript
                      ? selectedResult.zapScript
                      : selectedResult.path;
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
                className="flex-1"
              />
            </div>
          </div>
        </div>
      </SlideModal>
      <BackToTop
        scrollContainerRef={scrollContainerRef}
        threshold={200}
        bottomOffset="calc(80px + 1rem)"
      />
      <WriteModal isOpen={writeOpen} close={closeWriteModal} />
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
