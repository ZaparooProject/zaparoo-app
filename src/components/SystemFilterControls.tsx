import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSmartTabs } from "@/hooks/useSmartTabs";
import { TextInput } from "@/components/wui/TextInput";
import { TabBar } from "@/components/wui/TabBar";
import { getTabBarTabId } from "@/components/wui/tabBarIds";

export function SystemFilterControls(props: {
  categories: string[];
  category: string;
  onCategoryChange: (category: string) => void;
  query?: string;
  onQueryChange?: (query: string) => void;
  showSearch?: boolean;
  tabIdPrefix: string;
  variant?: "modal" | "page";
}) {
  const { t } = useTranslation();
  const pageLayout = props.variant === "page";
  const showSearch = props.showSearch !== false;
  const query = props.query ?? "";
  const [showLeftEdge, setShowLeftEdge] = useState(false);
  const [showRightEdge, setShowRightEdge] = useState(true);
  const { hasOverflow, tabsProps } = useSmartTabs<HTMLDivElement>({
    onScrollChange: (scrollLeft, overflow) => {
      if (!overflow) return;

      const container = tabsProps.ref.current;
      if (!container) return;
      const { scrollWidth, clientWidth } = container;
      setShowLeftEdge(scrollLeft > 0);
      setShowRightEdge(scrollLeft < scrollWidth - clientWidth - 1);
    },
  });

  const leftVisible = hasOverflow && showLeftEdge;
  const rightVisible = hasOverflow && showRightEdge;
  const maskImage =
    leftVisible && rightVisible
      ? "linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent)"
      : leftVisible
        ? "linear-gradient(to right, transparent, black 20px)"
        : rightVisible
          ? "linear-gradient(to left, transparent, black 20px)"
          : undefined;

  return (
    <div className="flex flex-col">
      {showSearch && (
        <div className={pageLayout ? "px-1 pb-2" : "space-y-4 pb-2"}>
          <TextInput
            type="search"
            inputMode="search"
            aria-label={t("systemSelector.searchSystems")}
            placeholder={t("systemSelector.searchPlaceholder")}
            value={query}
            setValue={(value) => props.onQueryChange?.(value)}
            clearable
          />
        </div>
      )}

      <div
        className={pageLayout ? (showSearch ? "px-1 py-2" : "pb-2") : "py-2"}
      >
        <div className="relative overflow-hidden rounded-lg">
          <TabBar
            label={t("systemSelector.categories")}
            layout="scroll"
            role="tab"
            options={[
              {
                value: "all",
                label: t("systemSelector.allCategories"),
                id: getTabBarTabId("all", props.tabIdPrefix),
              },
              ...props.categories.map((category) => ({
                value: category,
                label: category,
                id: getTabBarTabId(category, props.tabIdPrefix),
              })),
            ]}
            value={props.category}
            onChange={props.onCategoryChange}
            containerProps={{
              ...tabsProps,
              style: {
                ...tabsProps.style,
                maskImage,
                WebkitMaskImage: maskImage,
              },
            }}
          />

          {leftVisible && (
            <ChevronLeftIcon
              size={14}
              aria-hidden="true"
              data-testid="tabs-scroll-left"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-1 -translate-y-1/2"
            />
          )}
          {rightVisible && (
            <ChevronRightIcon
              size={14}
              aria-hidden="true"
              data-testid="tabs-scroll-right"
              className="text-muted-foreground pointer-events-none absolute top-1/2 right-1 -translate-y-1/2"
            />
          )}
        </div>
      </div>
    </div>
  );
}
