import { beforeEach, describe, expect, it } from "vitest";
import {
  libraryBrowseScrollKey,
  librarySearchScrollKey,
  useLibrarySessionStore,
} from "@/lib/librarySessionStore";

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
});
