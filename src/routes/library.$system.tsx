import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  createFileRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CoreAPI } from "@/lib/coreApi";
import { logger } from "@/lib/logger";
import {
  clearQueuedLibraryImages,
  pauseLibraryThumbnails,
  resumeLibraryThumbnails,
} from "@/lib/libraryImages";
import {
  isPlainFolderEntry,
  LIBRARY_QUERY_KEYS,
  libraryEntryDisplayName,
  soleInitialRootPath,
} from "@/lib/libraryMedia";
import type {
  MediaBrowseEntry,
  MediaBrowseIndexGroup,
  MediaBrowseSort,
} from "@/lib/models";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import { useStatusStore } from "@/lib/store";
import {
  libraryBrowseScrollKey,
  librarySearchScrollKey,
  type LibraryFolderLevel,
  useLibrarySessionStore,
} from "@/lib/librarySessionStore";
import { useTabSessionStore } from "@/lib/tabSessionStore";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { useLibraryBrowse } from "@/hooks/useLibraryBrowse";
import { useSystemName } from "@/hooks/useSystemName";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { useBackButtonHandler } from "@/hooks/useBackButtonHandler";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
import { PageFrame } from "@/components/PageFrame";
import { BackToTop } from "@/components/BackToTop";
import { EmptyState } from "@/components/wui/EmptyState";
import { Button } from "@/components/wui/Button";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { DelayedLoading } from "@/components/DelayedLoading";
import { BackIcon } from "@/lib/images";
import {
  LibraryBrowseList,
  type LibraryBrowseListHandle,
} from "@/components/library/LibraryBrowseList";
import { LibraryHeaderActions } from "@/components/library/LibraryHeader";
import { LibraryLetterJumpModal } from "@/components/library/LibraryLetterJumpModal";
import { LibraryMediaDetailsModal } from "@/components/library/LibraryMediaDetailsModal";
import { LibraryMediaOptionsModal } from "@/components/library/LibraryMediaOptionsModal";
import { LibraryRefinementSummary } from "@/components/library/LibrarySystemRefinementBar";
import { LibraryGameSearch } from "@/components/library/LibraryGameSearch";

export const Route = createFileRoute("/library/$system")({
  component: LibrarySystem,
});

function mediaSortLabelKey(sort: MediaBrowseSort): string {
  switch (sort) {
    case "name-asc":
      return "library.sortTitleAsc";
    case "name-desc":
      return "library.sortTitleDesc";
    case "filename-asc":
      return "library.sortFilenameAsc";
    case "filename-desc":
      return "library.sortFilenameDesc";
  }
}

const EMPTY_FOLDER_LEVELS: LibraryFolderLevel[] = [];

