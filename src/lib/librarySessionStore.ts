import { create } from "zustand";
import type { MediaBrowseSort } from "@/lib/models";
import {
  type SessionSearchParams,
  useTabSessionStore,
} from "@/lib/tabSessionStore";
import type { SystemReleasePeriod, SystemSort } from "@/lib/systemFilters";

export interface LibraryFolderLevel {
  name: string;
  path: string;
}

export function libraryBrowseScrollKey(
  systemId: string,
  sort: MediaBrowseSort,
  path: string,
): string {
  return `library:${systemId}:browse:${sort}:${path}`;
}

export function librarySearchScrollKey(scope: string): string {
  return `library:${scope}:search`;
}

/**
 * A folder list opened at an index bucket instead of the top. Rows before
 * `anchorStart` load one bucket at a time as they scroll into view.
 */
export interface LibraryBrowseWindow {
  anchorKey: string;
  anchorStart: number;
  totalDirs: number;
  loadedKeys: string[];
}

export type LibraryBrowseWindowUpdater = (
  current: LibraryBrowseWindow | null,
) => LibraryBrowseWindow | null;

interface LibrarySessionState {
  deviceAddress: string | null;
  category: string;
  manufacturer: string;
  releasePeriod: SystemReleasePeriod;
  sort: SystemSort;
  mediaSort: MediaBrowseSort;
  folderLevels: Record<string, LibraryFolderLevel[]>;
  autoEnteredRoots: Record<string, boolean>;
  embeddedSearchOpen: Record<string, boolean>;
  searches: Record<string, SessionSearchParams>;
  browseWindows: Record<string, LibraryBrowseWindow>;
  setCategory: (category: string) => void;
  setManufacturer: (manufacturer: string) => void;
  setReleasePeriod: (releasePeriod: SystemReleasePeriod) => void;
  setSort: (sort: SystemSort) => void;
  setMediaSort: (sort: MediaBrowseSort) => void;
  setFolderLevels: (systemId: string, levels: LibraryFolderLevel[]) => void;
  setAutoEnteredRoot: (systemId: string, autoEntered: boolean) => void;
  setEmbeddedSearchOpen: (systemId: string, open: boolean) => void;
  setSearch: (scope: string, search: SessionSearchParams) => void;
  updateBrowseWindow: (
    scrollKey: string,
    updater: LibraryBrowseWindowUpdater,
  ) => void;
  resetNavigation: () => void;
  activateDevice: (deviceAddress: string) => void;
  reset: () => void;
}

const initialLibrarySessionState = {
  deviceAddress: null,
  category: "all",
  manufacturer: "",
  releasePeriod: "any" as SystemReleasePeriod,
  sort: "name-asc" as SystemSort,
  mediaSort: "name-asc" as MediaBrowseSort,
  folderLevels: {},
  autoEnteredRoots: {},
  embeddedSearchOpen: {},
  searches: {},
  browseWindows: {},
};

export const useLibrarySessionStore = create<LibrarySessionState>()((set) => ({
  ...initialLibrarySessionState,
  setCategory: (category) => set({ category }),
  setManufacturer: (manufacturer) => set({ manufacturer }),
  setReleasePeriod: (releasePeriod) => set({ releasePeriod }),
  setSort: (sort) => set({ sort }),
  setMediaSort: (mediaSort) => set({ mediaSort }),
  setFolderLevels: (systemId, levels) =>
    set((state) => ({
      folderLevels: { ...state.folderLevels, [systemId]: levels },
    })),
  setAutoEnteredRoot: (systemId, autoEntered) =>
    set((state) => ({
      autoEnteredRoots: {
        ...state.autoEnteredRoots,
        [systemId]: autoEntered,
      },
    })),
  setEmbeddedSearchOpen: (systemId, open) =>
    set((state) => ({
      embeddedSearchOpen: {
        ...state.embeddedSearchOpen,
        [systemId]: open,
      },
    })),
  setSearch: (scope, search) =>
    set((state) => ({
      searches: { ...state.searches, [scope]: search },
    })),
  updateBrowseWindow: (scrollKey, updater) =>
    set((state) => {
      const current = state.browseWindows[scrollKey] ?? null;
      const next = updater(current);
      if (next === current) return state;
      const browseWindows = { ...state.browseWindows };
      if (next) browseWindows[scrollKey] = next;
      else delete browseWindows[scrollKey];
      return { browseWindows };
    }),
  resetNavigation: () =>
    set({
      folderLevels: {},
      autoEnteredRoots: {},
      embeddedSearchOpen: {},
      searches: {},
      browseWindows: {},
    }),
  activateDevice: (deviceAddress) =>
    set((state) =>
      state.deviceAddress === deviceAddress
        ? state
        : { ...initialLibrarySessionState, deviceAddress },
    ),
  reset: () => set(initialLibrarySessionState),
}));

/** Starts a folder list from the top: no saved scroll and no bucket window. */
export function forgetLibraryBrowse(
  systemId: string,
  sort: MediaBrowseSort,
  path: string,
): void {
  const scrollKey = libraryBrowseScrollKey(systemId, sort, path);
  useTabSessionStore.getState().forgetScroll(scrollKey);
  useLibrarySessionStore.getState().updateBrowseWindow(scrollKey, () => null);
}
