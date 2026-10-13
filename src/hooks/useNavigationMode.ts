import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePreferencesStore } from "@/lib/preferencesStore";

/**
 * How the app's navigation is presented:
 * - `dock`: the phone's bottom dock (below 760px)
 * - `rail`: a narrow strip of the four sections beside the page
 * - `full`: the persistent sidebar listing every destination (from 1280px,
 *   unless the user collapsed it)
 * - `hidden`: full screen, with no navigation until the user brings it back
 */
export type NavigationMode = "dock" | "rail" | "full" | "hidden";

export function useNavigationMode(): NavigationMode {
  const wide = useMediaQuery("(min-width: 760px)");
  const roomy = useMediaQuery("(min-width: 1280px)");
  const collapsed = usePreferencesStore((state) => state.sidebarCollapsed);
  const fullScreen = usePreferencesStore((state) => state.fullScreen);
  if (!wide) return "dock";
  if (fullScreen) return "hidden";
  return roomy && !collapsed ? "full" : "rail";
}

/**
 * Whether every destination is listed beside the page. Pages drop their own
 * way into those destinations (tiles, a tab bar) only while this holds.
 */
export function useFullSidebar(): boolean {
  return useNavigationMode() === "full";
}
