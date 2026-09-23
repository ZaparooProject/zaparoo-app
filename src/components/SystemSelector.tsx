import { useState, useMemo, useRef, useCallback, useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useDebounce } from "use-debounce";
import classNames from "classnames";
import { CoreAPI } from "@/lib/coreApi";
import type { System } from "@/lib/models";
import {
  filterSystemCatalog,
  systemHasIndexedMedia,
} from "@/lib/systemFilters";
import { handleRadioGroupKeyDown } from "@/lib/radioGroup";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useSystemsWithDisplayNames } from "@/hooks/useSystemName";
import { useHapticPress } from "@/hooks/useHapticPress";
import { EmptyState } from "@/components/wui/EmptyState";
import { ModalActionBar } from "@/components/wui/ModalActionBar";
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
  const slideModalScrollRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const footer = footerRef.current?.parentElement;
    const dialog = footer?.closest<HTMLElement>('[role="dialog"]');
    if (!footer || !dialog) return;

    // Wrapped actions must not end up underneath the floating scroll control.
    const measure = () =>
      dialog.style.setProperty(
        "--system-selector-footer-height",
        `${footer.getBoundingClientRect().height}px`,
      );
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(footer);
    return () => observer.disconnect();
  }, [isOpen, mode]);

  const handleHapticPress = useHapticPress();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);
  const deviceKey = useActiveDeviceKey();

  // Fetch systems data
  const { data: systemsData, isLoading } = useQuery({
    queryKey: ["systems", deviceKey, { all: allSystems }],
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

  const systemTabIdPrefix = "system-category-tab";
  const allOptionVisible =
    (mode === "single" || mode === "insert") &&
    includeAllOption &&
    selectedCategory === "all" &&
    !debouncedSearchQuery.trim();
  const allOptionSelected =
    allOptionVisible &&
    defaultSelection === "all" &&
    selectedSystems.length === 0;
  const hasRenderedSelection = filteredSystems.some((system) =>
    selectedSystems.includes(system.id),
  );

  const renderOption = (
    id: string,
    name: string,
    isSelected: boolean,
    tabIndex: number,
  ) => (
    <button
      key={id}
      className={classNames(
        "focus-visible:ring-ring flex min-h-12 w-full items-center justify-between gap-3 rounded px-2 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
        "hover:bg-foreground/10 focus-visible:bg-foreground/10",
        { "bg-foreground/10": isSelected },
      )}
      onPointerUp={handleHapticPress}
      onClick={() => handleSystemSelect(id)}
      type="button"
      role={mode === "multi" ? "checkbox" : "radio"}
      aria-checked={isSelected}
      aria-label={name}
      tabIndex={tabIndex}
    >
      <span className="text-foreground min-w-0 font-medium" aria-hidden="true">
        {name}
      </span>
      {mode !== "insert" && (
        <span
          aria-hidden="true"
          className={classNames(
            "border-input flex size-5 shrink-0 items-center justify-center border-2",
            mode === "multi" ? "rounded" : "rounded-full",
            { "bg-primary border-primary": isSelected },
          )}
        >
          {isSelected &&
            (mode === "multi" ? (
              <Check className="text-primary-foreground size-3" />
            ) : (
              <span className="bg-background size-2 rounded-full" />
            ))}
        </span>
      )}
    </button>
  );

  const footer =
    mode === "multi" ? (
      <div ref={footerRef}>
        <ModalActionBar
          secondaryAction={
            <Button
              label={t("systemSelector.clear")}
              aria-label={t("systemSelector.clearAll")}
              variant="text"
              size="sm"
              onClick={handleClearAll}
              disabled={selectedSystems.length === 0}
            />
          }
          primaryAction={
            <Button
              label={t("systemSelector.done")}
              size="sm"
              onClick={onClose}
              disabled={selectedSystems.length === 0 && !includeAllOption}
            />
          }
        />
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
      <div className="pb-2">
        <SystemFilterControls
          categories={categories}
          category={selectedCategory}
          onCategoryChange={(category) => {
            setSelectedCategory(category);
            slideModalScrollRef.current?.scrollTo({ top: 0 });
          }}
          query={searchQuery}
          onQueryChange={(query) => {
            setSearchQuery(query);
            slideModalScrollRef.current?.scrollTo({ top: 0 });
          }}
          tabIdPrefix={systemTabIdPrefix}
          variant="modal"
        />
      </div>
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
          <EmptyState className="h-32" title={t("systemSelector.noSystems")} />
        )
      ) : (
        <div
          role={mode === "multi" ? "group" : "radiogroup"}
          aria-label={t("systemSelector.title")}
          onKeyDown={mode === "multi" ? undefined : handleRadioGroupKeyDown}
        >
          {allOptionVisible &&
            renderOption(
              "all",
              t("systemSelector.allSystems"),
              allOptionSelected,
              allOptionSelected ? 0 : -1,
            )}
          {filteredSystems.map((system, index) => {
            const isSelected = selectedSystems.includes(system.id);
            return renderOption(
              system.id,
              system.name,
              isSelected,
              mode === "multi" ||
                isSelected ||
                (!allOptionSelected && !hasRenderedSelection && index === 0)
                ? 0
                : -1,
            );
          })}
        </div>
      )}
      <BackToTop
        scrollContainerRef={slideModalScrollRef}
        threshold={200}
        bottomOffset={
          mode === "multi"
            ? "calc(2rem + var(--system-selector-footer-height, 100px))"
            : "2rem"
        }
      />
    </SlideModal>
  );
}

// Helper component for displaying selected systems
export function SystemSelectorTrigger({
  selectedSystems,
  systemsData,
  placeholder,
  mode = "multi",
  className,
  onClick,
  disabled = false,
  includeEmptySystems = false,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: {
  selectedSystems: string[];
  systemsData?: { systems: System[] };
  placeholder?: string;
  mode?: "single" | "multi" | "insert";
  className?: string;
  onClick: () => void;
  disabled?: boolean;
  includeEmptySystems?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const { t } = useTranslation();
  const placeholderText = placeholder ?? t("systemSelector.title");
  const catalogSystems = useMemo(() => {
    const systems = systemsData?.systems ?? [];
    return includeEmptySystems
      ? systems
      : systems.filter(systemHasIndexedMedia);
  }, [includeEmptySystems, systemsData?.systems]);
  const displaySystems = useSystemsWithDisplayNames(catalogSystems);

  const displayText = useMemo(() => {
    if (!systemsData?.systems) return placeholderText;

    if (selectedSystems.length === 0) {
      return mode === "single" || mode === "insert"
        ? t("systemSelector.allSystems")
        : placeholderText;
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
    placeholderText,
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
        "wui-input border-input text-foreground focus-visible:ring-ring flex min-h-12 w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none",
        {
          "hover:border-foreground-hint": !isDisabled,
          "cursor-not-allowed opacity-50": isDisabled,
        },
        className,
      )}
      style={{ backgroundColor: "var(--surface-inset)" }}
      disabled={isDisabled}
      type="button"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
    >
      <span
        className={classNames({
          "text-muted-foreground": selectedSystems.length === 0,
        })}
      >
        {displayText}
      </span>
      <div aria-hidden="true" className="ml-2 size-4 shrink-0">
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
