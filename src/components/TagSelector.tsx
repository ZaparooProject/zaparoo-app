import { useState, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronUpIcon, ChevronDownIcon } from "lucide-react";
import { useDebounce } from "use-debounce";
import { CoreAPI } from "@/lib/coreApi";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { compareStrings } from "@/lib/utils";
import { TagInfo } from "@/lib/models";
import { EmptyState } from "@/components/wui/EmptyState";
import { Badge } from "@/components/wui/Badge";
import { TextInput } from "@/components/wui/TextInput";
import { InlineLoading } from "@/components/InlineLoading";
import { DelayedLoading } from "@/components/DelayedLoading";
import { ModalActionBar } from "@/components/wui/ModalActionBar";
import { useAccessibleLists } from "@/hooks/useAccessibleLists";
import { useHapticPress } from "@/hooks/useHapticPress";
import { useVirtualListScrollMargin } from "@/hooks/useVirtualListScrollMargin";
import { useAnnouncer } from "./A11yAnnouncer";
import { SlideModal } from "./SlideModal";
import { Button } from "./wui/Button";
import { BackToTop } from "./BackToTop";
import { SelectionIndicator, SelectorTrigger } from "./SelectorParts";
import { selectorOptionClassName } from "./selectorOptionClassName";
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

function isInternalScraperTag(type: string): boolean {
  return type.startsWith("scraper.") || type.startsWith("scraper-run.");
}

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
      className={selectorOptionClassName(props.selected, {
        twoLine: true,
        fillHeight: props.fillHeight,
      })}
      onPointerUp={handleHapticPress}
      onClick={props.onSelect}
      type="button"
      role="checkbox"
      aria-checked={props.selected}
      aria-label={`${props.tag.tag}, ${typeLabel}`}
    >
      <SelectionIndicator selected={props.selected} shape="checkbox" />
      <span className="flex min-w-0 flex-col" aria-hidden="true">
        <span className="text-foreground font-medium">{props.tag.tag}</span>
        <span className="text-muted-foreground text-xs">{typeLabel}</span>
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
    refetch,
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

    const tags = tagsData.tags.filter((tag) => !isInternalScraperTag(tag.type));

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

  // Search results are virtualized against the modal body, which is the
  // only scroller; the list sits below the search controls inside it.
  const { listRef, scrollMargin, scrollPaddingStart } =
    useVirtualListScrollMargin(slideModalScrollRef);
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: allTags.length,
    getScrollElement: () => slideModalScrollRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
    scrollMargin,
    scrollPaddingStart,
  });

  const footer = (
    <ModalActionBar
      secondaryAction={
        <Button
          label={t("tagSelector.clearAll")}
          variant="secondary"
          onClick={handleClearAll}
          disabled={selectedTags.length === 0}
        />
      }
      primaryAction={
        <Button
          label={
            selectedTags.length > 0
              ? t("tagSelector.applyCount", {
                  count: selectedTags.length,
                })
              : t("tagSelector.apply")
          }
          onClick={handleApply}
        />
      }
    />
  );

  return (
    <SlideModal
      isOpen={isOpen}
      close={onClose}
      title={title || t("tagSelector.title")}
      footer={footer}
      footerSkipLabel={t("accessibility.skipToActions")}
      scrollRef={slideModalScrollRef}
      fixedHeight="90vh"
    >
      {/* Search and expand controls scroll with the list */}
      <div className="pb-2">
        <TextInput
          type="search"
          inputMode="search"
          className="mb-3"
          aria-label={t("tagSelector.searchTags")}
          placeholder={t("tagSelector.searchPlaceholder")}
          value={searchQuery}
          setValue={setSearchQuery}
          clearable
        />

        {types.length > 0 && !debouncedSearchQuery && (
          <Button
            onClick={handleExpandCollapseAll}
            variant="text"
            size="sm"
            icon={
              allExpanded ? (
                <ChevronUpIcon size={20} />
              ) : (
                <ChevronDownIcon size={20} />
              )
            }
            label={
              allExpanded
                ? t("tagSelector.collapseAll")
                : t("tagSelector.expandAll")
            }
          />
        )}
      </div>

      {isLoading ? (
        <DelayedLoading>
          <InlineLoading />
        </DelayedLoading>
      ) : isError ? (
        <EmptyState
          className="h-32"
          title={t("tagSelector.unavailable")}
          action={
            <Button
              label={t("library.tryAgain")}
              variant="outline"
              onClick={() => void refetch()}
            />
          }
        />
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
        accessibleLists ? (
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
            ref={listRef}
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
                    transform: `translateY(${virtualItem.start - scrollMargin}px)`,
                    padding: "2px 0",
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
        )
      ) : (
        // Accordion view for organized categories
        <Accordion
          type="multiple"
          value={expandedSections}
          onValueChange={handleAccordionChange}
          className="space-y-2 pb-4"
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
                className="border-border overflow-hidden rounded-lg border"
              >
                <AccordionTrigger className="bg-surface-inset hover:bg-surface-highlight px-4 py-3 hover:no-underline">
                  <div className="flex w-full items-center justify-between">
                    <span>
                      {t(`tagSelector.type.${type}`, {
                        defaultValue: type,
                      })}{" "}
                      ({tagsInType.length})
                    </span>
                    {selectedInType > 0 && (
                      <Badge variant="info" className="mr-2">
                        {selectedInType}
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-2 pb-3">
                  <div className="space-y-1">
                    {tagsInType.map((tag) => {
                      const formattedTag = `${tag.type}:${tag.tag}`;
                      const isSelected = selectedTags.includes(formattedTag);

                      return (
                        <button
                          key={tag.tag}
                          className={selectorOptionClassName(isSelected)}
                          onPointerUp={handleHapticPress}
                          onClick={() => handleTagSelect(tag)}
                          type="button"
                          role="checkbox"
                          aria-checked={isSelected}
                          aria-label={tag.tag}
                        >
                          <SelectionIndicator
                            selected={isSelected}
                            shape="checkbox"
                          />
                          <span
                            className="text-foreground min-w-0 text-sm font-medium"
                            aria-hidden="true"
                          >
                            {tag.tag}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      <BackToTop scrollContainerRef={slideModalScrollRef} threshold={200} />
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

  return (
    <SelectorTrigger
      text={displayText}
      placeholder={selectedTags.length === 0}
      onClick={onClick}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
    />
  );
}
