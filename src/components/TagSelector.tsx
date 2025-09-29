import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, Check, X } from "lucide-react";
import { useDebounce } from "use-debounce";
import classNames from "classnames";
import { CoreAPI } from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";
import { TagInfo } from "@/lib/models";
import { SlideModal } from "./SlideModal";
import { Button } from "./wui/Button";
import { BackToTop } from "./BackToTop";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";

interface TagSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (tags: string[]) => void;
  selectedTags: string[];
  systems?: string[];
  title?: string;
}

interface GroupedTags {
  [type: string]: TagInfo[];
}

const ITEM_HEIGHT = 56; // Height of each tag item in pixels

export function TagSelector({
  isOpen,
  onClose,
  onSelect,
  selectedTags,
  systems = [],
  title
}: TagSelectorProps) {
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tabsListRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);
  const [showLeftGradient, setShowLeftGradient] = useState(false);
  const [showRightGradient, setShowRightGradient] = useState(true);

  // Get indexing state to disable selector when indexing is in progress
  const gamesIndex = useStatusStore((state) => state.gamesIndex);

  // Fetch tags data
  const { data: tagsData, isLoading } = useQuery({
    queryKey: ["tags", systems],
    queryFn: () => CoreAPI.mediaTags(systems.length > 0 ? systems : undefined),
    enabled: isOpen // Only fetch when modal is open
  });

  // Process and filter tags
  const { filteredTags, types } = useMemo(() => {
    if (!tagsData?.tags) {
      return { filteredTags: [], types: [] };
    }

    const tags = tagsData.tags;

    // Group tags by type
    const grouped: GroupedTags = {};
    const typeSet = new Set<string>();

    tags.forEach((tag) => {
      typeSet.add(tag.type);

      if (!grouped[tag.type]) {
        grouped[tag.type] = [];
      }
      grouped[tag.type].push(tag);
    });

    // Sort types alphabetically, but put common ones first
    const priorityTypes = ["genre", "year", "series", "publisher"];
    const types = Array.from(typeSet).sort((a, b) => {
      const aPriority = priorityTypes.indexOf(a);
      const bPriority = priorityTypes.indexOf(b);

      if (aPriority !== -1 && bPriority !== -1) {
        return aPriority - bPriority;
      }
      if (aPriority !== -1) return -1;
      if (bPriority !== -1) return 1;
      return a.localeCompare(b);
    });

    // Filter tags based on search and type
    let filtered: TagInfo[] = [];

    if (selectedType === "all") {
      filtered = tags;
    } else {
      filtered = grouped[selectedType] || [];
    }

    // Apply search filter
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (tag) =>
          tag.tag.toLowerCase().includes(query) ||
          tag.type.toLowerCase().includes(query)
      );
    }

    // Sort filtered tags by tag name
    filtered.sort((a, b) => a.tag.localeCompare(b.tag));

    return { filteredTags: filtered, types };
  }, [tagsData, debouncedSearchQuery, selectedType]);

  // Handle tag selection
  const handleTagSelect = useCallback(
    (tag: string) => {
      // Don't allow selection while indexing
      if (gamesIndex.indexing) return;

      const newSelection = selectedTags.includes(tag)
        ? selectedTags.filter((t) => t !== tag)
        : [...selectedTags, tag];
      onSelect(newSelection);
    },
    [selectedTags, onSelect, gamesIndex.indexing]
  );

  // Handle clear all
  const handleClearAll = useCallback(() => {
    // Don't allow clearing while indexing
    if (gamesIndex.indexing) return;
    onSelect([]);
  }, [onSelect, gamesIndex.indexing]);

  // Handle apply
  const handleApply = useCallback(() => {
    onClose();
  }, [onClose]);

  // Handle tabs scroll for gradient visibility
  const handleTabsScroll = useCallback(() => {
    const container = tabsListRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;

    // Show left gradient if scrolled from start
    setShowLeftGradient(scrollLeft > 0);

    // Show right gradient if not at end
    setShowRightGradient(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  // Set up virtualizer
  const virtualizer = useVirtualizer({
    count: filteredTags.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5
  });

  // Set up tabs scroll listener for gradient visibility
  useEffect(() => {
    handleTabsScroll(); // Check initial state
    const container = tabsListRef.current;
    if (container) {
      container.addEventListener("scroll", handleTabsScroll, { passive: true });
      return () => container.removeEventListener("scroll", handleTabsScroll);
    }
  }, [handleTabsScroll, types]); // Re-check when types change

  // Footer for multi-select mode
  const footer = (
    <div className="border-border flex flex-col gap-3 border-t p-2">
      <div className="text-center">
        <span className="text-muted-foreground text-sm">
          {t("tagSelector.selectedCount", {
            count: selectedTags.length
          })}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {selectedTags.length > 0 && (
          <button
            onClick={handleClearAll}
            className={classNames(
              "text-sm underline",
              {
                "text-muted-foreground hover:text-foreground": !gamesIndex.indexing,
                "text-muted-foreground/50 cursor-not-allowed": gamesIndex.indexing
              }
            )}
            disabled={gamesIndex.indexing}
            type="button"
          >
            {t("tagSelector.clearAll")}
          </button>
        )}
        <Button
          label={t("tagSelector.apply")}
          onClick={handleApply}
          className="flex-1"
          disabled={gamesIndex.indexing}
        />
      </div>
    </div>
  );

  return (
    <SlideModal
      isOpen={isOpen}
      close={onClose}
      title={title || t("tagSelector.title")}
      footer={footer}
      scrollRef={scrollContainerRef}
      fixedHeight="90vh"
    >
      <div className="flex min-h-0 flex-col">
        {/* Header with search */}
        <div className="space-y-4 p-2 pt-3">
          {/* Search bar */}
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <input
              type="text"
              placeholder={t("tagSelector.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-input bg-background text-foreground w-full rounded-md border px-10 py-2 text-sm focus:ring-2 focus:ring-white/20 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Type tabs using shadcn tabs */}
        <Tabs
          value={selectedType}
          onValueChange={setSelectedType}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="relative">
            {/* Left gradient - only show when scrolled */}
            <div
              className={`pointer-events-none absolute top-0 bottom-0 left-0 z-10 w-8 bg-gradient-to-r from-[rgba(17,25,40,0.9)] to-transparent transition-opacity duration-200 ${
                showLeftGradient ? "opacity-100" : "opacity-0"
              }`}
            />

            <div className="px-2 py-2">
              <TabsList
                ref={tabsListRef}
                className="flex w-full justify-start overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <TabsTrigger value="all">
                  {t("tagSelector.allTypes")}
                </TabsTrigger>
                {types.map((type) => (
                  <TabsTrigger key={type} value={type}>
                    {t(`tagSelector.type.${type}`, { defaultValue: type })}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* Right gradient - only show when more content */}
            <div
              className={`pointer-events-none absolute top-0 right-0 bottom-0 z-10 w-8 bg-gradient-to-l from-[rgba(17,25,40,0.9)] to-transparent transition-opacity duration-200 ${
                showRightGradient ? "opacity-100" : "opacity-0"
              }`}
            />
          </div>

          <TabsContent
            value={selectedType}
            className="min-h-0 flex-1 overflow-hidden"
          >
            {isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <span className="text-muted-foreground">{t("loading")}</span>
              </div>
            ) : filteredTags.length === 0 ? (
              <div className="flex h-32 items-center justify-center">
                <span className="text-muted-foreground">
                  {debouncedSearchQuery
                    ? t("tagSelector.noResults")
                    : t("tagSelector.noTags")}
                </span>
              </div>
            ) : (
              <div ref={scrollContainerRef} className="h-full overflow-auto">
                <div
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative"
                  }}
                >
                  {virtualizer.getVirtualItems().map((virtualItem) => {
                    const tag = filteredTags[virtualItem.index];
                    const isSelected = selectedTags.includes(tag.tag);

                    return (
                      <div
                        key={virtualItem.key}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: `${virtualItem.size}px`,
                          transform: `translateY(${virtualItem.start}px)`
                        }}
                      >
                        <button
                          className={classNames(
                            "flex w-full items-center justify-between px-4 py-3 text-left transition-colors",
                            "rounded-lg focus:outline-none",
                            {
                              "bg-white/10": isSelected,
                              "hover:bg-white/10 focus:bg-white/10": !gamesIndex.indexing,
                              "opacity-50 cursor-not-allowed": gamesIndex.indexing
                            }
                          )}
                          onClick={() => handleTagSelect(tag.tag)}
                          disabled={gamesIndex.indexing}
                          type="button"
                        >
                          <div className="flex items-center space-x-3">
                            <div
                              className={classNames(
                                "border-input flex h-5 w-5 items-center justify-center rounded border-2",
                                {
                                  "bg-primary border-primary": isSelected
                                }
                              )}
                            >
                              {isSelected && (
                                <Check className="h-3 w-3 text-white" />
                              )}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-foreground font-medium">
                                {tag.tag}
                              </span>
                              <span className="text-muted-foreground text-xs">
                                {t(`tagSelector.type.${tag.type}`, { defaultValue: tag.type })}
                              </span>
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Scroll to top button */}
        <BackToTop
          scrollContainerRef={scrollContainerRef}
          threshold={200}
          bottomOffset="calc(1rem + 100px)"
        />
      </div>
    </SlideModal>
  );
}

// Helper component for displaying selected tags
export function TagSelectorTrigger({
  selectedTags,
  placeholder = "Select tags",
  className,
  onClick
}: {
  selectedTags: string[];
  placeholder?: string;
  className?: string;
  onClick: () => void;
}) {
  const { t } = useTranslation();

  // Get indexing state to disable trigger when indexing is in progress
  const gamesIndex = useStatusStore((state) => state.gamesIndex);

  const displayText = useMemo(() => {
    if (selectedTags.length === 0) {
      return placeholder;
    }

    if (selectedTags.length <= 3) {
      return selectedTags.join(", ");
    }

    return t("tagSelector.multipleSelected", {
      count: selectedTags.length
    });
  }, [selectedTags, placeholder, t]);

  const handleClick = () => {
    // Don't open selector while indexing
    if (gamesIndex.indexing) return;
    onClick();
  };

  return (
    <button
      onClick={handleClick}
      className={classNames(
        "border-input text-foreground flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors focus:ring-2 focus:ring-white/20 focus:outline-none",
        {
          "hover:bg-white/10": !gamesIndex.indexing,
          "opacity-50 cursor-not-allowed": gamesIndex.indexing
        },
        className
      )}
      style={{ backgroundColor: "var(--color-background)" }}
      disabled={gamesIndex.indexing}
      type="button"
    >
      <span
        className={classNames({
          "text-muted-foreground": selectedTags.length === 0
        })}
      >
        {displayText}
      </span>
      <div className="ml-2 h-4 w-4">
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>
    </button>
  );
}