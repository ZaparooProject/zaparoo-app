import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
} from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useMetadataDetailsReturn } from "@/hooks/useMetadataDetailsReturn";
import { searchResultToBrowseEntry } from "@/lib/libraryMedia";
import {
  useLibrarySessionStore,
  type LibraryMediaSelection,
} from "@/lib/librarySessionStore";
import type { MediaBrowseEntry, SearchResultGame } from "@/lib/models";

export function useLibraryMediaSelection(scope: string, deviceKey: string) {
  useLayoutEffect(() => {
    useLibrarySessionStore.getState().activateDevice(deviceKey);
  }, [deviceKey]);
  // Matches the CSS threshold where PageFrame reserves its supporting pane.
  const docked = useMediaQuery("(min-width: 1100px)");
  const { entry: returnedEntry, forget: forgetReturn } =
    useMetadataDetailsReturn(`library:${scope}`, deviceKey);
  const savedSelection = useLibrarySessionStore((state) =>
    state.deviceAddress === deviceKey
      ? (state.selectedMedia[scope] ?? null)
      : null,
  );
  // A history entry's own return marker outranks the scope's latest selection,
  // which another visit to the same page may have replaced.
  const returnOutranksSaved =
    returnedEntry !== null && savedSelection?.entry !== returnedEntry;
  const selection: LibraryMediaSelection | null = returnOutranksSaved
    ? { entry: returnedEntry }
    : savedSelection;
  useLayoutEffect(() => {
    if (
      returnOutranksSaved &&
      useLibrarySessionStore.getState().deviceAddress === deviceKey
    ) {
      useLibrarySessionStore
        .getState()
        .setSelectedMedia(scope, { entry: returnedEntry });
    }
  }, [deviceKey, scope, returnOutranksSaved, returnedEntry]);
  const contextKey = `${deviceKey}\u0001${scope}`;
  const [presentation, setPresentation] = useState({
    key: contextKey,
    open: (docked || returnedEntry !== null) && selection !== null,
  });
  if (
    presentation.key !== contextKey ||
    (docked && selection && !presentation.open)
  ) {
    setPresentation({ key: contextKey, open: docked && selection !== null });
  }
  const isOpen =
    selection !== null &&
    (docked || (presentation.key === contextKey && presentation.open));
  const select = useCallback(
    (next: LibraryMediaSelection | null) => {
      // Late callbacks from an old target cannot select media on its replacement.
      if (useLibrarySessionStore.getState().deviceAddress !== deviceKey) return;
      forgetReturn();
      useLibrarySessionStore.getState().setSelectedMedia(scope, next);
      setPresentation({ key: contextKey, open: next !== null });
    },
    [scope, deviceKey, contextKey, forgetReturn],
  );
  const selectEntry = useCallback(
    (entry: MediaBrowseEntry | null) => {
      select(entry ? { entry } : null);
    },
    [select],
  );
  const selectResult = useCallback(
    (result: SearchResultGame | null) => {
      select(
        result ? { entry: searchResultToBrowseEntry(result), result } : null,
      );
    },
    [select],
  );
  const close = useCallback(() => select(null), [select]);
  return {
    scope,
    docked,
    isOpen,
    entry: isOpen ? selection.entry : null,
    result: isOpen ? (selection.result ?? null) : null,
    selectEntry,
    selectResult,
    close,
  };
}

export type LibraryMediaSelectionController = ReturnType<
  typeof useLibraryMediaSelection
>;
export const LibraryMediaSelectionContext =
  createContext<LibraryMediaSelectionController | null>(null);

export function useLibraryMediaSelectionContext() {
  const selection = useContext(LibraryMediaSelectionContext);
  if (!selection)
    throw new Error("Library selection needs its workspace owner");
  return selection;
}
