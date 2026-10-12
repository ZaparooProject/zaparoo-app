import { type MouseEvent } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon } from "lucide-react";
import { useAppUi } from "@/hooks/useAppUi";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { useHaptics } from "@/hooks/useHaptics";
import { APP_SECTIONS, type AppSectionGate } from "@/lib/appSections";
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
  /** Called with the activated destination's route path. */
  onNavigate: (to: string) => void;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { impact } = useHaptics();
  const nfc = useAppUi().nfc;
  const connected = useStatusStore((s) => s.connected);
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
  const gates: Record<AppSectionGate, boolean> = {
    playHistory: history.available,
    favorites: favorites.available,
    preferences: preferences.available,
    decks: decks.available,
    scrapers: scrapers.available,
    nfc,
    connected,
  };
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
    onNavigate(to);
  };

  return (
    <ul className="sidebar-groups">
      {APP_SECTIONS.map(({ id, to, label, Icon, children }) => {
        const open = Boolean(expanded[id]);
        const current = normalized === to;
        // Matches the phone dock: Settings shows its own Inbox entry point.
        const count =
          id === "settings" && inbox.available && activeGroup !== "settings"
            ? inboxCount
            : 0;
        return (
          <li
            key={id}
            className="sidebar-group"
            data-active={activeGroup === id || undefined}
            data-expanded={open || undefined}
            aria-labelledby={`sidebar-${id}-link`}
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
                // The router marks fuzzy matches as the current page; only the
                // exact destination is.
                activeOptions={{ exact: true }}
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
                  open ? "nav.collapseSection" : "nav.expandSection",
                  { section: t(label) },
                )}
                onClick={() => {
                  impact("light");
                  onToggle(id);
                }}
              >
                <ChevronDownIcon size={20} aria-hidden="true" />
              </button>
            </div>
            <ul
              id={`sidebar-${id}`}
              className="sidebar-children"
              hidden={!open}
            >
              {children
                .filter(({ visibleWhen }) => !visibleWhen || gates[visibleWhen])
                .map((child) => {
                  const unavailable =
                    child.enabledWhen?.some((gate) => !gates[gate]) ?? false;
                  return (
                    <li key={child.to}>
                      <Link
                        to={child.to}
                        disabled={unavailable}
                        aria-disabled={unavailable || undefined}
                        resetScroll={desktop}
                        replace={desktop && normalized === child.to}
                        state={
                          desktop
                            ? { appNavigationSource: "desktop-sidebar" }
                            : undefined
                        }
                        activeOptions={{ exact: true }}
                        className="sidebar-child-link"
                        // "page" is the destination itself; "true" marks the
                        // listed ancestor of a deeper route such as an editor.
                        aria-current={
                          normalized === child.to
                            ? "page"
                            : normalized.startsWith(`${child.to}/`)
                              ? "true"
                              : undefined
                        }
                        onClick={(event) => {
                          if (!unavailable)
                            navigateDestination(event, child.to);
                        }}
                      >
                        {t(child.label)}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
