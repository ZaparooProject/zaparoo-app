import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { SearchResultGame, SearchResultsResponse } from "@/lib/models.ts";
import { useStatusStore } from "@/lib/store.ts";
import { Card } from "@/components/wui/Card.tsx";
import { NextIcon, SettingsIcon, WarningIcon } from "@/lib/images.tsx";
import { LoadingSpinner } from "@/components/ui/loading-spinner.tsx";
import { Button } from "@/components/wui/Button.tsx";

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
  const { t } = useTranslation();

  // Screen reader announcement for search results
  const getAriaLiveMessage = () => {
    if (props.loading) return t("create.search.loading");
    if (props.error) return t("create.search.searchError");
    if (props.resp?.results) {
      const count = props.resp.results.length;
      return count === 0
        ? t("create.search.noResultsFoundSimple")
        : `${count} ${count === 1 ? 'result' : 'results'} found`;
    }
    return "";
  };

  if (!gamesIndex.exists) {
    return (
      <Card className="mt-3">
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="px-1.5 text-error">
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
              focus: "database"
            }}
          >
            <Button icon={<SettingsIcon size="24" />} variant="text" />
          </Link>
        </div>
      </Card>
    );
  }


  // Show initial state when no search has been performed
  if (!props.hasSearched && !props.resp) {
    return (
      <div className="text-center text-white/60">
        <p className="text-lg mb-2">{t("create.search.startSearching")}</p>
        <p className="text-sm">{t("create.search.startSearchingHint")}</p>
      </div>
    );
  }

  // Show loading spinner when searching
  if (props.loading) {
    return (
      <div className="flex items-center gap-2 justify-center text-white/60">
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
    const hasActiveFilters = props.searchSystem !== "all" || (props.searchTags && props.searchTags.length > 0);
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
      mainMessage = t("create.search.noResultsFound", { query: props.searchQuery });
      if (hasActiveFilters) {
        suggestionMessage = t("create.search.tryDifferentSearch");
      } else {
        suggestionMessage = t("create.search.tryDifferentTerms");
      }
    }

    return (
      <div className="text-center">
        <p className="text-white mb-3">{mainMessage}</p>
        {suggestionMessage && (
          <p className="text-sm text-white/70 mb-3">
            {suggestionMessage}
          </p>
        )}
        {hasActiveFilters && props.onClearFilters && (
          <div className="flex justify-center mt-2">
            <Button
              label={t("create.search.clearFilters")}
              onClick={props.onClearFilters}
              variant="outline"
            />
          </div>
        )}
      </div>
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
              <div
                key={i}
                className="flex cursor-pointer flex-row items-center justify-between gap-1 p-1 py-3"
                style={{
                  borderBottom:
                    i === (props.resp ? props.resp.results.length : 0) - 1
                      ? ""
                      : "1px solid rgba(255,255,255,0.6)"
                }}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.preventDefault();
                  handleGameSelect();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleGameSelect();
                  }
                }}
            >
              <div className="flex flex-col">
                <p className="font-semibold">{game.name}</p>
                <p className="text-sm">{game.system.name}</p>
                {game.tags && game.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {game.tags.slice(0, 4).map((tag, tagIndex) => (
                      <span
                        key={tagIndex}
                        className="inline-block px-2 py-0.5 text-xs rounded-full bg-white/20 text-white/80"
                      >
                        {tag.tag}
                      </span>
                    ))}
                    {game.tags.length > 4 && (
                      <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-white/10 text-white/60">
                        +{game.tags.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div>
                <NextIcon size="20" />
              </div>
            </div>
            );
          })}
        </div>
      </>
    );
  }
}
