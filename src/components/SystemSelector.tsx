import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, Check, X } from "lucide-react";
import { useDebounce } from "use-debounce";
import classNames from "classnames";
import { CoreAPI } from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";
import { SlideModal } from "./SlideModal";
import { Button } from "./wui/Button";
import { BackToTop } from "./BackToTop";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";

export interface System {
  id: string;
  name: string;
  category?: string;
}

interface SystemSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (systems: string[]) => void;
  selectedSystems: string[];
  mode: "single" | "multi";
  title?: string;
  includeAllOption?: boolean;
}

interface GroupedSystems {
  [category: string]: System[];
}

const ITEM_HEIGHT = 56; // Height of each system item in pixels

export function SystemSelector({
  isOpen,
  onClose,
  onSelect,
  selectedSystems,
  mode,
  title,
  includeAllOption = false
}: SystemSelectorProps) {
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tabsListRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);
  const [showLeftGradient, setShowLeftGradient] = useState(false);
  const [showRightGradient, setShowRightGradient] = useState(true);

  // Get indexing state to disable selector when indexing is in progress
  const gamesIndex = useStatusStore((state) => state.gamesIndex);

  // Fetch systems data
  const { data: systemsData, isLoading } = useQuery({
    queryKey: ["systems"],
    queryFn: () => CoreAPI.systems()
  });

  // Process and filter systems
  const { filteredSystems, categories } = useMemo(() => {
    if (!systemsData?.systems) {
      return { filteredSystems: [], categories: [] };
    }

    const systems = systemsData.systems;

    // Group systems by category
    const grouped: GroupedSystems = {};
    const categorySet = new Set<string>();

    systems.forEach((system) => {
      const category = system.category || "Other";
      categorySet.add(category);

      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(system);
    });

    // Sort categories alphabetically, but put common ones first
    const priorityCategories = ["Nintendo", "Sony", "Sega", "Atari"];
    const categories = Array.from(categorySet).sort((a, b) => {
      const aPriority = priorityCategories.indexOf(a);
      const bPriority = priorityCategories.indexOf(b);

      if (aPriority !== -1 && bPriority !== -1) {
        return aPriority - bPriority;
      }
      if (aPriority !== -1) return -1;
      if (bPriority !== -1) return 1;
      return a.localeCompare(b);
    });

    // Filter systems based on search and category
    let filtered: System[] = [];

    if (selectedCategory === "all") {
      filtered = systems;
    } else {
      filtered = grouped[selectedCategory] || [];
    }

    // Apply search filter
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (system) =>
          system.name.toLowerCase().includes(query) ||
          system.id.toLowerCase().includes(query)
      );
    }

    // Sort filtered systems by name
    filtered.sort((a, b) => a.name.localeCompare(b.name));

    return { filteredSystems: filtered, categories };
  }, [systemsData, debouncedSearchQuery, selectedCategory]);

  // Handle system selection
  const handleSystemSelect = useCallback(
    (systemId: string) => {
      // Don't allow selection while indexing
      if (gamesIndex.indexing) return;

      if (mode === "single") {
        onSelect([systemId]);
        onClose();
      } else {
        const newSelection = selectedSystems.includes(systemId)
          ? selectedSystems.filter((id) => id !== systemId)
          : [...selectedSystems, systemId];
        onSelect(newSelection);
      }
    },
    [mode, selectedSystems, onSelect, onClose, gamesIndex.indexing]
  );

  // Handle clear all
  const handleClearAll = useCallback(() => {
    // Don't allow clearing while indexing
    if (gamesIndex.indexing) return;
    onSelect([]);
  }, [onSelect, gamesIndex.indexing]);

  // Handle apply (for multi-select)
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
    count: filteredSystems.length,
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
  }, [handleTabsScroll, categories]); // Re-check when categories change

  // Footer for multi-select mode
  const footer =
    mode === "multi" ? (
      <div className="border-border flex flex-col gap-3 border-t p-2">
        <div className="text-center">
          <span className="text-muted-foreground text-sm">
            {t("systemSelector.selectedCount", {
              count: selectedSystems.length
            })}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {selectedSystems.length > 0 && (
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
              {t("systemSelector.clearAll")}
            </button>
          )}
          <Button
            label={t("systemSelector.apply")}
            onClick={handleApply}
            className="flex-1"
            disabled={gamesIndex.indexing || (selectedSystems.length === 0 && !includeAllOption)}
          />
        </div>
      </div>
    ) : undefined;

  return (
    <SlideModal
      isOpen={isOpen}
      close={onClose}
      title={title || t("systemSelector.title")}
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
              placeholder="Filter systems..."
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

        {/* Category tabs using shadcn tabs */}
        <Tabs
          value={selectedCategory}
          onValueChange={setSelectedCategory}
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
                  {t("systemSelector.allCategories")}
                </TabsTrigger>
                {categories.map((category) => (
                  <TabsTrigger key={category} value={category}>
                    {category}
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
            value={selectedCategory}
            className="min-h-0 flex-1 overflow-hidden"
          >
            {isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <span className="text-muted-foreground">{t("loading")}</span>
              </div>
            ) : filteredSystems.length === 0 ? (
              <div className="flex h-32 items-center justify-center">
                <span className="text-muted-foreground">
                  {debouncedSearchQuery
                    ? t("systemSelector.noResults")
                    : t("systemSelector.noSystems")}
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
                    const system = filteredSystems[virtualItem.index];
                    const isSelected = selectedSystems.includes(system.id);

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
                          onClick={() => handleSystemSelect(system.id)}
                          disabled={gamesIndex.indexing}
                          type="button"
                        >
                          <div className="flex items-center space-x-3">
                            {mode === "multi" ? (
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
                            ) : (
                              <div
                                className={classNames(
                                  "border-input h-5 w-5 rounded-full border-2",
                                  {
                                    "bg-primary border-primary": isSelected
                                  }
                                )}
                              >
                                {isSelected && (
                                  <div className="bg-background m-0.5 h-2 w-2 rounded-full" />
                                )}
                              </div>
                            )}
                            <span className="text-foreground font-medium">
                              {system.name}
                            </span>
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
          bottomOffset={mode === "single" ? "1rem" : "calc(1rem + 100px)"}
        />
      </div>
    </SlideModal>
  );
}

// Helper component for displaying selected systems
export function SystemSelectorTrigger({
  selectedSystems,
  systemsData,
  placeholder = "Select systems",
  mode = "multi",
  className,
  onClick
}: {
  selectedSystems: string[];
  systemsData?: { systems: System[] };
  placeholder?: string;
  mode?: "single" | "multi";
  className?: string;
  onClick: () => void;
}) {
  const { t } = useTranslation();

  // Get indexing state to disable trigger when indexing is in progress
  const gamesIndex = useStatusStore((state) => state.gamesIndex);

  const displayText = useMemo(() => {
    if (!systemsData?.systems) return placeholder;

    if (selectedSystems.length === 0) {
      return placeholder;
    }

    if (selectedSystems.length === systemsData.systems.length) {
      return t("systemSelector.allSystems");
    }

    if (mode === "single" && selectedSystems.length === 1) {
      const system = systemsData.systems.find(
        (s) => s.id === selectedSystems[0]
      );
      return system?.name || selectedSystems[0];
    }

    if (selectedSystems.length <= 3) {
      const systemNames = selectedSystems
        .map((id) => systemsData.systems.find((s) => s.id === id)?.name || id)
        .join(", ");
      return systemNames;
    }

    return t("systemSelector.multipleSelected", {
      count: selectedSystems.length
    });
  }, [selectedSystems, systemsData, placeholder, mode, t]);

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
          "text-muted-foreground": selectedSystems.length === 0
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
