import { create } from "zustand";

export type BottomTabId = "zap" | "library" | "create" | "settings";

export interface SessionSearchParams {
  query: string;
  system: string;
  tags: string[];
}

interface TabSessionState {
  lastHref: Record<BottomTabId, string>;
  scrollPositions: Record<string, { scrollX: number; scrollY: number }>;
  createSearch: SessionSearchParams | null;
  mediaScraperByDevice: Record<string, string>;
  rememberLocation: (pathname: string, href: string) => void;
  rememberScroll: (key: string, scrollX: number, scrollY: number) => void;
  forgetScroll: (key: string) => void;
  setCreateSearch: (search: SessionSearchParams) => void;
  setMediaScraper: (deviceKey: string, scraperId: string) => void;
  popTabToRoot: (tab: BottomTabId) => void;
  reset: () => void;
}

const defaultLastHref: Record<BottomTabId, string> = {
  zap: "/",
  library: "/library",
  create: "/create",
  settings: "/settings",
};

export function bottomTabForPath(pathname: string): BottomTabId | null {
  if (pathname === "/") return "zap";
  if (pathname === "/library" || pathname.startsWith("/library/")) {
    return "library";
  }
  if (pathname === "/create" || pathname.startsWith("/create/")) {
    return "create";
  }
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return "settings";
  }
  return null;
}

export type AppBackDestination =
  | "/"
  | "/library"
  | "/create"
  | "/create/mappings"
  | "/settings"
  | "/settings/devices";

export function appBackDestination(
  pathname: string,
): AppBackDestination | null {
  const normalizedPath =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  if (normalizedPath === "/") return null;
  if (
    normalizedPath === "/library" ||
    normalizedPath === "/create" ||
    normalizedPath === "/settings"
  ) {
    return "/";
  }
  if (normalizedPath.startsWith("/create/mappings/")) {
    return "/create/mappings";
  }
  if (normalizedPath.startsWith("/create/")) return "/create";
  if (normalizedPath.startsWith("/library/")) return "/library";
  if (normalizedPath.startsWith("/settings/devices/")) {
    return "/settings/devices";
  }
  if (normalizedPath.startsWith("/settings/")) return "/settings";
  return null;
}

export function appBackNavigationOptions<T extends AppBackDestination>(to: T) {
  return { to, resetScroll: false } as const;
}

function scrollKeyBelongsToTab(key: string, tab: BottomTabId): boolean {
  switch (tab) {
    case "zap":
      return key === "/" || key.startsWith("/?");
    case "library":
      return (
        key === "/library" ||
        key.startsWith("/library/") ||
        key.startsWith("library:")
      );
    case "create":
      return key === "/create" || key.startsWith("/create/");
    case "settings":
      return key === "/settings" || key.startsWith("/settings/");
  }
}

function scrollKeyBelongsToTabRoot(key: string, tab: BottomTabId): boolean {
  const rootPath = defaultLastHref[tab];
  return (
    key === rootPath ||
    (rootPath !== "/" && key === `${rootPath}/`) ||
    key.startsWith(`${rootPath}?`)
  );
}

function initialTabSessionState() {
  return {
    lastHref: { ...defaultLastHref },
    scrollPositions: {},
    createSearch: null,
    mediaScraperByDevice: {},
  };
}

export const useTabSessionStore = create<TabSessionState>()((set) => ({
  ...initialTabSessionState(),
  rememberLocation: (pathname, href) => {
    const tab = bottomTabForPath(pathname);
    if (!tab) return;
    set((state) => ({
      lastHref: {
        ...state.lastHref,
        [tab]: href.startsWith("/") ? href : pathname,
      },
    }));
  },
  rememberScroll: (key, scrollX, scrollY) =>
    set((state) => ({
      scrollPositions: {
        ...state.scrollPositions,
        [key]: { scrollX, scrollY },
      },
    })),
  forgetScroll: (key) =>
    set((state) => {
      if (!(key in state.scrollPositions)) return state;
      const scrollPositions = { ...state.scrollPositions };
      delete scrollPositions[key];
      return { scrollPositions };
    }),
  setCreateSearch: (createSearch) => set({ createSearch }),
  setMediaScraper: (deviceKey, scraperId) =>
    set((state) => ({
      mediaScraperByDevice: {
        ...state.mediaScraperByDevice,
        [deviceKey]: scraperId,
      },
    })),
  popTabToRoot: (tab) =>
    set((state) => ({
      lastHref: { ...state.lastHref, [tab]: defaultLastHref[tab] },
      scrollPositions: Object.fromEntries(
        Object.entries(state.scrollPositions).filter(
          ([key]) =>
            !scrollKeyBelongsToTab(key, tab) ||
            scrollKeyBelongsToTabRoot(key, tab),
        ),
      ),
      createSearch: tab === "create" ? null : state.createSearch,
    })),
  reset: () => set(initialTabSessionState()),
}));
