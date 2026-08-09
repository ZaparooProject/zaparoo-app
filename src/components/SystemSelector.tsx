import { useState, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check } from "lucide-react";
import { useDebounce } from "use-debounce";
import classNames from "classnames";
import { CoreAPI } from "@/lib/coreApi";
import type { System } from "@/lib/models";
import {
  filterSystemCatalog,
  systemHasIndexedMedia,
} from "@/lib/systemFilters";
import { useStatusStore } from "@/lib/store";
import { useSystemsWithDisplayNames } from "@/hooks/useSystemName";
import { EmptyState } from "@/components/wui/EmptyState";
import { getTabBarPanelId, getTabBarTabId } from "@/components/wui/tabBarIds";
import { SystemFilterControls } from "@/components/SystemFilterControls";
import { useAnnouncer } from "./A11yAnnouncer";
import { SlideModal } from "./SlideModal";
import { Button } from "./wui/Button";
import { BackToTop } from "./BackToTop";

export type { System } from "@/lib/models";

interface SystemSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (systems: string[]) => void;
  selectedSystems: string[];
  mode: "single" | "multi" | "insert";
  title?: string;
  includeAllOption?: boolean;
  defaultSelection?: string; // When selectedSystems is empty, what should be shown as selected (e.g., "all" or undefined for nothing)
  allowedSystemIds?: string[];
  // Include unavailable launcher-backed systems for first-time partial indexes.
  allSystems?: boolean;
  includeEmptySystems?: boolean;
}

const ITEM_HEIGHT = 56; // Height of each system item in pixels

