import {
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CoreAPI } from "@/lib/coreApi";
import {
  filterSystemCatalog,
  systemHasIndexedMedia,
  systemManufacturers,
  systemSubtitle,
  type SystemReleasePeriod,
  type SystemSort,
} from "@/lib/systemFilters";
import { useStatusStore } from "@/lib/store";
import {
  libraryBrowseScrollKey,
  useLibrarySessionStore,
} from "@/lib/librarySessionStore";
import { useTabSessionStore } from "@/lib/tabSessionStore";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { useSystemsWithDisplayNames } from "@/hooks/useSystemName";
import { PageFrame } from "@/components/PageFrame";
import { BackToTop } from "@/components/BackToTop";
import { SystemFilterControls } from "@/components/SystemFilterControls";
import { LibraryHeaderActions } from "@/components/library/LibraryHeader";
import { LibrarySystemFiltersModal } from "@/components/library/LibrarySystemFiltersModal";
import { LibrarySystemRefinementBar } from "@/components/library/LibrarySystemRefinementBar";
import { getTabBarPanelId, getTabBarTabId } from "@/components/wui/tabBarIds";
import { EmptyState } from "@/components/wui/EmptyState";
import { Button } from "@/components/wui/Button";
import { Card } from "@/components/wui/Card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { DelayedLoading } from "@/components/DelayedLoading";
import { NextIcon } from "@/lib/images";

export const Route = createFileRoute("/library/")({
  component: Library,
});

