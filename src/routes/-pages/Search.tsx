import { getRouteApi, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Preferences } from "@capacitor/preferences";
import {
  MediaSearchForm,
  MediaSearchSelectors,
} from "@/components/MediaSearchForm";
import { MediaDetailsModal } from "@/components/MediaDetailsModal";
import { logger } from "@/lib/logger";
import { writeToClipboard } from "@/lib/clipboard";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import {
  CoreAPI,
  isCancelled,
  isExpectedMediaDatabaseError,
  logRunFailure,
} from "@/lib/coreApi";
import { BackIcon, HistoryIcon } from "@/lib/images";
import { SearchResultGame } from "@/lib/models";
import { useContextualNfcWrite } from "@/hooks/useContextualNfcWrite";
import { useMediaSearchForm } from "@/hooks/useMediaSearchForm";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { DEFAULT_GAMES_INDEX, useStatusStore } from "@/lib/store";
import {
  appBackNavigationOptions,
  useTabSessionStore,
  type SessionSearchParams,
} from "@/lib/tabSessionStore";
import { PageFrame } from "@/components/PageFrame";
import { useRecentSearches } from "@/hooks/useRecentSearches";
import { RecentSearchesModal } from "@/components/RecentSearchesModal";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";

export interface LoaderData {
  systemQuery: string;
  tagQuery: string[];
}

const route = getRouteApi("/create/search");

export function Search() {
  const { t } = useTranslation();
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("create.search.title"),
  );
  const loaderData = route.useLoaderData();
  const setGamesIndex = useStatusStore((state) => state.setGamesIndex);
  const connected = useStatusStore((state) => state.connected);
  const savedSearch = useTabSessionStore((state) => state.createSearch);
  const setSessionSearch = useTabSessionStore((state) => state.setCreateSearch);
  const [recentSearchesOpen, setRecentSearchesOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const {
    recentSearches,
    addRecentSearch,
    clearRecentSearches,
    getSearchDisplayText,
  } = useRecentSearches();
  const [selectedResult, setSelectedResult] = useState<SearchResultGame | null>(
    null,
  );

  const persistFilter = async (key: string, value: string) => {
    try {
      await Preferences.set({ key, value });
    } catch (err) {
      logger.warn("Failed to persist search filter", err, {
        category: "storage",
        action: "persistFilter",
        key,
        severity: "warning",
      });
    }
  };
  const recordRecentSearch = async (search: SessionSearchParams) => {
    try {
      await addRecentSearch(search);
    } catch (e) {
      logger.warn("Failed to record recent search", e, {
        category: "storage",
        action: "addRecentSearch",
        severity: "warning",
      });
    }
  };

  // Create remembers its filters between visits, its last search for the tab
  // session, and the searches the user submits as recent searches.
  const form = useMediaSearchForm({
    initialDraft: {
      query: savedSearch?.query,
      system: savedSearch?.system ?? loaderData.systemQuery,
      tags: savedSearch?.tags ?? loaderData.tagQuery,
    },
    initialSearch: savedSearch,
    dropUnsupportedTags: true,
    resetUnavailableSystem: true,
    onSearch: (search, source) => {
      // Clear any prior selection so the detail modal closes and
      // write/copy/run can't act on a row that may not be in the new results.
      setSelectedResult(null);
      setSessionSearch(search);
      if (source === "submit") void recordRecentSearch(search);
    },
    onFiltersChange: ({ system, tags }) => {
      setSelectedResult(null);
      void persistFilter("searchSystem", system);
      void persistFilter("searchTags", JSON.stringify(tags));
    },
  });

  // Closing the details, or selecting another result, ends the write they own.
  const writeActivity = useContextualNfcWrite(
    selectedResult
      ? `${selectedResult.system.id}:${selectedResult.path}`
      : null,
    selectedResult !== null,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await CoreAPI.media();
        if (cancelled || isCancelled(s)) return;
        setGamesIndex(s.database);
      } catch (e) {
        if (cancelled) return;
        if (isExpectedMediaDatabaseError(e)) {
          setGamesIndex(DEFAULT_GAMES_INDEX);
          return;
        }
        logger.error("Failed to fetch media index:", e, {
          category: "api",
          action: "media",
          severity: "error",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setGamesIndex]);

  const router = useRouter();
  const goBack = () =>
    void router.navigate(appBackNavigationOptions("/create"));

  return (
    <>
      <PageFrame
        layout="workspace"
        className="create-search-page"
        headerMode="content-wide"
        breadcrumbs={[{ to: "/create", label: t("create.title") }]}
        onSwipeBack={goBack}
        headerLeft={
          <HeaderButton
            onClick={goBack}
            icon={<BackIcon size="24" />}
            aria-label={t("nav.back")}
          />
        }
        headerCenter={
          <h1 ref={headingRef} className="text-foreground text-xl">
            {t("create.search.title")}
          </h1>
        }
        scrollRef={scrollContainerRef}
        headerRight={
          <HeaderButton
            onClick={() => setRecentSearchesOpen(true)}
            disabled={recentSearches.length === 0}
            active={recentSearchesOpen}
            aria-expanded={recentSearchesOpen}
            icon={<HistoryIcon size="24" />}
            title={t("create.search.recentSearches")}
            aria-label={t("create.search.recentSearches")}
          />
        }
      >
        <MediaSearchForm
          form={form}
          layout="create"
          scrollRef={scrollContainerRef}
          labels={{
            region: t("create.search.title"),
            input: t("create.search.gameInput"),
            placeholder: t("create.search.gameInputPlaceholder"),
            action: t("create.search.searchButton"),
          }}
          selectedResult={selectedResult}
          setSelectedResult={setSelectedResult}
        />
      </PageFrame>

      <MediaDetailsModal
        isOpen={selectedResult !== null}
        close={() => setSelectedResult(null)}
        media={selectedResult}
        onWrite={(textToWrite) => writeActivity.start(textToWrite)}
        onCopy={async (textToCopy) => {
          try {
            await writeToClipboard(textToCopy);
            toast.success(t("copied"));
          } catch (err) {
            logger.error("Failed to copy to clipboard", err, {
              category: "share",
              action: "copyResult",
              severity: "warning",
            });
            toast.error(t("copyFailed"));
          }
        }}
        onPreview={async (textToRun) => {
          try {
            await CoreAPI.run({
              uid: "",
              text: textToRun,
            });
          } catch (e) {
            logRunFailure("CoreAPI.run failed", e, { action: "run" });
            showRateLimitedErrorToast(
              t("error", {
                msg: e instanceof Error ? e.message : String(e),
              }),
            );
          }
        }}
        previewDisabled={!connected}
        readerActivity={writeActivity}
      />
      <MediaSearchSelectors form={form} />
      <RecentSearchesModal
        isOpen={recentSearchesOpen}
        onClose={() => setRecentSearchesOpen(false)}
        recentSearches={recentSearches}
        onSearchSelect={form.apply}
        onClearHistory={clearRecentSearches}
        getSearchDisplayText={getSearchDisplayText}
      />
    </>
  );
}