export function SystemSelector({
  isOpen,
  onClose,
  onSelect,
  selectedSystems,
  mode,
  title,
  includeAllOption = false,
  defaultSelection,
  allowedSystemIds,
  allSystems = false,
  includeEmptySystems = false,
}: SystemSelectorProps) {
  const { t } = useTranslation();
  const { announce } = useAnnouncer();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const slideModalScrollRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);
  const targetDeviceAddress = useStatusStore(
    (state) => state.targetDeviceAddress,
  );

  // Fetch systems data
  const { data: systemsData, isLoading } = useQuery({
    queryKey: ["systems", targetDeviceAddress, { all: allSystems }],
    queryFn: () => CoreAPI.systems(allSystems ? { all: true } : undefined),
    enabled: isOpen,
    staleTime: 0,
  });
  const catalogSystems = useMemo(
    () => systemsData?.systems ?? [],
    [systemsData?.systems],
  );
  const displaySystems = useSystemsWithDisplayNames(catalogSystems);

  const { systems: filteredSystems, categories } = useMemo(
    () =>
      filterSystemCatalog(displaySystems, {
        allowedSystemIds,
        includeEmptySystems,
        category: selectedCategory,
        query: debouncedSearchQuery,
      }),
    [
      displaySystems,
      allowedSystemIds,
      includeEmptySystems,
      debouncedSearchQuery,
      selectedCategory,
    ],
  );

  // Handle system selection
  const handleSystemSelect = useCallback(
    (systemId: string) => {
      if (mode === "single" || mode === "insert") {
        if (systemId === "all") {
          onSelect([]);
          announce(
            t("systemSelector.selected", {
              name: t("systemSelector.allSystems"),
            }),
          );
        } else {
          const systemName =
            displaySystems.find((system) => system.id === systemId)?.name ||
            systemId;
          onSelect([systemId]);
          announce(t("systemSelector.selected", { name: systemName }));
        }
        onClose();
      } else {
        // Multi-select mode
        const wasSelected = selectedSystems.includes(systemId);
        const newSelection = wasSelected
          ? selectedSystems.filter((id) => id !== systemId)
          : [...selectedSystems, systemId];
        onSelect(newSelection);

        // Announce the state change
        const systemName =
          displaySystems.find((system) => system.id === systemId)?.name ||
          systemId;
        if (wasSelected) {
          announce(t("systemSelector.deselected", { name: systemName }));
        } else {
          announce(t("systemSelector.selected", { name: systemName }));
        }
      }
    },
    [mode, selectedSystems, onSelect, onClose, announce, t, displaySystems],
  );

  // Handle clear all
  const handleClearAll = useCallback(() => {
    onSelect([]);
  }, [onSelect]);

  // Handle apply (for multi-select)
  const handleApply = useCallback(() => {
    onClose();
  }, [onClose]);

  // Set up virtualizer
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: filteredSystems.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  const systemTabIdPrefix = "system-category-tab";
  const selectedCategoryTabId = getTabBarTabId(
    selectedCategory,
    systemTabIdPrefix,
  );
  const selectedCategoryPanelId = getTabBarPanelId(selectedCategoryTabId);

  // Footer for multi-select mode
  const footer =
    mode === "multi" ? (
      <div className="border-border flex flex-col gap-3 border-t p-2">
        <div className="text-center">
          <span className="text-muted-foreground text-sm">
            {t("systemSelector.selectedCount", {
              count: selectedSystems.length,
            })}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {selectedSystems.length > 0 && (
            <button
              onClick={handleClearAll}
              className="text-muted-foreground hover:text-foreground text-sm underline"
              type="button"
            >
              {t("systemSelector.clearAll")}
            </button>
          )}
          <Button
            label={t("systemSelector.apply")}
            onClick={handleApply}
            className="flex-1"
            disabled={selectedSystems.length === 0 && !includeAllOption}
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
      scrollRef={slideModalScrollRef}
      fixedHeight="90vh"
    >
      <div className="flex min-h-0 flex-col">
        <SystemFilterControls
          categories={categories}
          category={selectedCategory}
          onCategoryChange={setSelectedCategory}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          tabIdPrefix={systemTabIdPrefix}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          <div
            id={selectedCategoryPanelId}
            role="tabpanel"
            aria-labelledby={selectedCategoryTabId}
            className="min-h-0 flex-1 overflow-hidden"
            tabIndex={-1}
          >
            {isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <span className="text-muted-foreground">{t("loading")}</span>
              </div>
            ) : filteredSystems.length === 0 ? (
              debouncedSearchQuery ? (
                <EmptyState
                  className="h-32"
                  title={t("systemSelector.noResults")}
                  description={t("systemSelector.noResultsHint")}
                />
              ) : (
                <EmptyState
                  className="h-32"
                  title={t("systemSelector.noSystems")}
                />
              )
            ) : (
              <>
                {/* Add "All Systems" option for single/insert mode */}
                {(mode === "single" || mode === "insert") &&
                  includeAllOption &&
                  selectedCategory === "all" &&
                  !debouncedSearchQuery.trim() && (
                    <div className="px-2 pb-2">
                      <button
                        className={classNames(
                          "flex w-full items-center justify-between px-4 py-3 text-left transition-colors",
                          "rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                          "hover:bg-white/10 focus:bg-white/10",
                          {
                            "bg-white/10":
                              defaultSelection === "all" &&
                              selectedSystems.length === 0,
                          },
                        )}
                        onClick={() => handleSystemSelect("all")}
                        type="button"
                        role="radio"
                        aria-checked={
                          defaultSelection === "all" &&
                          selectedSystems.length === 0
                        }
                        aria-label={t("systemSelector.allSystems")}
                      >
                        <div
                          className="flex items-center space-x-3"
                          aria-hidden="true"
                        >
                          {mode !== "insert" && (
                            <div
                              className={classNames(
                                "border-input h-5 w-5 rounded-full border-2",
                                {
                                  "bg-primary border-primary":
                                    defaultSelection === "all" &&
                                    selectedSystems.length === 0,
                                },
                              )}
                            >
                              {defaultSelection === "all" &&
                                selectedSystems.length === 0 && (
                                  <div className="bg-background m-0.5 h-2 w-2 rounded-full" />
                                )}
                            </div>
                          )}
                          <span className="text-foreground font-medium">
                            {t("systemSelector.allSystems")}
                          </span>
                        </div>
                      </button>
                    </div>
                  )}
                <div
                  ref={scrollContainerRef}
                  className="flex-1 overflow-auto px-2"
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
                      const system = filteredSystems[virtualItem.index];
                      if (!system) return null;
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
                            transform: `translateY(${virtualItem.start}px)`,
                          }}
                        >
                          <button
                            className={classNames(
                              "flex w-full items-center justify-between px-4 py-3 text-left transition-colors",
                              "rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                              "hover:bg-white/10 focus:bg-white/10",
                              {
                                "bg-white/10": isSelected,
                              },
                            )}
                            onClick={() => handleSystemSelect(system.id)}
                            type="button"
                            role={mode === "multi" ? "checkbox" : "radio"}
                            aria-checked={isSelected}
                            aria-label={system.name}
                          >
                            <div
                              className="flex items-center space-x-3"
                              aria-hidden="true"
                            >
                              {mode === "insert" ? null : mode === "multi" ? (
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
                              ) : (
                                <div
                                  className={classNames(
                                    "border-input h-5 w-5 rounded-full border-2",
                                    {
                                      "bg-primary border-primary": isSelected,
                                    },
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
              </>
            )}
          </div>
        </div>

        {/* Scroll to top button */}
        <BackToTop
          scrollContainerRef={slideModalScrollRef}
          threshold={200}
          bottomOffset={
            mode === "single" || mode === "insert"
              ? "1rem"
              : "calc(1rem + 100px)"
          }
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
  onClick,
  disabled = false,
  includeEmptySystems = false,
}: {
  selectedSystems: string[];
  systemsData?: { systems: System[] };
  placeholder?: string;
  mode?: "single" | "multi" | "insert";
  className?: string;
  onClick: () => void;
  disabled?: boolean;
  includeEmptySystems?: boolean;
}) {
  const { t } = useTranslation();
  const catalogSystems = useMemo(() => {
    const systems = systemsData?.systems ?? [];
    return includeEmptySystems
      ? systems
      : systems.filter(systemHasIndexedMedia);
  }, [includeEmptySystems, systemsData?.systems]);
  const displaySystems = useSystemsWithDisplayNames(catalogSystems);

  const displayText = useMemo(() => {
    if (!systemsData?.systems) return placeholder;

    if (selectedSystems.length === 0) {
      return mode === "single" || mode === "insert"
        ? t("systemSelector.allSystems")
        : placeholder;
    }

    if (selectedSystems.length === displaySystems.length) {
      return t("systemSelector.allSystems");
    }

    if (
      (mode === "single" || mode === "insert") &&
      selectedSystems.length === 1
    ) {
      const system = displaySystems.find((s) => s.id === selectedSystems[0]);
      return system?.name || selectedSystems[0];
    }

    if (selectedSystems.length <= 3) {
      const systemNames = selectedSystems
        .map(
          (id) => displaySystems.find((system) => system.id === id)?.name || id,
        )
        .join(", ");
      return systemNames;
    }

    return t("systemSelector.multipleSelected", {
      count: selectedSystems.length,
    });
  }, [
    selectedSystems,
    systemsData?.systems,
    displaySystems,
    placeholder,
    mode,
    t,
  ]);

  const isDisabled = disabled;

  const handleClick = () => {
    if (isDisabled) return;
    onClick();
  };

  return (
    <button
      onClick={handleClick}
      className={classNames(
        "border-input text-foreground flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors focus:ring-2 focus:ring-white/20 focus:outline-none",
        {
          "hover:bg-white/10": !isDisabled,
          "cursor-not-allowed opacity-50": isDisabled,
        },
        className,
      )}
      style={{ backgroundColor: "var(--color-background)" }}
      disabled={isDisabled}
      type="button"
    >
      <span
        className={classNames({
          "text-muted-foreground": selectedSystems.length === 0,
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