export function Library() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("library.title"),
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedCategory = useLibrarySessionStore((state) => state.category);
  const setSelectedCategory = useLibrarySessionStore(
    (state) => state.setCategory,
  );
  const manufacturerFilter = useLibrarySessionStore(
    (state) => state.manufacturer,
  );
  const setManufacturerFilter = useLibrarySessionStore(
    (state) => state.setManufacturer,
  );
  const releasePeriod = useLibrarySessionStore((state) => state.releasePeriod);
  const setReleasePeriod = useLibrarySessionStore(
    (state) => state.setReleasePeriod,
  );
  const sort = useLibrarySessionStore((state) => state.sort);
  const setSort = useLibrarySessionStore((state) => state.setSort);
  const mediaSort = useLibrarySessionStore((state) => state.mediaSort);
  const folderLevels = useLibrarySessionStore((state) => state.folderLevels);
  const forgetScroll = useTabSessionStore((state) => state.forgetScroll);
  const activateLibraryDevice = useLibrarySessionStore(
    (state) => state.activateDevice,
  );
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [draftManufacturer, setDraftManufacturer] = useState("");
  const [draftReleasePeriod, setDraftReleasePeriod] =
    useState<SystemReleasePeriod>("any");
  const [draftSort, setDraftSort] = useState<SystemSort>("name-asc");
  const connected = useStatusStore((state) => state.connected);
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const targetDeviceAddress = useStatusStore(
    (state) => state.targetDeviceAddress,
  );
  useLayoutEffect(() => {
    activateLibraryDevice(targetDeviceAddress);
  }, [activateLibraryDevice, targetDeviceAddress]);
  const libraryFeature = useCoreFeature("mediaLibrary");
  const favoritesFeature = useCoreFeature("mediaFavorites");
  const systemsQuery = useQuery({
    queryKey: ["systems", targetDeviceAddress, { all: false }],
    queryFn: () => CoreAPI.systems(),
    enabled: connected && gamesIndex.exists && libraryFeature.available,
    staleTime: 60 * 1000,
  });
  const catalogSystems = useMemo(
    () => systemsQuery.data?.systems ?? [],
    [systemsQuery.data?.systems],
  );
  const allSystems = useSystemsWithDisplayNames(catalogSystems);
  const { systems, categories } = useMemo(
    () =>
      filterSystemCatalog(allSystems, {
        category: selectedCategory,
        manufacturer: manufacturerFilter,
        query: "",
        releasePeriod,
        sort,
      }),
    [allSystems, selectedCategory, manufacturerFilter, releasePeriod, sort],
  );
  const manufacturerOptions = useMemo(
    () => systemManufacturers(allSystems),
    [allSystems],
  );
  const draftResultCount = useMemo(
    () =>
      filterSystemCatalog(allSystems, {
        category: selectedCategory,
        manufacturer: draftManufacturer,
        query: "",
        releasePeriod: draftReleasePeriod,
      }).systems.length,
    [allSystems, selectedCategory, draftManufacturer, draftReleasePeriod],
  );
  const availableSystemCount = allSystems.filter(systemHasIndexedMedia).length;
  const systemTabIdPrefix = "library-system-category-tab";
  const selectedCategoryTabId = getTabBarTabId(
    selectedCategory,
    systemTabIdPrefix,
  );
  const selectedCategoryPanelId = getTabBarPanelId(selectedCategoryTabId);

  const openOptions = () => {
    setDraftManufacturer(manufacturerFilter);
    setDraftReleasePeriod(releasePeriod);
    setDraftSort(sort);
    setOptionsOpen(true);
  };
  const clearOptions = () => {
    setManufacturerFilter("");
    setReleasePeriod("any");
    setSort("name-asc");
  };
  const optionsActive =
    manufacturerFilter !== "" || releasePeriod !== "any" || sort !== "name-asc";
  const beginSystemNavigation = (systemId: string) => {
    const path = folderLevels[systemId]?.at(-1)?.path ?? "";
    forgetScroll(libraryBrowseScrollKey(systemId, mediaSort, path));
  };

  const withLibrarySections = (systemsContent: ReactNode) => (
    <div className="flex flex-col gap-5">
      {favoritesFeature.available && (
        <section
          className="flex flex-col gap-2"
          aria-labelledby="library-collections-heading"
        >
          <h2
            id="library-collections-heading"
            className="text-muted-foreground text-sm font-semibold"
          >
            {t("library.collections")}
          </h2>
          <nav aria-label={t("library.favoritesLabel")}>
            <Link
              to="/library/favorites"
              onClick={() => forgetScroll("library:favorites:list")}
              className="block rounded-xl focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none sm:w-[calc(50%_-_0.375rem)]"
            >
              <Card className="flex min-h-16 items-center justify-between gap-3">
                <span className="flex items-center gap-3 font-semibold">
                  <Heart size={20} aria-hidden="true" />
                  {t("library.favorites")}
                </span>
                <span aria-hidden="true">
                  <NextIcon size="20" />
                </span>
              </Card>
            </Link>
          </nav>
        </section>
      )}
      <section
        className="flex flex-col gap-2"
        aria-labelledby="library-systems-heading"
      >
        <h2
          id="library-systems-heading"
          className="text-muted-foreground text-sm font-semibold"
        >
          {t("library.systems")}
        </h2>
        <div>{systemsContent}</div>
      </section>
    </div>
  );

  let content: ReactNode;
  if (!connected) {
    content = <EmptyState title={t("library.disconnected")} />;
  } else if (!libraryFeature.available) {
    content = (
      <EmptyState
        title={t("library.updateCore")}
        description={t("features.requiresCoreVersion", {
          version: libraryFeature.requiredVersion,
        })}
      />
    );
  } else if (!gamesIndex.exists) {
    content = (
      <EmptyState
        title={t("library.databaseRequired")}
        action={
          <Link
            to="/settings"
            search={{ focus: "database" }}
            className="border-bd-outline focus-visible:ring-offset-background flex items-center justify-center rounded-[20px] border border-solid px-6 py-1.5 font-medium text-white focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {t("library.openMediaSettings")}
          </Link>
        }
      />
    );
  } else if (systemsQuery.isLoading) {
    content = withLibrarySections(
      <DelayedLoading>
        <div className="text-muted-foreground flex items-center justify-center gap-2 py-8">
          <LoadingSpinner size={16} className="text-primary" />
          <span>{t("library.loadingSystems")}</span>
        </div>
      </DelayedLoading>,
    );
  } else if (systemsQuery.isError) {
    content = withLibrarySections(
      <EmptyState
        title={t("library.systemsError")}
        action={
          <Button
            label={t("library.tryAgain")}
            variant="outline"
            onClick={() => void systemsQuery.refetch()}
          />
        }
      />,
    );
  } else if (availableSystemCount === 0) {
    content = withLibrarySections(
      <EmptyState title={t("library.noSystems")} />,
    );
  } else {
    content = withLibrarySections(
      <>
        <SystemFilterControls
          categories={categories}
          category={selectedCategory}
          onCategoryChange={setSelectedCategory}
          showSearch={false}
          tabIdPrefix={systemTabIdPrefix}
          variant="page"
        />
        <LibrarySystemRefinementBar
          activeManufacturer={manufacturerFilter}
          releasePeriod={releasePeriod}
          sort={sort}
          onClearAll={clearOptions}
        />
        <div
          id={selectedCategoryPanelId}
          role="tabpanel"
          aria-labelledby={selectedCategoryTabId}
          tabIndex={-1}
        >
          {systems.length === 0 ? (
            <EmptyState
              className="h-32"
              title={t("systemSelector.noResults")}
              description={t("systemSelector.noResultsHint")}
            />
          ) : (
            <nav aria-label={t("library.systemsLabel")}>
              {systems.map((system, index) => {
                const subtitle = systemSubtitle(system);
                return (
                  <Link
                    key={system.id}
                    to="/library/$system"
                    params={{ system: system.id }}
                    onClick={() => beginSystemNavigation(system.id)}
                    className="flex min-h-[56px] items-center justify-between gap-3 px-1 py-3 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
                    style={{
                      borderBottom:
                        index === systems.length - 1
                          ? undefined
                          : "1px solid rgba(255,255,255,0.35)",
                    }}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">{system.name}</span>
                      {subtitle && (
                        <span className="text-muted-foreground text-sm">
                          {subtitle}
                        </span>
                      )}
                    </span>
                    <span aria-hidden="true">
                      <NextIcon size="20" />
                    </span>
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      </>,
    );
  }

  return (
    <>
      <PageFrame
        scrollRef={scrollRef}
        headerCenter={
          <h1 ref={headingRef} className="text-foreground text-xl">
            {t("library.title")}
          </h1>
        }
        headerRight={
          <LibraryHeaderActions
            onSearch={() => {
              forgetScroll("/library/search");
              void navigate({ to: "/library/search" });
            }}
            onOpenOptions={openOptions}
            searchDisabled={
              !connected || !gamesIndex.exists || !libraryFeature.available
            }
            optionsDisabled={
              !connected ||
              !gamesIndex.exists ||
              !libraryFeature.available ||
              systemsQuery.isLoading
            }
            optionsActive={optionsOpen || optionsActive}
          />
        }
      >
        {content}
        <BackToTop
          scrollContainerRef={scrollRef}
          threshold={200}
          bottomOffset="calc(var(--bottom-nav-base-height) + 1rem)"
        />
      </PageFrame>
      <LibrarySystemFiltersModal
        isOpen={optionsOpen}
        close={() => setOptionsOpen(false)}
        manufacturers={manufacturerOptions}
        selectedManufacturer={draftManufacturer}
        onSelectedManufacturerChange={setDraftManufacturer}
        releasePeriod={draftReleasePeriod}
        onReleasePeriodChange={setDraftReleasePeriod}
        sort={draftSort}
        onSortChange={setDraftSort}
        resultCount={draftResultCount}
        onReset={() => {
          setDraftManufacturer("");
          setDraftReleasePeriod("any");
          setDraftSort("name-asc");
        }}
        onApply={() => {
          setManufacturerFilter(draftManufacturer);
          setReleasePeriod(draftReleasePeriod);
          setSort(draftSort);
          setOptionsOpen(false);
        }}
      />
    </>
  );
}
