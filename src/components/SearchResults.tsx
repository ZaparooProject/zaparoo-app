import { useTranslation } from "react-i18next";
import { Heart } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { SearchResultGame, SearchResultsResponse } from "@/lib/models.ts";
import { useStatusStore } from "@/lib/store.ts";
import { usePreferencesStore } from "@/lib/preferencesStore.ts";
import { filenameFromPath } from "@/lib/path.ts";
import { hasFavoriteTag } from "@/lib/libraryMedia";
import { Card } from "@/components/wui/Card.tsx";
import { NextIcon, SettingsIcon, WarningIcon } from "@/lib/images.tsx";
import { LoadingSpinner } from "@/components/ui/loading-spinner.tsx";
import { Button } from "@/components/wui/Button.tsx";
import { EmptyState } from "@/components/wui/EmptyState.tsx";
import { TagList } from "@/components/TagList.tsx";
import { useSystemNameResolver } from "@/hooks/useSystemName";

export function SearchResults(props: {
  loading: boolean;
  error: boolean;
  resp: SearchResultsResponse | null;
  selectedResult: SearchResultGame | null;
  setSelectedResult: (game: SearchResultGame | null) => void;
  hasSearched?: boolean;
  searchQuery?: string;
  searchSystem?: string;
  searchTags?: string[];
  onClearFilters?: () => void;
}) {
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const showFilenames = usePreferencesStore((s) => s.showFilenames);
  const resolveSystemName = useSystemNameResolver();
  const { t } = useTranslation();

  // Screen reader announcement for search results
  const getAriaLiveMessage = () => {
    if (props.loading) return t("create.search.loading");
    if (props.error) return t("create.search.searchError");
    if (props.resp?.results) {
      const count = props.resp.results.length;
      return count === 0
        ? t("create.search.noResultsFoundSimple")
        : t("create.search.resultsFound", { count });
    }
    return "";
  };

  if (!gamesIndex.exists) {
    return (
      <Card className="mt-3">
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="text-error px-1.5">
            <WarningIcon size="24" />
          </div>
          <div className="flex grow flex-col">
            <span className="font-medium">
              {t("create.search.gamesDbUpdate")}
            </span>
          </div>
          <Link
            to="/settings"
            search={{
              focus: "database",
            }}
            aria-label={t("create.search.gamesDbSettings")}
            className="focus-visible:ring-offset-background flex h-10 w-10 min-w-10 items-center justify-center rounded-full px-1.5 text-white focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <SettingsIcon size="24" aria-hidden="true" />
          </Link>
        </div>
      </Card>
    );
  }

  // Show initial state when no search has been performed
  if (!props.hasSearched && !props.resp) {
    return (
      <EmptyState
        title={t("create.search.startSearching")}
        description={t("create.search.startSearchingHint")}
      />
    );
  }

  // Show loading spinner when searching
  if (props.loading) {
    return (
      <div className="text-muted-foreground flex items-center justify-center gap-2">
        <LoadingSpinner size={16} className="text-primary" />
        <span>{t("create.search.loading")}</span>
      </div>
    );
  }

  if (props.error) {
    return <p className="text-center">{t("create.search.searchError")}</p>;
  }

  if (!props.resp) {
    return <></>;
  }

  // Enhanced empty state with helpful suggestions
  if (props.resp.results.length === 0) {
    const hasActiveFilters =
      props.searchSystem !== "all" ||
      (props.searchTags && props.searchTags.length > 0);
    const hasQuery = props.searchQuery && props.searchQuery.trim().length > 0;

    let mainMessage: string;
    let suggestionMessage: string;

    if (!hasQuery) {
      // No search query - just show simple message
      mainMessage = t("create.search.noResultsFoundSimple");
      suggestionMessage = hasActiveFilters
        ? t("create.search.tryRemovingFiltersOnly")
        : "";
    } else {
      // Has search query
      mainMessage = t("create.search.noResultsFound", {
        query: props.searchQuery,
      });
      if (hasActiveFilters) {
        suggestionMessage = t("create.search.tryDifferentSearch");
      } else {
        suggestionMessage = t("create.search.tryDifferentTerms");
      }
    }

    return (
      <EmptyState
        title={mainMessage}
        description={suggestionMessage || undefined}
        action={
          hasActiveFilters && props.onClearFilters ? (
            <Button
              label={t("create.search.clearFilters")}
              onClick={props.onClearFilters}
              variant="outline"
            />
          ) : undefined
        }
      />
    );
  }

  if (props.resp.results.length > 0) {
    return (
      <>
        {/* Screen reader announcements */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {getAriaLiveMessage()}
        </div>

        {/* Results list */}
        <div>
          {props.resp.results.map((game, i) => {
            // Primary display: filename if global pref enabled, otherwise clean name
            const displayName = showFilenames
              ? filenameFromPath(game.path) || game.name
              : game.name;
            const displayTags = game.disambiguatingTags ?? [];

            const handleGameSelect = () => {
              if (
                props.selectedResult &&
                props.selectedResult.path === game.path
              ) {
                props.setSelectedResult(null);
              } else if (
                props.selectedResult &&
                props.selectedResult.path !== game.path
              ) {
                props.setSelectedResult(null);
                setTimeout(() => {
                  props.setSelectedResult(game);
                }, 150);
              } else {
                props.setSelectedResult(game);
              }
            };

            return (
              <button
                key={i}
                type="button"
                className="flex w-full cursor-pointer flex-row items-center justify-between gap-1 p-1 py-3 text-left focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
                style={{
                  borderBottom:
                    i === (props.resp ? props.resp.results.length : 0) - 1
                      ? ""
                      : "1px solid rgba(255,255,255,0.6)",
                }}
                onClick={(e) => {
                  e.preventDefault();
                  handleGameSelect();
                }}
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="font-semibold">{displayName}</p>
                  <p className="text-sm">
                    {resolveSystemName(game.system.id, game.system.name)}
                  </p>
                  <TagList tags={displayTags} preserveOrder />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {hasFavoriteTag(game.tags) && (
                    <span aria-label={t("library.favorite")}>
                      <Heart size={18} fill="currentColor" aria-hidden="true" />
                    </span>
                  )}
                  <span aria-hidden="true">
                    <NextIcon size="20" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </>
    );
  }
}
