import { useState, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, Check, X, ChevronUp, ChevronDown } from "lucide-react";
import { useDebounce } from "use-debounce";
import classNames from "classnames";
import { CoreAPI } from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";
import { TagInfo } from "@/lib/models";
import { useAnnouncer } from "./A11yAnnouncer";
import { SlideModal } from "./SlideModal";
import { Button } from "./wui/Button";
import { BackToTop } from "./BackToTop";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./ui/accordion";

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

const ITEM_HEIGHT = 64; // Height of each tag item in pixels (increased for spacing)

export function TagSelector({
  isOpen,
  onClose,
  onSelect,
  selectedTags,
  systems = [],
  title,
}: TagSelectorProps) {
  const { t } = useTranslation();
  const { announce } = useAnnouncer();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const slideModalScrollRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [allExpanded, setAllExpanded] = useState(false);

  // Get indexing state to disable selector when indexing is in progress
  const gamesIndex = useStatusStore((state) => state.gamesIndex);

  // Fetch tags data
  const {
    data: tagsData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["tags", systems],
    queryFn: () => CoreAPI.mediaTags(systems.length > 0 ? systems : undefined),
    enabled: isOpen, // Only fetch when modal is open
    retry: false, // Don't retry on error for backwards compatibility
  });

  // Process and group tags
  const { groupedTags, types, allTags } = useMemo(() => {
    if (!tagsData?.tags) {
      return { groupedTags: {}, types: [], allTags: [] };
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
      grouped[tag.type]!.push(tag);
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

    // Sort tags within each group
    Object.keys(grouped).forEach((type) => {
      grouped[type]!.sort((a, b) => a.tag.localeCompare(b.tag));
    });

    // Apply search filter if needed
    let filteredGrouped = grouped;
    let filteredAllTags = tags;

    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      filteredGrouped = {};
      filteredAllTags = [];

      Object.keys(grouped).forEach((type) => {
        const filteredTags = grouped[type]!.filter(
          (tag) =>
            tag.tag.toLowerCase().includes(query) ||
            tag.type.toLowerCase().includes(query),
        );

        if (filteredTags.length > 0) {
          filteredGrouped[type] = filteredTags;
          filteredAllTags.push(...filteredTags);
        }
      });
    }

    return {
      groupedTags: filteredGrouped,
      types: types.filter((type) => (filteredGrouped[type]?.length ?? 0) > 0),
      allTags: filteredAllTags,
    };
  }, [tagsData, debouncedSearchQuery]);

  // Handle tag selection
  const handleTagSelect = useCallback(
    (tag: TagInfo) => {
      // Don't allow selection while indexing
      if (gamesIndex.indexing) return;

      // Format tag as "<type>:<value>" for the API
      const formattedTag = `${tag.type}:${tag.tag}`;
      const wasSelected = selectedTags.includes(formattedTag);
      const newSelection = wasSelected
        ? selectedTags.filter((t) => t !== formattedTag)
        : [...selectedTags, formattedTag];
      onSelect(newSelection);

      // Announce the state change
      if (wasSelected) {
        announce(t("tagSelector.deselected", { name: tag.tag }));
      } else {
        announce(t("tagSelector.selected", { name: tag.tag }));
      }
    },
    [selectedTags, onSelect, gamesIndex.indexing, announce, t],
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

  // Handle expand/collapse all
  const handleExpandCollapseAll = useCallback(() => {
    if (allExpanded) {
      setExpandedSections([]);
      setAllExpanded(false);
    } else {
      setExpandedSections(types);
      setAllExpanded(true);
    }
  }, [allExpanded, types]);

  // Handle accordion expand change
  const handleAccordionChange = useCallback(
    (expanded: string[]) => {
      setExpandedSections(expanded);
      setAllExpanded(expanded.length === types.length);
    },
    [types.length],
  );

  // Set up virtualizer for all tags (used when search is active)
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: allTags.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  // Footer for multi-select mode
  const footer = (
    <div className="border-border flex flex-col gap-3 border-t p-2">
      <div className="text-center">
        <span className="text-muted-foreground text-sm">
          {t("tagSelector.selectedCount", {
            count: selectedTags.length,
          })}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {selectedTags.length > 0 && (
          <button
            onClick={handleClearAll}
            className={classNames("text-sm underline", {
              "text-muted-foreground hover:text-foreground":
                !gamesIndex.indexing,
              "text-muted-foreground/50 cursor-not-allowed":
                gamesIndex.indexing,
            })}
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
      scrollRef={slideModalScrollRef}
      fixedHeight="90vh"
    >
      <div className="flex min-h-0 flex-col">
        {/* Header with search */}
        <div className="p-2 pt-3">
          {/* Search bar */}
          <div className="relative mb-3">
            <Search
              className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
              aria-hidden="true"
            />
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
                aria-label={t("tagSelector.clearSearch")}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Expand/Collapse all button */}
          {types.length > 0 && !debouncedSearchQuery && (
            <button
              onClick={handleExpandCollapseAll}
              className="text-muted-foreground hover:text-foreground flex items-center gap-2 px-3 py-1 text-sm transition-colors"
              type="button"
            >
              {allExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  {t("tagSelector.collapseAll", {
                    defaultValue: "Collapse all",
                  })}
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  {t("tagSelector.expandAll", { defaultValue: "Expand all" })}
                </>
              )}
            </button>
          )}
        </div>

        {/* Content area */}
        <div className="min-h-0 flex-1 overflow-hidden" tabIndex={-1}>
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <span className="text-muted-foreground">{t("loading")}</span>
            </div>
          ) : isError ? (
            <div className="flex h-32 items-center justify-center">
              <span className="text-muted-foreground">
                {t("tagSelector.unavailable", {
                  defaultValue: "Tags unavailable",
                })}
              </span>
            </div>
          ) : allTags.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <span className="text-muted-foreground">
                {debouncedSearchQuery
                  ? t("tagSelector.noResults")
                  : t("tagSelector.noTags")}
              </span>
            </div>
          ) : debouncedSearchQuery ? (
            // Search results - show virtualized list of all matching tags
            <div
              ref={scrollContainerRef}
              className="h-full px-2 pb-4"
              tabIndex={-1}
            >
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: "100%",
                  position: "relative",
                }}
                role="presentation"
              >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const tag = allTags[virtualItem.index];
                  if (!tag) return null;
                  const formattedTag = `${tag.type}:${tag.tag}`;
                  const isSelected = selectedTags.includes(formattedTag);

                  return (
                    <div
                      key={virtualItem.key}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                        padding: "2px 8px",
                      }}
                    >
                      <button
                        className={classNames(
                          "flex h-full w-full items-center justify-between px-4 py-3 text-left transition-colors",
                          "rounded-lg focus:outline-none",
                          {
                            "bg-white/10": isSelected,
                            "hover:bg-white/10 focus:bg-white/10":
                              !gamesIndex.indexing,
                            "cursor-not-allowed opacity-50":
                              gamesIndex.indexing,
                          },
                        )}
                        onClick={() => handleTagSelect(tag)}
                        disabled={gamesIndex.indexing}
                        type="button"
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-label={`${tag.tag}, ${t(`tagSelector.type.${tag.type}`, { defaultValue: tag.type })}`}
                      >
                        <div
                          className="flex items-center space-x-3"
                          aria-hidden="true"
                        >
                          <div
                            className={classNames(
                              "border-input flex h-5 w-5 items-center justify-center rounded border-2",
                              {
                                "bg-primary border-primary": isSelected,
                              },
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
                              {t(`tagSelector.type.${tag.type}`, {
                                defaultValue: tag.type,
                              })}
                            </span>
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            // Accordion view for organized categories
            <div className="h-full overflow-auto px-2 pb-4">
              <Accordion
                type="multiple"
                value={expandedSections}
                onValueChange={handleAccordionChange}
                className="space-y-2"
              >
                {types.map((type) => {
                  const tagsInType = groupedTags[type] || [];
                  const selectedInType = tagsInType.filter((tag) => {
                    const formattedTag = `${tag.type}:${tag.tag}`;
                    return selectedTags.includes(formattedTag);
                  }).length;

                  return (
                    <AccordionItem
                      key={type}
                      value={type}
                      className="overflow-hidden rounded-lg border border-white/20"
                    >
                      <AccordionTrigger className="bg-wui-card px-4 py-3 hover:bg-white/5 hover:no-underline">
                        <div className="flex w-full items-center justify-between">
                          <span>
                            {t(`tagSelector.type.${type}`, {
                              defaultValue: type,
                            })}{" "}
                            ({tagsInType.length})
                          </span>
                          {selectedInType > 0 && (
                            <span className="bg-primary text-primary-foreground mr-2 rounded-full px-2 py-0.5 text-xs font-medium">
                              {selectedInType}
                            </span>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-3">
                        <div className="space-y-1">
                          {tagsInType.map((tag) => {
                            const formattedTag = `${tag.type}:${tag.tag}`;
                            const isSelected =
                              selectedTags.includes(formattedTag);

                            return (
                              <button
                                key={tag.tag}
                                className={classNames(
                                  "flex w-full items-center justify-between px-3 py-3 text-left transition-colors",
                                  "rounded-md focus:outline-none",
                                  {
                                    "bg-white/10": isSelected,
                                    "hover:bg-white/5 focus:bg-white/5":
                                      !gamesIndex.indexing,
                                    "cursor-not-allowed opacity-50":
                                      gamesIndex.indexing,
                                  },
                                )}
                                onClick={() => handleTagSelect(tag)}
                                disabled={gamesIndex.indexing}
                                type="button"
                                role="checkbox"
                                aria-checked={isSelected}
                                aria-label={tag.tag}
                              >
                                <div
                                  className="flex items-center space-x-3"
                                  aria-hidden="true"
                                >
                                  <div
                                    className={classNames(
                                      "border-input flex h-5 w-5 items-center justify-center rounded border-2",
                                      {
                                        "bg-primary border-primary": isSelected,
                                      },
                                    )}
                                  >
                                    {isSelected && (
                                      <Check className="h-3 w-3 text-white" />
                                    )}
                                  </div>
                                  <span className="text-foreground text-sm font-medium">
                                    {tag.tag}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </div>
          )}
        </div>

        {/* Scroll to top button */}
        <BackToTop
          scrollContainerRef={slideModalScrollRef}
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
  onClick,
  disabled = false,
}: {
  selectedTags: string[];
  placeholder?: string;
  className?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();

  // Get indexing state to disable trigger when indexing is in progress
  const gamesIndex = useStatusStore((state) => state.gamesIndex);

  const displayText = useMemo(() => {
    if (selectedTags.length === 0) {
      return placeholder;
    }

    // Show full canonical "type:value" format
    if (selectedTags.length <= 3) {
      return selectedTags.join(", ");
    }

    return t("tagSelector.multipleSelected", {
      count: selectedTags.length,
    });
  }, [selectedTags, placeholder, t]);

  const handleClick = () => {
    // Don't open selector while indexing or if disabled
    if (gamesIndex.indexing || disabled) return;
    onClick();
  };

  return (
    <button
      onClick={handleClick}
      className={classNames(
        "border-input text-foreground flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors focus:ring-2 focus:ring-white/20 focus:outline-none",
        {
          "hover:bg-white/10": !gamesIndex.indexing && !disabled,
          "cursor-not-allowed opacity-50": gamesIndex.indexing || disabled,
        },
        className,
      )}
      style={{ backgroundColor: "var(--color-background)" }}
      disabled={gamesIndex.indexing || disabled}
      type="button"
    >
      <span
        className={classNames({
          "text-muted-foreground": selectedTags.length === 0,
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
