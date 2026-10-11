import { type MouseEvent } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  LibraryBigIcon,
  SettingsIcon,
  SquarePenIcon,
  ZapIcon,
} from "lucide-react";
import { useAppUi } from "@/hooks/useAppUi";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { useHaptics } from "@/hooks/useHaptics";
import { bottomTabForPath, type BottomTabId } from "@/lib/tabSessionStore";
import { useStatusStore } from "@/lib/store";
import { NotificationBadge } from "@/components/NotificationBadge";
import { PAGE_SCROLL_RESTORATION_SELECTOR } from "@/components/PageFrame";

export function SidebarNavigation({
  desktop = false,
  expanded,
  onToggle,
  onNavigate,
}: {
  desktop?: boolean;
  expanded: Partial<Record<BottomTabId, boolean>>;
  onToggle: (group: BottomTabId) => void;
  onNavigate: () => void;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { impact } = useHaptics();
  const nfc = useAppUi().nfc;
  const history = useCoreFeature("mediaRecents", { requireKnownSupport: true });
  const favorites = useCoreFeature("mediaFavorites");
  const preferences = useCoreFeature("mediaPreferences", {
    requireKnownSupport: true,
  });
  const decks = useCoreFeature("decks", { requireKnownSupport: true });
  const scrapers = useCoreFeature("mediaScrapers", {
    requireKnownSupport: true,
  });
  const inbox = useCoreFeature("inbox");
  const inboxCount = useStatusStore((s) => s.inboxMessages.length);
  const groups = [
    {
      id: "zap",
      to: "/",
      label: "nav.index",
      Icon: ZapIcon,
      children: [
        { to: "/zap/scan-history", label: "scan.scanHistoryTitle" },
        ...(history.available
          ? [{ to: "/zap/play-history", label: "scan.playHistoryTitle" }]
          : []),
      ],
    },
    {
      id: "library",
      to: "/library",
      label: "nav.library",
      Icon: LibraryBigIcon,
      children: [
        { to: "/library/search", label: "library.searchTitle" },
        ...(favorites.available
          ? [{ to: "/library/favorites", label: "library.favorites" }]
          : []),
        ...(history.available
          ? [
              { to: "/library/recent", label: "library.recentlyPlayed" },
              { to: "/library/top", label: "library.topPlayed" },
            ]
          : []),
        ...(preferences.available
          ? [
              { to: "/library/liked", label: "library.liked" },
              { to: "/library/play-later", label: "library.playLater" },
              { to: "/library/disliked", label: "library.disliked" },
            ]
          : []),
      ],
    },
    {
      id: "create",
      to: "/create",
      label: "nav.create",
      Icon: SquarePenIcon,
      children: [
        { to: "/create/search", label: "create.searchGameHeading" },
        { to: "/create/custom", label: "create.customHeading" },
        { to: "/create/mappings", label: "create.mappingsHeading" },
        ...(decks.available
          ? [{ to: "/create/decks/new", label: "decks.new" }]
          : []),
        ...(nfc ? [{ to: "/create/nfc", label: "create.nfcHeading" }] : []),
      ],
    },
    {
      id: "settings",
      to: "/settings",
      label: "nav.settings",
      Icon: SettingsIcon,
      children: [
        { to: "/settings/devices", label: "navigation.devices" },
        { to: "/settings/readers", label: "settings.readers.title" },
        ...(scrapers.available
          ? [{ to: "/settings/media", label: "settings.media.title" }]
          : []),
        { to: "/settings/play-controls", label: "settings.playControls.title" },
        {
          to: "/settings/language-region",
          label: "settings.languageRegion.title",
        },
        {
          to: "/settings/accessibility",
          label: "settings.accessibility.title",
        },
        { to: "/settings/online", label: "online.title" },
        { to: "/settings/advanced", label: "settings.advanced.title" },
        { to: "/settings/help", label: "settings.help.title" },
        { to: "/settings/about", label: "settings.about.title" },
      ],
    },
  ] as const;
  const activeGroup = bottomTabForPath(pathname);
  const normalized = pathname.replace(/\/$/, "") || "/";
  const navigateDestination = (
    event: MouseEvent<HTMLAnchorElement>,
    to: string,
  ) => {
    impact("light");
    if (
      desktop &&
      normalized === to &&
      !event.defaultPrevented &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      const scroll = document.querySelector(PAGE_SCROLL_RESTORATION_SELECTOR);
      if (scroll instanceof HTMLElement) {
        scroll.scrollLeft = 0;
        scroll.scrollTop = 0;
      }
    }
    onNavigate();
  };

  return (
    <ul className="sidebar-groups">
      {groups.map(({ id, to, label, Icon, children }) => {
        const open = Boolean(expanded[id]);
        const current = normalized === to;
        const count = id === "settings" && inbox.available ? inboxCount : 0;
        return (
          <li
            key={id}
            className="sidebar-group"
            data-active={activeGroup === id || undefined}
            data-expanded={open || undefined}
            aria-labelledby={`sidebar-${id}-link`}
            data-tour={
              id === "settings" || id === "create" ? `nav-${id}` : undefined
            }
          >
            <div className="sidebar-group-heading">
              <Link
                id={`sidebar-${id}-link`}
                to={to}
                resetScroll={desktop}
                replace={desktop && current}
                state={
                  desktop
                    ? { appNavigationSource: "desktop-sidebar" }
                    : undefined
                }
                className="sidebar-root-link"
                aria-current={current ? "page" : undefined}
                aria-label={
                  count > 0
                    ? t("nav.settingsWithNotifications", { count })
                    : undefined
                }
                onClick={(event) => navigateDestination(event, to)}
              >
                <span className="relative shrink-0" aria-hidden="true">
                  <Icon size={22} className="sidebar-root-icon" />
                  <NotificationBadge
                    count={count}
                    className="-top-2 -right-2"
                  />
                </span>
                <span>{t(label)}</span>
              </Link>
              <button
                type="button"
                className="sidebar-disclosure"
                aria-expanded={open}
                aria-controls={`sidebar-${id}`}
                aria-label={t(
                  open
                    ? "navigation.collapseSection"
                    : "navigation.expandSection",
                  { section: t(label) },
                )}
                onClick={() => {
                  impact("light");
                  onToggle(id);
                }}
              >
                <ChevronDown size={20} aria-hidden="true" />
              </button>
            </div>
            <ul
              id={`sidebar-${id}`}
              className="sidebar-children"
              hidden={!open}
            >
              {children.map((child) => (
                <li key={child.to}>
                  <Link
                    to={child.to}
                    resetScroll={desktop}
                    replace={desktop && normalized === child.to}
                    state={
                      desktop
                        ? { appNavigationSource: "desktop-sidebar" }
                        : undefined
                    }
                    className="sidebar-child-link"
                    aria-current={
                      normalized === child.to ||
                      normalized.startsWith(`${child.to}/`)
                        ? "page"
                        : undefined
                    }
                    onClick={(event) => navigateDestination(event, child.to)}
                  >
                    {t(child.label)}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
