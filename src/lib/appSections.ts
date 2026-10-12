import {
  LibraryBigIcon,
  SettingsIcon,
  SquarePenIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * Availability checks a destination can depend on. Navigation resolves them
 * from the same feature gates and capability flags the landing pages use.
 */
export type AppSectionGate =
  | "playHistory"
  | "favorites"
  | "preferences"
  | "decks"
  | "scrapers"
  | "nfc"
  | "connected";

interface AppSectionChildDefinition {
  to: string;
  /** Translation key. */
  label: string;
  /**
   * Translation key of the group this destination is listed under. Groups
   * follow the section's landing page; consecutive children share one label.
   */
  group?: string;
  /** The destination is the section root showing this Library view. */
  libraryView?: "systems" | "collections";
  /** The destination is omitted when this gate is closed. */
  visibleWhen?: AppSectionGate;
  /** The destination stays listed but unavailable when any gate is closed. */
  enabledWhen?: readonly AppSectionGate[];
}

interface AppSectionDefinition {
  id: string;
  /** Section root route. */
  to: string;
  /** Path prefix owning this section's descendant routes. */
  pathPrefix: string;
  /** Translation key. */
  label: string;
  Icon: LucideIcon;
  children: readonly AppSectionChildDefinition[];
}

const sections = [
  {
    id: "zap",
    to: "/",
    pathPrefix: "/zap",
    label: "nav.index",
    Icon: ZapIcon,
    children: [
      { to: "/zap/scan-history", label: "scan.scanHistoryTitle" },
      {
        to: "/zap/play-history",
        label: "scan.playHistoryTitle",
        visibleWhen: "playHistory",
      },
    ],
  },
  {
    id: "library",
    to: "/library",
    pathPrefix: "/library",
    label: "nav.library",
    Icon: LibraryBigIcon,
    children: [
      { to: "/library/search", label: "nav.search" },
      { to: "/library", label: "library.systems", libraryView: "systems" },
      {
        to: "/library",
        label: "nav.all",
        libraryView: "collections",
        group: "library.collections",
        visibleWhen: "favorites",
      },
      {
        to: "/library/favorites",
        label: "library.favorites",
        group: "library.collections",
        visibleWhen: "favorites",
      },
      {
        to: "/library/play-later",
        label: "library.playLater",
        group: "library.collections",
        visibleWhen: "preferences",
      },
      {
        to: "/library/liked",
        label: "library.liked",
        group: "library.collections",
        visibleWhen: "preferences",
      },
      {
        to: "/library/disliked",
        label: "library.disliked",
        group: "library.collections",
        visibleWhen: "preferences",
      },
      {
        to: "/library/recent",
        label: "library.recentlyPlayed",
        group: "library.collections",
        visibleWhen: "playHistory",
      },
      {
        to: "/library/top",
        label: "library.topPlayed",
        group: "library.collections",
        visibleWhen: "playHistory",
      },
    ],
  },
  {
    id: "create",
    to: "/create",
    pathPrefix: "/create",
    label: "nav.create",
    Icon: SquarePenIcon,
    // Order and availability mirror the Create landing cards.
    children: [
      {
        to: "/create/search",
        label: "create.searchGameHeading",
        enabledWhen: ["connected"],
      },
      {
        to: "/create/decks/new",
        label: "decks.new",
        visibleWhen: "decks",
        enabledWhen: ["connected"],
      },
      {
        to: "/create/mappings",
        label: "create.mappingsHeading",
        enabledWhen: ["connected"],
      },
      { to: "/create/custom", label: "create.customHeading" },
      { to: "/create/nfc", label: "create.nfcHeading", enabledWhen: ["nfc"] },
    ],
  },
  {
    id: "settings",
    to: "/settings",
    pathPrefix: "/settings",
    label: "nav.settings",
    Icon: SettingsIcon,
    // Groups and order mirror the Settings landing page.
    children: [
      {
        to: "/settings/language-region",
        label: "settings.languageRegion.title",
        group: "settings.groups.app",
      },
      {
        to: "/settings/accessibility",
        label: "settings.accessibility.title",
        group: "settings.groups.app",
      },
      {
        to: "/settings/online",
        label: "online.title",
        group: "settings.groups.app",
      },
      {
        to: "/settings/devices",
        label: "nav.devices",
        group: "settings.groups.device",
      },
      {
        to: "/settings/media",
        label: "nav.media",
        group: "settings.groups.device",
        visibleWhen: "scrapers",
      },
      {
        to: "/settings/readers",
        label: "settings.readers.title",
        group: "settings.groups.device",
      },
      {
        to: "/settings/play-controls",
        label: "settings.playControls.title",
        group: "settings.groups.device",
      },
      {
        to: "/settings/advanced",
        label: "settings.advanced.title",
        group: "settings.groups.device",
      },
      {
        to: "/settings/help",
        label: "settings.help.title",
        group: "settings.groups.support",
      },
      {
        to: "/settings/about",
        label: "settings.about.title",
        group: "settings.groups.support",
      },
    ],
  },
] as const satisfies readonly AppSectionDefinition[];

type SectionDefinition = (typeof sections)[number];

export type AppSectionId = SectionDefinition["id"];

export interface AppSectionChild extends AppSectionChildDefinition {
  to: SectionDefinition["children"][number]["to"];
}

export interface AppSection extends AppSectionDefinition {
  id: AppSectionId;
  to: SectionDefinition["to"];
  children: readonly AppSectionChild[];
}

/**
 * The four top-level destinations, in display order. The phone dock, the
 * tablet/desktop sidebar and tab session memory all read this one table.
 */
export const APP_SECTIONS: readonly AppSection[] = sections;

/** The section that owns a pathname, or null outside the four sections. */
export function appSectionForPath(pathname: string): AppSectionId | null {
  for (const section of APP_SECTIONS) {
    if (
      pathname === section.to ||
      pathname.startsWith(`${section.pathPrefix}/`)
    ) {
      return section.id;
    }
  }
  return null;
}
