import { useState, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, Check, X, ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { useDebounce } from "use-debounce";
import classNames from "classnames";
import { CoreAPI } from "@/lib/coreApi";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { compareStrings } from "@/lib/utils";
import { TagInfo } from "@/lib/models";
import { EmptyState } from "@/components/wui/EmptyState";
import { useAccessibleLists } from "@/hooks/useAccessibleLists";
import { useHapticPress } from "@/hooks/useHapticPress";
import { useAnnouncer } from "./A11yAnnouncer";
import { SlideModal } from "./SlideModal";
import { Button } from "./wui/Button";
import { ModalActionBar } from "./wui/ModalActionBar";
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

function TagSearchOption(props: {
  tag: TagInfo;
  selected: boolean;
  fillHeight: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const handleHapticPress = useHapticPress();
  const typeLabel = t(`tagSelector.type.${props.tag.type}`, {
    defaultValue: props.tag.type,
  });

  return (
    <button
      className={classNames(
        "flex min-h-16 w-full items-center justify-between px-4 py-3 text-left transition-colors",
        "rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
        "hover:bg-white/10 focus:bg-white/10",
        {
          "h-full": props.fillHeight,
          "bg-white/10": props.selected,
        },
      )}
      onPointerUp={handleHapticPress}
      onClick={props.onSelect}
      type="button"
      role="checkbox"
      aria-checked={props.selected}
      aria-label={`${props.tag.tag}, ${typeLabel}`}
    >
      <span className="flex items-center space-x-3" aria-hidden="true">
        <span
          className={classNames(
            "border-input flex h-5 w-5 items-center justify-center rounded border-2",
            { "bg-primary border-primary": props.selected },
          )}
        >
          {props.selected && (
            <Check className="text-primary-foreground h-3 w-3" />
          )}
        </span>
        <span className="flex flex-col">
          <span className="text-foreground font-medium">{props.tag.tag}</span>
          <span className="text-muted-foreground text-xs">{typeLabel}</span>
        </span>
      </span>
    </button>
  );
}

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
  const accessibleLists = useAccessibleLists();
  const handleHapticPress = useHapticPress();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const slideModalScrollRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [allExpanded, setAllExpanded] = useState(false);
  const deviceKey = useActiveDeviceKey();

  // Fetch tags data
  const {
    data: tagsData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["tags", deviceKey, systems],
    queryFn: () => CoreAPI.mediaTags(systems.length > 0 ? systems : undefined),
    enabled: isOpen, // Only fetch when modal is open
    staleTime: 0,
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
      return compareStrings(a, b);
    });

    // Sort tags within each group
    Object.keys(grouped).forEach((type) => {
      grouped[type]!.sort((a, b) => compareStrings(a.tag, b.tag));
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
    [selectedTags, onSelect, announce, t],
  );

  // Handle clear all
  const handleClearAll = useCallback(() => {
    onSelect([]);
  }, [onSelect]);

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
    <div className="flex flex-col gap-3 px-2 pb-2">
      <div className="text-center">
        <span className="text-muted-foreground text-sm">
          {t("tagSelector.selectedCount", {
            count: selectedTags.length,
          })}
        </span>
      </div>
      <ModalActionBar
        secondaryAction={
          <Button
            label={t("tagSelector.clearAll")}
            icon={<Trash2 size={20} />}
            variant="outline"
            onClick={handleClearAll}
            disabled={selectedTags.length === 0}
          />
        }
        primaryAction={
          <Button label={t("tagSelector.apply")} onClick={handleApply} />
        }
      />
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
              type="search"
              aria-label={t("tagSelector.searchTags")}
              placeholder={t("tagSelector.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-input bg-background text-foreground w-full rounded-md border px-10 py-2 focus:ring-2 focus:ring-white/20 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
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
            <div
              className="flex h-32 items-center justify-center"
              role="status"
            >
              <span className="text-muted-foreground">{t("loading")}</span>
            </div>
          ) : isError ? (
            <div className="flex h-32 items-center justify-center">
              <span className="text-muted-foreground" role="alert">
                {t("tagSelector.unavailable", {
                  defaultValue: "Tags unavailable",
                })}
              </span>
            </div>
          ) : allTags.length === 0 ? (
            debouncedSearchQuery ? (
              <EmptyState
                className="h-32"
                title={t("tagSelector.noResults")}
                description={t("tagSelector.noResultsHint")}
              />
            ) : (
              <EmptyState className="h-32" title={t("tagSelector.noTags")} />
            )
          ) : debouncedSearchQuery ? (
            <div
              ref={scrollContainerRef}
              className="h-full overflow-auto px-2 pb-4"
              tabIndex={-1}
            >
              {accessibleLists ? (
                <div role="list" aria-label={t("tagSelector.resultsLabel")}>
                  {allTags.map((tag, index) => {
                    const formattedTag = `${tag.type}:${tag.tag}`;
                    return (
                      <div
                        key={formattedTag}
                        role="listitem"
                        aria-posinset={index + 1}
                        aria-setsize={allTags.length}
                      >
                        <TagSearchOption
                          tag={tag}
                          selected={selectedTags.includes(formattedTag)}
                          fillHeight={false}
                          onSelect={() => handleTagSelect(tag)}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                  }}
                  role="list"
                  aria-label={t("tagSelector.resultsLabel")}
                >
                  {virtualizer.getVirtualItems().map((virtualItem) => {
                    const tag = allTags[virtualItem.index];
                    if (!tag) return null;
                    const formattedTag = `${tag.type}:${tag.tag}`;
                    return (
                      <div
                        key={virtualItem.key}
                        role="listitem"
                        aria-posinset={virtualItem.index + 1}
                        aria-setsize={allTags.length}
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
                        <TagSearchOption
                          tag={tag}
                          selected={selectedTags.includes(formattedTag)}
                          fillHeight
                          onSelect={() => handleTagSelect(tag)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
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
                                  "rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                                  "hover:bg-white/5 focus:bg-white/5",
                                  { "bg-white/10": isSelected },
                                )}
                                onPointerUp={handleHapticPress}
                                onClick={() => handleTagSelect(tag)}
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
                                      <Check className="text-primary-foreground h-3 w-3" />
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
  placeholder,
  className,
  onClick,
  disabled = false,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: {
  selectedTags: string[];
  placeholder?: string;
  className?: string;
  onClick: () => void;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const { t } = useTranslation();
  const placeholderText = placeholder ?? t("tagSelector.title");

  const displayText = useMemo(() => {
    if (selectedTags.length === 0) {
      return placeholderText;
    }

    // Show full canonical "type:value" format
    if (selectedTags.length <= 3) {
      return selectedTags.join(", ");
    }

    return t("tagSelector.multipleSelected", {
      count: selectedTags.length,
    });
  }, [selectedTags, placeholderText, t]);

  const handleClick = () => {
    if (disabled) return;
    onClick();
  };

  return (
    <button
      onClick={handleClick}
      className={classNames(
        "border-input text-foreground flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none",
        {
          "hover:bg-white/10": !disabled,
          "cursor-not-allowed opacity-50": disabled,
        },
        className,
      )}
      style={{ backgroundColor: "var(--color-background)" }}
      disabled={disabled}
      type="button"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
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
