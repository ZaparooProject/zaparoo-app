import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import { Preferences } from "@capacitor/preferences";
import { PlusIcon } from "lucide-react";
import { useStatusStore } from "@/lib/store.ts";
import { logger } from "@/lib/logger";
import { SlideModal } from "@/components/SlideModal.tsx";
import { TextInput } from "@/components/wui/TextInput.tsx";
import { Button } from "@/components/wui/Button.tsx";
import { VirtualSearchResults } from "@/components/VirtualSearchResults.tsx";
import { SearchResultGame } from "@/lib/models.ts";
import { BackToTop } from "@/components/BackToTop.tsx";
import { SearchIcon } from "@/lib/images.tsx";
import { SimpleSystemSelect } from "@/components/SimpleSystemSelect.tsx";
import { TagSelector, TagSelectorTrigger } from "@/components/TagSelector";
import { MediaDetailsModal } from "@/components/MediaDetailsModal";
import { useCoreFeature } from "@/hooks/useCoreFeature";

type MediaSearchModalProps = {
  isOpen: boolean;
  close: () => void;
  onAddCustom?: () => void;
} & (
  | { onSelect: (value: string) => void; onSelectMedia?: never }
  | { onSelectMedia: (result: SearchResultGame) => void; onSelect?: never }
);

export function MediaSearchModal(props: MediaSearchModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const customActionRef = useRef<HTMLDivElement>(null);
  const [footerHeight, setFooterHeight] = useState(0);
  const hasCustomAction = Boolean(props.onAddCustom);

  useEffect(() => {
    const footer = customActionRef.current?.parentElement;
    if (!hasCustomAction || !footer) {
      setFooterHeight(0);
      return;
    }
    const measure = () =>
      setFooterHeight(footer.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(footer);
    return () => observer.disconnect();
  }, [hasCustomAction, props.isOpen]);

  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selectedSystem, setSelectedSystem] = useState<string>("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagSelectorOpen, setTagSelectorOpen] = useState(false);
  const mediaTagsAvailable = useCoreFeature("mediaTags", {
    requireKnownSupport: true,
  }).available;
  const [selectedResult, setSelectedResult] = useState<SearchResultGame | null>(
    null,
  );

  // State for tracking actual searched parameters
  const [searchParams, setSearchParams] = useState<{
    query: string;
    system: string;
    tags: string[];
  } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const connected = useStatusStore((state) => state.connected);
  const { close } = props;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const gamesIndex = useStatusStore((state) => state.gamesIndex);

  // Core keeps exists true once committed systems are searchable during an
  // index; older versions report false until indexing finishes.
  const performSearch = () => {
    if (!connected || !gamesIndex.exists) {
      return;
    }

    setIsSearching(true);
    setSearchParams({
      query: query,
      system: selectedSystem,
      tags: mediaTagsAvailable ? selectedTags : [],
    });
  };

  // Handle system selection
  const handleSystemSelect = async (systemId: string) => {
    setSelectedSystem(systemId);
    await Preferences.set({ key: "searchSystem", value: systemId }).catch(
      (e) => {
        logger.error("Failed to save search system preference:", e, {
          category: "storage",
          action: "set",
          key: "searchSystem",
          severity: "warning",
        });
      },
    );
  };

  // Handle result selection - called by VirtualSearchResults when a result is clicked
  const handleResultSelect = (result: SearchResultGame | null) => {
    if (result && props.onSelectMedia) {
      props.onSelectMedia(result);
      return;
    }
    setSelectedResult(result);
  };

  const canSearch = connected && gamesIndex.exists;

  return (
    <>
      <SlideModal
        isOpen={
          props.isOpen &&
          selectedResult === null &&
          !(mediaTagsAvailable && tagSelectorOpen)
        }
        close={props.close}
        title={t("create.search.title")}
        scrollRef={scrollContainerRef}
        fixedHeight="90vh"
        footer={
          props.onAddCustom ? (
            <div ref={customActionRef}>
              <Button
                label={t("decks.addCustomScript")}
                variant="outline"
                className="w-full"
                onClick={props.onAddCustom}
              />
            </div>
          ) : undefined
        }
      >
        <div className="flex min-h-0 flex-col">
          <div className="flex flex-col gap-3 p-2 pt-3">
            <TextInput
              ref={inputRef}
              label={t("create.search.gameInput")}
              placeholder={t("create.search.gameInputPlaceholder")}
              value={query}
              setValue={setQuery}
              type="search"
              clearable={true}
              disabled={!canSearch}
              onKeyUp={(e) => {
                if (e.key === "Enter" || e.keyCode === 13) {
                  e.currentTarget.blur();
                  performSearch();
                }
              }}
            />

            <div className="flex flex-col">
              <span id="media-search-system-label" className="mb-1 text-white">
                {t("create.search.systemInput")}
              </span>
              <SimpleSystemSelect
                aria-labelledby="media-search-system-label"
                value={selectedSystem}
                onSelect={handleSystemSelect}
                includeAllOption={true}
                disabled={!canSearch || !props.isOpen}
              />
            </div>

            {mediaTagsAvailable && (
              <div className="flex flex-col">
                <span id="media-search-tags-label" className="mb-1 text-white">
                  {t("create.search.tagsInput")}
                </span>
                <TagSelectorTrigger
                  aria-labelledby="media-search-tags-label"
                  selectedTags={selectedTags}
                  placeholder={t("create.search.allTags")}
                  onClick={() => setTagSelectorOpen(true)}
                  disabled={!canSearch || !props.isOpen}
                />
              </div>
            )}

            <Button
              label={t("create.search.searchButton")}
              icon={<SearchIcon size="20" />}
              onClick={performSearch}
              disabled={!canSearch || isSearching}
              className="w-full"
            />
          </div>

          <div className="min-h-0 flex-1">
            <VirtualSearchResults
              compactEmptyState
              query={searchParams?.query || ""}
              systems={
                searchParams
                  ? searchParams.system === "all"
                    ? []
                    : [searchParams.system]
                  : []
              }
              tags={mediaTagsAvailable ? searchParams?.tags : []}
              selectedResult={selectedResult}
              setSelectedResult={handleResultSelect}
              hasSearched={searchParams !== null}
              isSearching={isSearching}
              onSearchComplete={() => setIsSearching(false)}
              scrollContainerRef={scrollContainerRef}
            />
          </div>
        </div>

        <BackToTop
          scrollContainerRef={scrollContainerRef}
          threshold={200}
          bottomOffset={`calc(1rem + ${footerHeight}px)`}
        />
      </SlideModal>
      {mediaTagsAvailable && (
        <TagSelector
          isOpen={props.isOpen && tagSelectorOpen}
          onClose={() => setTagSelectorOpen(false)}
          onSelect={setSelectedTags}
          selectedTags={selectedTags}
          systems={selectedSystem === "all" ? [] : [selectedSystem]}
          title={t("create.search.selectTags")}
        />
      )}
      {props.onSelect && (
        <MediaDetailsModal
          isOpen={props.isOpen && selectedResult !== null}
          close={() => setSelectedResult(null)}
          media={selectedResult}
          onWrite={(value) => {
            props.onSelect?.(value);
            setSelectedResult(null);
            close();
          }}
          primaryActionLabel={t("create.custom.insert")}
          primaryActionIcon={<PlusIcon size="20" />}
        />
      )}
    </>
  );
}
