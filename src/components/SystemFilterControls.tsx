import { useState } from "react";
import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSmartTabs } from "@/hooks/useSmartTabs";
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
  const [showLeftGradient, setShowLeftGradient] = useState(false);
  const [showRightGradient, setShowRightGradient] = useState(true);
  const { hasOverflow, tabsProps } = useSmartTabs<HTMLDivElement>({
    onScrollChange: (scrollLeft, overflow) => {
      if (!overflow) return;

      const container = tabsProps.ref.current;
      if (!container) return;
      const { scrollWidth, clientWidth } = container;
      setShowLeftGradient(scrollLeft > 0);
      setShowRightGradient(scrollLeft < scrollWidth - clientWidth - 1);
    },
  });

  return (
    <div className="flex flex-col">
      {showSearch && (
        <div className={pageLayout ? "px-1 pb-2" : "space-y-4 p-2 pt-3"}>
          <div className="relative">
            <Search
              className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="text"
              aria-label={t("systemSelector.searchSystems")}
              placeholder={t("systemSelector.searchPlaceholder")}
              value={query}
              onChange={(event) => props.onQueryChange?.(event.target.value)}
              className="border-input bg-background text-foreground w-full rounded-md border px-10 py-2 focus:ring-2 focus:ring-white/20 focus:outline-none"
            />
            {query && (
              <button
                onClick={() => props.onQueryChange?.("")}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
                type="button"
                aria-label={t("systemSelector.clearSearch")}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

      <div
        className={
          pageLayout ? (showSearch ? "px-1 py-2" : "px-1 pb-2") : "px-2 py-2"
        }
      >
        <div className="relative overflow-hidden rounded-lg">
          {hasOverflow && (
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute top-0 bottom-0 left-0 z-10 w-8 bg-gradient-to-r from-[rgba(17,25,40,0.9)] to-transparent transition-opacity duration-200 ${
                showLeftGradient ? "opacity-100" : "opacity-0"
              }`}
            />
          )}

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
            containerProps={tabsProps}
          />

          {hasOverflow && (
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute top-0 right-0 bottom-0 z-10 w-8 bg-gradient-to-l from-[rgba(17,25,40,0.9)] to-transparent transition-opacity duration-200 ${
                showRightGradient ? "opacity-100" : "opacity-0"
              }`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
