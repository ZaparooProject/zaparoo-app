import { beforeEach, describe, expect, it } from "vitest";
import {
  appBackDestination,
  appBackNavigationOptions,
  bottomTabForPath,
  useTabSessionStore,
} from "@/lib/tabSessionStore";

describe("tabSessionStore", () => {
  beforeEach(() => {
    useTabSessionStore.getState().reset();
  });

  it("should classify bottom-tab routes", () => {
    expect(bottomTabForPath("/")).toBe("zap");
    expect(bottomTabForPath("/library/SNES")).toBe("library");
    expect(bottomTabForPath("/create/search")).toBe("create");
    expect(bottomTabForPath("/settings/advanced")).toBe("settings");
    expect(bottomTabForPath("/unknown")).toBeNull();
  });

  it("should resolve app Back within the active tab hierarchy", () => {
    expect(appBackDestination("/")).toBeNull();
    expect(appBackDestination("/settings")).toBe("/");
    expect(appBackDestination("/settings/about")).toBe("/settings");
    expect(appBackDestination("/settings/devices/device-a")).toBe(
      "/settings/devices",
    );
    expect(appBackDestination("/create/search")).toBe("/create");
    expect(appBackDestination("/create/mappings/42")).toBe("/create/mappings");
    expect(appBackDestination("/library/SNES")).toBe("/library");
    expect(appBackDestination("/library/")).toBe("/");
    expect(appBackDestination("/unknown")).toBeNull();
  });

  it("should preserve parent scroll for app Back navigation", () => {
    expect(appBackNavigationOptions("/settings")).toEqual({
      to: "/settings",
      resetScroll: false,
    });
  });

  it("should remember each tab's last href for this session", () => {
    const store = useTabSessionStore.getState();
    store.rememberLocation("/library/SNES", "/library/SNES?view=games");
    store.rememberLocation("/create/search", "/create/search");
    store.rememberLocation("/settings/media", "/settings/media");

    expect(useTabSessionStore.getState().lastHref).toEqual({
      zap: "/",
      library: "/library/SNES?view=games",
      create: "/create/search",
      settings: "/settings/media",
    });
  });

  it("should retain scroll and submitted Create search state", () => {
    const store = useTabSessionStore.getState();
    store.rememberScroll("/create/search", 0, 320);
    store.setCreateSearch({
      query: "zelda",
      system: "SNES",
      tags: ["region:us"],
    });

    expect(
      useTabSessionStore.getState().scrollPositions["/create/search"],
    ).toEqual({ scrollX: 0, scrollY: 320 });
    expect(useTabSessionStore.getState().createSearch).toEqual({
      query: "zelda",
      system: "SNES",
      tags: ["region:us"],
    });
  });

  it("should forget only the requested scroll position", () => {
    const store = useTabSessionStore.getState();
    store.rememberScroll("library:SNES:browse:name-asc:/roms", 0, 200);
    store.rememberScroll("/library", 0, 300);

    store.forgetScroll("library:SNES:browse:name-asc:/roms");

    expect(useTabSessionStore.getState().scrollPositions).toEqual({
      "/library": { scrollX: 0, scrollY: 300 },
    });
  });

  it("should pop only the active tab to its root", () => {
    const store = useTabSessionStore.getState();
    store.rememberLocation("/create/search", "/create/search");
    store.rememberLocation("/settings/media", "/settings/media");
    store.rememberScroll("/create", 0, 120);
    store.rememberScroll("/create/search", 0, 200);
    store.rememberScroll("/settings/media", 0, 300);
    store.setCreateSearch({ query: "game", system: "all", tags: [] });

    store.popTabToRoot("create");

    const state = useTabSessionStore.getState();
    expect(state.lastHref.create).toBe("/create");
    expect(state.lastHref.settings).toBe("/settings/media");
    expect(state.scrollPositions["/create"]).toEqual({
      scrollX: 0,
      scrollY: 120,
    });
    expect(state.scrollPositions["/create/search"]).toBeUndefined();
    expect(state.scrollPositions["/settings/media"]).toEqual({
      scrollX: 0,
      scrollY: 300,
    });
    expect(state.createSearch).toBeNull();
  });

  it("should reset all tab state without persisted storage", () => {
    const store = useTabSessionStore.getState();
    store.rememberLocation("/settings/media", "/settings/media");
    store.rememberScroll("/settings/media", 0, 200);
    store.setCreateSearch({ query: "game", system: "all", tags: [] });

    useTabSessionStore.getState().reset();

    expect(useTabSessionStore.getState().lastHref.settings).toBe("/settings");
    expect(useTabSessionStore.getState().scrollPositions).toEqual({});
    expect(useTabSessionStore.getState().createSearch).toBeNull();
  });
});