export function LibrarySystem() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { system: systemId } = useParams({ from: "/library/$system" });
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<LibraryBrowseListHandle>(null);
  const jumpGenerationRef = useRef(0);
  const [selectedEntry, setSelectedEntry] = useState<MediaBrowseEntry | null>(
    null,
  );
  const [letterModalOpen, setLetterModalOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [jumpingLabel, setJumpingLabel] = useState<string | null>(null);
  const [pendingJump, setPendingJump] = useState<{
    generation: number;
    targetIndex: number;
  } | null>(null);
  const targetDeviceAddress = useStatusStore(
    (state) => state.targetDeviceAddress,
  );
  const levels = useLibrarySessionStore((state) =>
    state.deviceAddress === targetDeviceAddress
      ? (state.folderLevels[systemId] ?? EMPTY_FOLDER_LEVELS)
      : EMPTY_FOLDER_LEVELS,
  );
  const autoEnteredRoot = useLibrarySessionStore(
    (state) =>
      state.deviceAddress === targetDeviceAddress &&
      state.autoEnteredRoots[systemId] === true,
  );
  const searchOpen = useLibrarySessionStore(
    (state) =>
      state.deviceAddress === targetDeviceAddress &&
      state.embeddedSearchOpen[systemId] === true,
  );
  const mediaSort = useLibrarySessionStore((state) => state.mediaSort);
  const setMediaSort = useLibrarySessionStore((state) => state.setMediaSort);
  const setFolderLevels = useLibrarySessionStore(
    (state) => state.setFolderLevels,
  );
  const setAutoEnteredRoot = useLibrarySessionStore(
    (state) => state.setAutoEnteredRoot,
  );
  const setEmbeddedSearchOpen = useLibrarySessionStore(
    (state) => state.setEmbeddedSearchOpen,
  );
  const activateLibraryDevice = useLibrarySessionStore(
    (state) => state.activateDevice,
  );
  const connected = useStatusStore((state) => state.connected);
  const corePlatform = useStatusStore((state) => state.corePlatform);
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  useLayoutEffect(() => {
    activateLibraryDevice(targetDeviceAddress);
  }, [activateLibraryDevice, targetDeviceAddress]);
  const libraryFeature = useCoreFeature("mediaLibrary");
  const currentPath = levels.at(-1)?.path ?? "";
  const browseScrollKey = libraryBrowseScrollKey(
    systemId,
    mediaSort,
    currentPath,
  );
  const searchScrollKey = librarySearchScrollKey(systemId);
  const sessionScrollKey = searchOpen ? searchScrollKey : browseScrollKey;
  const forgetScroll = useTabSessionStore((state) => state.forgetScroll);
  const systemsQuery = useQuery({
    queryKey: ["systems", targetDeviceAddress, { all: false }],
    queryFn: () => CoreAPI.systems(),
    enabled: connected,
    staleTime: 60 * 1000,
  });
  const coreSystemName =
    systemsQuery.data?.systems.find((system) => system.id === systemId)?.name ??
    systemId;
  const systemName = useSystemName(systemId, coreSystemName);
  const heading = levels.at(-1)?.name ?? systemName;
  const pageHeading = searchOpen ? t("library.searchTitle") : heading;
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(pageHeading);
  const browse = useLibraryBrowse({
    targetDeviceAddress,
    systemId,
    path: currentPath,
    sort: mediaSort,
    enabled: connected && gamesIndex.exists && libraryFeature.available,
  });
  const initialRootPath =
    levels.length === 0 && browse.data?.pages[0]
      ? soleInitialRootPath(browse.data.pages[0])
      : null;
  const initialRoot = initialRootPath
    ? browse.entries.find((entry) => entry.path === initialRootPath)
    : undefined;
  const autoEnteringInitialRoot = Boolean(initialRootPath && initialRoot);

  useEffect(() => {
    jumpGenerationRef.current++;
    clearQueuedLibraryImages();
    resumeLibraryThumbnails();
  }, [currentPath, mediaSort]);

  useEffect(
    () => () => {
      jumpGenerationRef.current++;
      resumeLibraryThumbnails();
    },
    [],
  );

  useEffect(() => {
    if (!initialRootPath || !initialRoot) return;

    setAutoEnteredRoot(systemId, true);
    forgetScroll(libraryBrowseScrollKey(systemId, mediaSort, initialRootPath));
    setFolderLevels(systemId, [
      {
        name:
          libraryEntryDisplayName(initialRoot, false, corePlatform) ||
          systemName,
        path: initialRootPath,
      },
    ]);
  }, [
    initialRoot,
    initialRootPath,
    corePlatform,
    forgetScroll,
    mediaSort,
    setAutoEnteredRoot,
    setFolderLevels,
    systemId,
    systemName,
  ]);

  const cancelJump = useCallback(() => {
    jumpGenerationRef.current++;
    setPendingJump(null);
    setJumpingLabel(null);
    resumeLibraryThumbnails();
  }, []);

  useEffect(() => {
    if (!pendingJump || browse.entries.length <= pendingJump.targetIndex) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      if (jumpGenerationRef.current !== pendingJump.generation) return;
      listRef.current?.scrollToIndex(pendingJump.targetIndex);
      setPendingJump(null);
      setJumpingLabel(null);
      resumeLibraryThumbnails();
    });
    return () => cancelAnimationFrame(frame);
  }, [browse.entries.length, pendingJump]);

  const closeSearch = useCallback(() => {
    setEmbeddedSearchOpen(systemId, false);
  }, [setEmbeddedSearchOpen, systemId]);

  const goBack = useCallback(() => {
    cancelJump();
    setSelectedEntry(null);
    setLetterModalOpen(false);
    setOptionsOpen(false);
    if (searchOpen) {
      closeSearch();
      return;
    }
    if (levels.length > 1) {
      setFolderLevels(systemId, levels.slice(0, -1));
      return;
    }
    if (levels.length === 1 && !autoEnteredRoot) {
      setFolderLevels(systemId, []);
      return;
    }
    void navigate({ to: "/library", resetScroll: false });
  }, [
    autoEnteredRoot,
    cancelJump,
    closeSearch,
    levels,
    navigate,
    searchOpen,
    setFolderLevels,
    systemId,
  ]);

  useBackButtonHandler("library-browser", () => {
    goBack();
    return true;
  });
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false,
  });

  const changeMediaSort = (nextSort: MediaBrowseSort) => {
    forgetScroll(libraryBrowseScrollKey(systemId, nextSort, currentPath));
    setMediaSort(nextSort);
  };

  const selectEntry = (entry: MediaBrowseEntry) => {
    if (isPlainFolderEntry(entry)) {
      setSelectedEntry(null);
      forgetScroll(libraryBrowseScrollKey(systemId, mediaSort, entry.path));
      setFolderLevels(systemId, [
        ...levels,
        {
          name:
            libraryEntryDisplayName(entry, false, corePlatform) ||
            t("library.folder"),
          path: entry.path,
        },
      ]);
      return;
    }
    setSelectedEntry(entry);
  };

  const selectLetter = async (group: MediaBrowseIndexGroup) => {
    setLetterModalOpen(false);
    setPendingJump(null);
    setJumpingLabel(group.label);
    const generation = ++jumpGenerationRef.current;
    pauseLibraryThumbnails();
    await queryClient.cancelQueries({
      queryKey: [LIBRARY_QUERY_KEYS.image, targetDeviceAddress],
    });
    if (jumpGenerationRef.current !== generation) return;
    const targetIndex = browse.totalDirs + group.offset;

    try {
      const loaded =
        browse.entries.length > targetIndex ||
        (await browse.loadThroughIndex(targetIndex));
      if (jumpGenerationRef.current !== generation) return;
      if (!loaded) throw new Error("Letter target is outside browse results");
      setPendingJump({ generation, targetIndex });
    } catch (error) {
      if (jumpGenerationRef.current !== generation) return;
      logger.error("Failed to jump within media library", error, {
        category: "api",
        action: "mediaBrowseIndexJump",
        severity: "warning",
      });
      showRateLimitedErrorToast(t("library.jumpError"));
      setPendingJump(null);
      setJumpingLabel(null);
      resumeLibraryThumbnails();
    }
  };

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
    content = <EmptyState title={t("library.databaseRequired")} />;
  } else if (browse.isLoading || autoEnteringInitialRoot) {
    content = (
      <DelayedLoading>
        <div className="text-muted-foreground flex items-center justify-center gap-2 py-8">
          <LoadingSpinner size={16} className="text-primary" />
          <span>{t("library.loadingFolder")}</span>
        </div>
      </DelayedLoading>
    );
  } else if (browse.isError) {
    content = (
      <EmptyState
        title={t("library.browseError")}
        action={
          <Button
            label={t("library.tryAgain")}
            variant="outline"
            onClick={() => void browse.refetch()}
          />
        }
      />
    );
  } else if (browse.entries.length === 0) {
    content = <EmptyState title={t("library.emptyFolder")} />;
  } else {
    content = (
      <LibraryBrowseList
        key={browseScrollKey}
        ref={listRef}
        entries={browse.entries}
        systemId={systemId}
        targetDeviceAddress={targetDeviceAddress}
        scrollRef={scrollRef}
        hasNextPage={Boolean(browse.hasNextPage)}
        isFetchingNextPage={browse.isFetchingNextPage}
        imagesPaused={jumpingLabel !== null}
        interactionDisabled={jumpingLabel !== null}
        onFetchMore={() => void browse.fetchMore()}
        onSelect={selectEntry}
      />
    );
  }

  return (
    <>
      <PageFrame
        {...swipeHandlers}
        scrollRef={scrollRef}
        sessionScrollKey={sessionScrollKey}
        headerLeft={
          <HeaderButton
            onClick={goBack}
            icon={<BackIcon size="24" />}
            aria-label={t("nav.back")}
          />
        }
        headerCenter={
          <h1
            ref={headingRef}
            className="text-foreground text-xl"
            title={pageHeading}
          >
            {pageHeading}
          </h1>
        }
        headerRight={
          searchOpen ? undefined : (
            <LibraryHeaderActions
              onSearch={() => {
                forgetScroll(searchScrollKey);
                cancelJump();
                setSelectedEntry(null);
                setLetterModalOpen(false);
                setOptionsOpen(false);
                setEmbeddedSearchOpen(systemId, true);
              }}
              onOpenOptions={() => setOptionsOpen(true)}
              searchDisabled={
                !connected ||
                !gamesIndex.exists ||
                !libraryFeature.available ||
                jumpingLabel !== null
              }
              optionsDisabled={
                !connected ||
                !gamesIndex.exists ||
                !libraryFeature.available ||
                jumpingLabel !== null
              }
              optionsActive={optionsOpen || mediaSort !== "name-asc"}
            />
          )
        }
      >
        {searchOpen ? (
          <LibraryGameSearch
            initialSystemId={systemId}
            onBack={closeSearch}
            embedded
            scrollRef={scrollRef}
          />
        ) : (
          <>
            <LibraryRefinementSummary
              labels={
                mediaSort === "name-asc"
                  ? []
                  : [t(mediaSortLabelKey(mediaSort))]
              }
              onClear={() => changeMediaSort("name-asc")}
            />
            {jumpingLabel && (
              <DelayedLoading>
                <div
                  className="text-muted-foreground flex items-center justify-center gap-2 pb-3"
                  role="status"
                  aria-live="polite"
                >
                  <LoadingSpinner size={16} className="text-primary" />
                  <span>{t("library.jumpingTo", { label: jumpingLabel })}</span>
                </div>
              </DelayedLoading>
            )}
            {content}
            <BackToTop
              scrollContainerRef={scrollRef}
              threshold={200}
              bottomOffset="calc(var(--bottom-nav-base-height) + 1rem)"
            />
          </>
        )}
      </PageFrame>

      <LibraryMediaOptionsModal
        isOpen={optionsOpen}
        close={() => setOptionsOpen(false)}
        value={mediaSort}
        onChange={changeMediaSort}
        canGoToLetter={currentPath !== ""}
        onGoToLetter={() => {
          setOptionsOpen(false);
          setLetterModalOpen(true);
        }}
      />
      <LibraryLetterJumpModal
        isOpen={letterModalOpen}
        close={() => setLetterModalOpen(false)}
        systemId={systemId}
        path={currentPath}
        targetDeviceAddress={targetDeviceAddress}
        sort={mediaSort}
        onSelect={(group) => void selectLetter(group)}
      />
      <LibraryMediaDetailsModal
        isOpen={selectedEntry !== null}
        close={() => setSelectedEntry(null)}
        entry={selectedEntry}
        systemId={systemId}
        targetDeviceAddress={targetDeviceAddress}
      />
    </>
  );
}
