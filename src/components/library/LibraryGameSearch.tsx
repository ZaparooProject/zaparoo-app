import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import {
  librarySearchScrollKey,
  useLibrarySessionStore,
} from "@/lib/librarySessionStore";
import type { SessionSearchParams } from "@/lib/tabSessionStore";
import { BackIcon } from "@/lib/images";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { useBackButtonHandler } from "@/hooks/useBackButtonHandler";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { PageFrame } from "@/components/PageFrame";
import {
  MediaSearchForm,
  MediaSearchSelectors,
} from "@/components/MediaSearchForm";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { useMediaSearchForm } from "@/hooks/useMediaSearchForm";
import { LibraryDetailsSurface } from "@/components/library/LibraryDetailsSurface";
import {
  LibraryMediaSelectionContext,
  useLibraryMediaSelection,
  useLibraryMediaSelectionContext,
} from "@/hooks/useLibraryMediaSelection";

export interface LibrarySearchBodyProps {
  /** Page scroller that owns the virtual results. */
  scrollRef: RefObject<HTMLDivElement | null>;
  initialSystemId?: string;
  initialSearch?: SessionSearchParams;
  /** Tags every search in this context carries; never shown as a filter. */
  fixedTags?: string[];
  sessionScope?: string;
  title?: string;
}

/**
 * Search form, results and its selector dialogs. It renders inside a page that
 * already owns the scroller and the Library selection, so it can sit in a
 * system or collection page as well as the standalone search route.
 */
export function LibrarySearchBody({
  scrollRef,
  initialSystemId,
  initialSearch,
  fixedTags = [],
  sessionScope,
  title,
}: LibrarySearchBodyProps) {
  const { t } = useTranslation();
  const deviceKey = useActiveDeviceKey();
  const searchScope = sessionScope ?? initialSystemId ?? "all";
  const savedSearch = useLibrarySessionStore((state) =>
    state.deviceAddress === deviceKey ? state.searches[searchScope] : undefined,
  );
  const setSessionSearch = useLibrarySessionStore((state) => state.setSearch);
  const libraryFeature = useCoreFeature("mediaLibrary");
  const seededSearch = savedSearch ?? initialSearch;
  useLayoutEffect(() => {
    if (
      initialSearch &&
      !savedSearch &&
      useLibrarySessionStore.getState().deviceAddress === deviceKey
    ) {
      setSessionSearch(searchScope, initialSearch);
    }
  }, [deviceKey, initialSearch, savedSearch, searchScope, setSessionSearch]);
  const selection = useLibraryMediaSelectionContext();
  const { result: selectedResult, selectResult: setSelectedResult } = selection;
  const form = useMediaSearchForm({
    initialDraft: {
      query: seededSearch?.query,
      system: seededSearch?.system ?? initialSystemId,
      tags: seededSearch?.tags,
    },
    initialSearch: seededSearch ?? null,
    fixedTags,
    available: libraryFeature.available,
    onSearch: (search) => {
      setSelectedResult(null);
      setSessionSearch(searchScope, search);
    },
    onFiltersChange: () => setSelectedResult(null),
  });

  return (
    <>
      <MediaSearchForm
        form={form}
        layout="library"
        scrollRef={scrollRef}
        labels={{
          region: title ?? t("library.searchTitle"),
          input: t("library.searchInput"),
          placeholder: t("library.searchPlaceholder"),
          action: t("library.searchAction"),
        }}
        selectedResult={selectedResult}
        setSelectedResult={setSelectedResult}
        selectionPresentation={selection.docked ? "pane" : "modal"}
        rowVariant="library"
      />
      <MediaSearchSelectors form={form} />
    </>
  );
}

/**
 * The standalone search page. It owns the scroller, the Library selection and
 * its docked details, and Back for metadata-exploration entries.
 */
export function LibraryGameSearch({
  historyBack,
  ...body
}: Omit<LibrarySearchBodyProps, "scrollRef" | "title"> & {
  /** Returns to the details that opened this exploration entry. */
  historyBack?: () => void;
} = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pageTitle = t("library.searchTitle");
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(pageTitle);
  const scrollRef = useRef<HTMLDivElement>(null);
  const deviceKey = useActiveDeviceKey();
  const searchScope = body.sessionScope ?? body.initialSystemId ?? "all";
  const selection = useLibraryMediaSelection(
    `search:${searchScope}`,
    deviceKey,
  );
  const goBack =
    historyBack ?? (() => navigate({ to: "/library", resetScroll: false }));
  useBackButtonHandler(
    "metadata-search",
    () => {
      if (!historyBack) return false;
      historyBack();
      return true;
    },
    50,
    Boolean(historyBack),
  );

  return (
    <LibraryMediaSelectionContext.Provider value={selection}>
      <PageFrame
        headerMode="content-wide"
        breadcrumbs={[{ to: "/library", label: t("library.title") }]}
        layout="workspace"
        sessionScrollKey={
          body.initialSearch ? librarySearchScrollKey(searchScope) : undefined
        }
        supportingPane={
          <LibraryDetailsSurface
            selection={selection}
            systemId={selection.result?.system.id ?? ""}
            deviceKey={deviceKey}
          />
        }
        onSwipeBack={goBack}
        scrollRef={scrollRef}
        headerLeft={
          <HeaderButton
            icon={<BackIcon size="24" />}
            aria-label={t("nav.back")}
            onClick={goBack}
          />
        }
        headerCenter={
          <h1 ref={headingRef} className="text-foreground text-xl">
            {pageTitle}
          </h1>
        }
      >
        <LibrarySearchBody {...body} scrollRef={scrollRef} />
      </PageFrame>
    </LibraryMediaSelectionContext.Provider>
  );
}
