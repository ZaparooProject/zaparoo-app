import { create } from "zustand";
import type {
  MediaBrowseEntry,
  MediaBrowseSort,
  SearchResultGame,
} from "@/lib/models";
import {
  type SessionSearchParams,
  useTabSessionStore,
} from "@/lib/tabSessionStore";
import type { SystemReleasePeriod, SystemSort } from "@/lib/systemFilters";

export type LibraryView = "systems" | "collections";

export interface LibraryMediaSelection {
  entry: MediaBrowseEntry;
  result?: SearchResultGame;
}

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

/** Exploration entries kept per device before the oldest is forgotten. */
export const MAX_METADATA_SESSIONS = 20;

/** Session scope owned by one metadata-exploration history entry. */
export function libraryMetadataScope(
  historyKey: string,
  system: string | undefined,
  tag: string | undefined,
): string {
  return `metadata:${historyKey}:${JSON.stringify([system, tag])}`;
}

export type LibraryBrowseWindowUpdater = (
  current: LibraryBrowseWindow | null,
) => LibraryBrowseWindow | null;

interface LibrarySessionState {
  deviceAddress: string | null;
  view: LibraryView;
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
  selectedMedia: Record<string, LibraryMediaSelection>;
  metadataReturns: Record<string, { owner: string; entry: MediaBrowseEntry }>;
  /** Exploration scopes, least recently visited first. */
  metadataScopes: string[];
  touchMetadataScope: (scope: string) => void;
  rememberMetadataReturn: (
    historyKey: string,
    owner: string,
    entry: MediaBrowseEntry,
  ) => void;
  forgetMetadataReturn: (historyKey: string, owner: string) => void;
  setSelectedMedia: (
    scope: string,
    selection: LibraryMediaSelection | null,
  ) => void;
  setView: (view: LibraryView) => void;
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
  /**
   * Chooses the Library root view from outside that page. The device is
   * activated first, so the page's own activation does not reset the choice.
   */
  showView: (deviceAddress: string, view: LibraryView) => void;
  reset: () => void;
}

const initialLibrarySessionState = {
  deviceAddress: null,
  view: "systems" as LibraryView,
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
  selectedMedia: {},
  metadataReturns: {},
  metadataScopes: [] as string[],
};

export const useLibrarySessionStore = create<LibrarySessionState>()((set) => ({
  ...initialLibrarySessionState,
  rememberMetadataReturn: (historyKey, owner, entry) =>
    set((state) => {
      // Re-inserting keeps key order least recently remembered first.
      const metadataReturns = { ...state.metadataReturns };
      delete metadataReturns[historyKey];
      metadataReturns[historyKey] = { owner, entry };
      const keys = Object.keys(metadataReturns);
      for (const stale of keys.slice(
        0,
        Math.max(0, keys.length - MAX_METADATA_SESSIONS),
      )) {
        delete metadataReturns[stale];
      }
      return { metadataReturns };
    }),
  touchMetadataScope: (scope) => {
    let evicted: string[] = [];
    set((state) => {
      if (state.metadataScopes.at(-1) === scope) return state;
      const metadataScopes = [
        ...state.metadataScopes.filter((known) => known !== scope),
        scope,
      ];
      evicted = metadataScopes.splice(
        0,
        Math.max(0, metadataScopes.length - MAX_METADATA_SESSIONS),
      );
      if (evicted.length === 0) return { metadataScopes };
      const searches = { ...state.searches };
      const selectedMedia = { ...state.selectedMedia };
      for (const stale of evicted) {
        delete searches[stale];
        delete selectedMedia[`search:${stale}`];
      }
      return { metadataScopes, searches, selectedMedia };
    });
    for (const stale of evicted) {
      useTabSessionStore.getState().forgetScroll(librarySearchScrollKey(stale));
    }
  },
  forgetMetadataReturn: (historyKey, owner) =>
    set((state) => {
      if (state.metadataReturns[historyKey]?.owner !== owner) return state;
      const metadataReturns = { ...state.metadataReturns };
      delete metadataReturns[historyKey];
      return { metadataReturns };
    }),
  setSelectedMedia: (scope, selection) =>
    set((state) => {
      const selectedMedia = { ...state.selectedMedia };
      if (selection) selectedMedia[scope] = selection;
      else delete selectedMedia[scope];
      return { selectedMedia };
    }),
  setView: (view) => set({ view }),
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
      selectedMedia: {},
      metadataReturns: {},
      metadataScopes: [],
    }),
  activateDevice: (deviceAddress) =>
    set((state) =>
      state.deviceAddress === deviceAddress
        ? state
        : { ...initialLibrarySessionState, deviceAddress },
    ),
  showView: (deviceAddress, view) =>
    set((state) =>
      state.deviceAddress === deviceAddress
        ? { view }
        : { ...initialLibrarySessionState, deviceAddress, view },
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
