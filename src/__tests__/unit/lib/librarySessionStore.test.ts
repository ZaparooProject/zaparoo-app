import { beforeEach, describe, expect, it } from "vitest";
import {
  forgetLibraryBrowse,
  type LibraryBrowseWindow,
  libraryBrowseScrollKey,
  libraryMetadataScope,
  librarySearchScrollKey,
  MAX_METADATA_SESSIONS,
  useLibrarySessionStore,
} from "@/lib/librarySessionStore";
import type { MediaBrowseEntry } from "@/lib/models";
import { useTabSessionStore } from "@/lib/tabSessionStore";

const ENTRY: MediaBrowseEntry = {
  type: "media",
  mediaId: 42,
  name: "Super Game",
  path: "/roms/SNES/Super Game.sfc",
  systemId: "SNES",
};

const BROWSE_KEY = libraryBrowseScrollKey("SNES", "name-asc", "/roms/SNES");
const T_WINDOW: LibraryBrowseWindow = {
  anchorKey: "T",
  anchorStart: 502,
  totalDirs: 2,
  loadedKeys: [],
};

describe("librarySessionStore navigation", () => {
  it("should build stable scroll keys for folder and search history", () => {
    expect(libraryBrowseScrollKey("SNES", "name-asc", "/roms/SNES")).toBe(
      "library:SNES:browse:name-asc:/roms/SNES",
    );
    expect(librarySearchScrollKey("SNES")).toBe("library:SNES:search");
  });

  beforeEach(() => {
    useLibrarySessionStore.getState().reset();
    useLibrarySessionStore.getState().activateDevice("device-a");
  });

  it("should retain folder, embedded search, and submitted search context", () => {
    const store = useLibrarySessionStore.getState();
    store.setFolderLevels("SNES", [
      { name: "Games", path: "/roms/SNES" },
      { name: "RPG", path: "/roms/SNES/RPG" },
    ]);
    store.setAutoEnteredRoot("SNES", true);
    store.setEmbeddedSearchOpen("SNES", true);
    store.setSearch("SNES", {
      query: "zelda",
      system: "SNES",
      tags: ["genre:rpg"],
    });

    const state = useLibrarySessionStore.getState();
    expect(state.folderLevels.SNES?.at(-1)?.path).toBe("/roms/SNES/RPG");
    expect(state.autoEnteredRoots.SNES).toBe(true);
    expect(state.embeddedSearchOpen.SNES).toBe(true);
    expect(state.searches.SNES).toEqual({
      query: "zelda",
      system: "SNES",
      tags: ["genre:rpg"],
    });
  });

  it("should reset navigation without clearing Library refinements", () => {
    const store = useLibrarySessionStore.getState();
    store.setCategory("console");
    store.setFolderLevels("SNES", [{ name: "Games", path: "/roms/SNES" }]);
    store.setEmbeddedSearchOpen("SNES", true);
    store.setSearch("SNES", { query: "zelda", system: "SNES", tags: [] });

    store.resetNavigation();

    const state = useLibrarySessionStore.getState();
    expect(state.category).toBe("console");
    expect(state.folderLevels).toEqual({});
    expect(state.embeddedSearchOpen).toEqual({});
    expect(state.searches).toEqual({});
  });

  it("should clear navigation context when the target device changes", () => {
    const store = useLibrarySessionStore.getState();
    store.setFolderLevels("SNES", [{ name: "Games", path: "/roms/SNES" }]);
    store.setEmbeddedSearchOpen("SNES", true);
    store.setSearch("SNES", { query: "zelda", system: "SNES", tags: [] });

    store.activateDevice("device-b");

    const state = useLibrarySessionStore.getState();
    expect(state.deviceAddress).toBe("device-b");
    expect(state.folderLevels).toEqual({});
    expect(state.autoEnteredRoots).toEqual({});
    expect(state.embeddedSearchOpen).toEqual({});
    expect(state.searches).toEqual({});
  });

  it("should apply browse window updates to the latest window", () => {
    const store = useLibrarySessionStore.getState();
    store.updateBrowseWindow(BROWSE_KEY, () => T_WINDOW);
    store.updateBrowseWindow(BROWSE_KEY, (current) =>
      current ? { ...current, loadedKeys: [...current.loadedKeys, "S"] } : null,
    );
    store.updateBrowseWindow(BROWSE_KEY, (current) =>
      current ? { ...current, loadedKeys: [...current.loadedKeys, "R"] } : null,
    );

    expect(
      useLibrarySessionStore.getState().browseWindows[BROWSE_KEY]?.loadedKeys,
    ).toEqual(["S", "R"]);
  });

  it("should forget a folder's scroll and jump window together", () => {
    useTabSessionStore.getState().reset();
    useTabSessionStore.getState().rememberScroll(BROWSE_KEY, 0, 4400);
    useLibrarySessionStore
      .getState()
      .updateBrowseWindow(BROWSE_KEY, () => T_WINDOW);

    forgetLibraryBrowse("SNES", "name-asc", "/roms/SNES");

    expect(useLibrarySessionStore.getState().browseWindows).toEqual({});
    expect(useTabSessionStore.getState().scrollPositions[BROWSE_KEY]).toBe(
      undefined,
    );
  });

  it("should clear jump windows with navigation and device changes", () => {
    const store = useLibrarySessionStore.getState();
    store.updateBrowseWindow(BROWSE_KEY, () => T_WINDOW);
    store.resetNavigation();
    expect(useLibrarySessionStore.getState().browseWindows).toEqual({});

    store.updateBrowseWindow(BROWSE_KEY, () => T_WINDOW);
    store.activateDevice("device-b");
    expect(useLibrarySessionStore.getState().browseWindows).toEqual({});
  });

  it("should forget the least recently visited exploration entries with their scroll", () => {
    useTabSessionStore.getState().reset();
    const scopes = Array.from(
      { length: MAX_METADATA_SESSIONS + 1 },
      (_, index) => libraryMetadataScope(`entry-${index}`, "SNES", "genre:rpg"),
    );
    for (const scope of scopes) {
      const store = useLibrarySessionStore.getState();
      store.setSearch(scope, { query: "", system: "SNES", tags: [] });
      store.setSelectedMedia(`search:${scope}`, { entry: ENTRY });
      useTabSessionStore
        .getState()
        .rememberScroll(librarySearchScrollKey(scope), 0, 100);
      store.touchMetadataScope(scope);
      // Returning to the first entry keeps it ahead of the second.
      store.touchMetadataScope(scopes[0]!);
    }

    const state = useLibrarySessionStore.getState();
    const scroll = useTabSessionStore.getState().scrollPositions;
    const [kept, forgotten, ...rest] = scopes;
    expect(state.searches[forgotten!]).toBeUndefined();
    expect(state.selectedMedia[`search:${forgotten}`]).toBeUndefined();
    expect(scroll[librarySearchScrollKey(forgotten!)]).toBeUndefined();
    for (const scope of [kept!, ...rest]) {
      expect(state.searches[scope]).toBeDefined();
      expect(state.selectedMedia[`search:${scope}`]).toBeDefined();
      expect(scroll[librarySearchScrollKey(scope)]).toBeDefined();
    }
  });

  it("should cap remembered return markers at the oldest history entry", () => {
    const store = useLibrarySessionStore.getState();
    for (let index = 0; index <= MAX_METADATA_SESSIONS; index++) {
      store.rememberMetadataReturn(
        `entry-${index}`,
        "library:favorites",
        ENTRY,
      );
    }

    const returns = useLibrarySessionStore.getState().metadataReturns;
    expect(Object.keys(returns)).toHaveLength(MAX_METADATA_SESSIONS);
    expect(returns["entry-0"]).toBeUndefined();
    expect(returns[`entry-${MAX_METADATA_SESSIONS}`]?.entry).toBe(ENTRY);
  });
});
