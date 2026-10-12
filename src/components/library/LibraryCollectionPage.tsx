import { type ReactNode, useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { entrySystemId } from "@/lib/libraryMedia";
import type { MediaBrowseEntry } from "@/lib/models";
import { useStatusStore } from "@/lib/store";
import { BackIcon, SearchIcon } from "@/lib/images";
import { useBackButtonHandler } from "@/hooks/useBackButtonHandler";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import {
  LibraryMediaSelectionContext,
  type LibraryMediaSelectionController,
} from "@/hooks/useLibraryMediaSelection";
import { PageFrame } from "@/components/PageFrame";
import { BackToTop } from "@/components/BackToTop";
import { DelayedLoading } from "@/components/DelayedLoading";
import { InlineLoading } from "@/components/InlineLoading";
import { EmptyState } from "@/components/wui/EmptyState";
import { Button } from "@/components/wui/Button";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { LibraryBrowseList } from "@/components/library/LibraryBrowseList";
import { useLibraryCollectionBreadcrumbs } from "@/components/library/useLibraryBreadcrumbs";
import { LibraryDetailsSurface } from "@/components/library/LibraryDetailsSurface";
import {
  LibrarySearchBody,
  type LibrarySearchBodyProps,
} from "@/components/library/LibraryGameSearch";

/** Translation keys every collection page supplies. */
export interface LibraryCollectionLabels {
  title: string;
  list: string;
  loading: string;
  error: string;
  empty: string;
  hint: string;
}

/**
 * The page every Library collection shares: header, breadcrumbs, the
 * unavailable/loading/error/empty ladder, the media list and docked details.
 * Callers own only their query and what makes the collection available.
 */
export function LibraryCollectionPage(props: {
  /** Stable id for scroll memory and the Android Back handler. */
  id: string;
  labels: LibraryCollectionLabels;
  deviceKey: string;
  selection: LibraryMediaSelectionController;
  /** Core version to ask for when the collection is unsupported. */
  unsupportedRequiredVersion: string | null;
  databaseRequired?: boolean;
  query: { isLoading: boolean; isError: boolean; refetch: () => unknown };
  entries: MediaBrowseEntry[];
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onFetchMore?: () => void;
  entryDetail?: (entry: MediaBrowseEntry) => string | undefined;
  /** In-place search within the collection, when it offers one. */
  search?: {
    title: string;
    open: boolean;
    disabled: boolean;
    onOpen: () => void;
    onClose: () => void;
    /** Fixed scope for the search body rendered in the page scroller. */
    body: Omit<LibrarySearchBodyProps, "scrollRef" | "title">;
  };
}) {
  const { labels, search, selection } = props;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(t(labels.title));
  const connected = useStatusStore((state) => state.connected);
  const coreVersionPending = useStatusStore(
    (state) => state.coreVersionPending,
  );
  const { entry: selectedEntry, selectEntry: setSelectedEntry } = selection;
  const collectionBreadcrumbs = useLibraryCollectionBreadcrumbs(() =>
    setSelectedEntry(null),
  );
  const searchOpen = search?.open ?? false;
  const closeSearch = search?.onClose;

  const goBack = useCallback(() => {
    setSelectedEntry(null);
    if (searchOpen) {
      closeSearch?.();
      return;
    }
    void navigate({ to: "/library", resetScroll: false });
  }, [closeSearch, navigate, searchOpen, setSelectedEntry]);
  const handleBackButton = useCallback(() => {
    goBack();
    return true;
  }, [goBack]);
  useBackButtonHandler(`library-${props.id}`, handleBackButton);

  const loadingContent = (
    <DelayedLoading>
      <InlineLoading label={t(labels.loading)} />
    </DelayedLoading>
  );

  let content: ReactNode;
  if (!connected) {
    content = <EmptyState title={t("library.disconnected")} />;
  } else if (coreVersionPending) {
    content = loadingContent;
  } else if (props.unsupportedRequiredVersion !== null) {
    content = (
      <EmptyState
        title={t("library.updateCore")}
        description={t("features.requiresCoreVersion", {
          version: props.unsupportedRequiredVersion,
        })}
      />
    );
  } else if (props.databaseRequired) {
    content = <EmptyState title={t("library.databaseRequired")} />;
  } else if (props.query.isLoading) {
    content = loadingContent;
  } else if (props.query.isError) {
    content = (
      <EmptyState
        title={t(labels.error)}
        action={
          <Button
            label={t("library.tryAgain")}
            variant="outline"
            onClick={() => void props.query.refetch()}
          />
        }
      />
    );
  } else if (props.entries.length === 0) {
    content = (
      <EmptyState title={t(labels.empty)} description={t(labels.hint)} />
    );
  } else {
    content = (
      <LibraryBrowseList
        entries={props.entries}
        systemId=""
        deviceKey={props.deviceKey}
        scrollRef={scrollRef}
        hasNextPage={props.hasNextPage ?? false}
        isFetchingNextPage={props.isFetchingNextPage ?? false}
        imagesPaused={false}
        interactionDisabled={false}
        onFetchMore={() => props.onFetchMore?.()}
        onSelect={setSelectedEntry}
        selectedEntry={selectedEntry}
        showSystemName
        entryDetail={props.entryDetail}
        ariaLabel={t(labels.list)}
      />
    );
  }

  return (
    <LibraryMediaSelectionContext.Provider value={selection}>
      <PageFrame
        headerMode="content-wide"
        breadcrumbs={[
          ...collectionBreadcrumbs,
          ...(searchOpen ? [{ label: t(labels.title), onClick: goBack }] : []),
        ]}
        layout="workspace"
        supportingPane={
          <LibraryDetailsSurface
            selection={selection}
            systemId={selectedEntry ? entrySystemId(selectedEntry) : ""}
            deviceKey={props.deviceKey}
          />
        }
        onSwipeBack={goBack}
        scrollRef={scrollRef}
        sessionScrollKey={`library:${props.id}:${searchOpen ? "search" : "list"}`}
        headerLeft={
          <HeaderButton
            icon={<BackIcon size="24" />}
            aria-label={t("nav.back")}
            onClick={goBack}
          />
        }
        headerCenter={
          <h1 ref={headingRef} className="text-foreground text-xl">
            {search && searchOpen ? search.title : t(labels.title)}
          </h1>
        }
        headerRight={
          search && !searchOpen ? (
            <HeaderButton
              icon={<SearchIcon size="24" />}
              aria-label={search.title}
              onClick={() => {
                setSelectedEntry(null);
                search.onOpen();
              }}
              disabled={search.disabled}
            />
          ) : undefined
        }
      >
        {search && searchOpen ? (
          <LibrarySearchBody
            {...search.body}
            title={search.title}
            scrollRef={scrollRef}
          />
        ) : (
          <>
            {content}
            <BackToTop scrollContainerRef={scrollRef} threshold={200} />
          </>
        )}
      </PageFrame>
    </LibraryMediaSelectionContext.Provider>
  );
}
