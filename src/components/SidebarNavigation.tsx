import {
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import {
  Link,
  useLinkProps,
  useLocation,
  type LinkProps,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon } from "lucide-react";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useAppUi } from "@/hooks/useAppUi";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { useHaptics } from "@/hooks/useHaptics";
import {
  APP_SECTIONS,
  type AppSection,
  type AppSectionChild,
  type AppSectionGate,
} from "@/lib/appSections";
import { useLibrarySessionStore } from "@/lib/librarySessionStore";
import { bottomTabForPath, type BottomTabId } from "@/lib/tabSessionStore";
import { useStatusStore } from "@/lib/store";
import { PAGE_SCROLL_RESTORATION_SELECTOR } from "@/components/PageFrame";

/**
 * The router marks every exact path match as the current page. A destination
 * that is one view of its route decides that for itself.
 */
function SidebarChildLink({
  current,
  children,
  ...options
}: LinkProps &
  Pick<ComponentProps<"a">, "className" | "aria-disabled" | "onClick"> & {
    current: "page" | "true" | undefined;
    children: ReactNode;
  }) {
  const props = useLinkProps(options);
  const ref = useRef<HTMLAnchorElement>(null);
  // A tall section list scrolls above the pinned footer; keep the current
  // page's entry in view.
  useEffect(() => {
    if (current) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [current]);
  return (
    <a {...props} ref={ref} aria-current={current}>
      {children}
    </a>
  );
}

const RAIL_LABEL_SIZE = 11;
const RAIL_LABEL_MIN_SIZE = 8;

/**
 * A section name on the rail. A name too long for the rail's width (some
 * translations) is set smaller, only as far as it needs, before it wraps.
 */
function RailLabel({ children }: { children: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const label = ref.current;
    const room = label?.parentElement?.clientWidth ?? 0;
    if (!label || room <= 0) return;
    label.style.fontSize = `${RAIL_LABEL_SIZE}px`;
    label.style.whiteSpace = "nowrap";
    const width = label.scrollWidth;
    const size =
      width > room
        ? Math.max(
            RAIL_LABEL_MIN_SIZE,
            Math.floor(((RAIL_LABEL_SIZE * room) / width) * 2) / 2,
          )
        : RAIL_LABEL_SIZE;
    label.style.fontSize = `${size}px`;
    // Still too long at the smallest size: let it wrap.
    label.style.whiteSpace = label.scrollWidth > room ? "" : "nowrap";
  }, [children]);
  return (
    <span ref={ref} className="sidebar-rail-label">
      {children}
    </span>
  );
}

export function SidebarNavigation({
  desktop = false,
  rail = false,
  expanded,
  onToggle,
  onNavigate,
}: {
  desktop?: boolean;
  /** Only the sections, as icons over their names; children are not listed. */
  rail?: boolean;
  /** The one open section; opening another closes it. */
  expanded: BottomTabId | null;
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
  const libraryView = useLibrarySessionStore((state) => state.view);
  const showLibraryView = useLibrarySessionStore((state) => state.showView);
  const deviceKey = useActiveDeviceKey();
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

  // "page" is the destination itself; "true" marks the listed ancestor of a
  // deeper route such as an editor.
  const childCurrent = (section: AppSection, child: AppSectionChild) => {
    if (!child.libraryView) {
      if (normalized === child.to) return "page";
      return normalized.startsWith(`${child.to}/`) ? "true" : undefined;
    }
    // Without collections the Library landing has no views to choose between.
    const view = favorites.available ? libraryView : "systems";
    if (normalized === child.to) {
      return view === child.libraryView ? "page" : undefined;
    }
    // Decks belong to the collections view. A system's own pages sit directly
    // under the section root, beside the listed collections.
    const deeper = normalized.startsWith(`${child.to}/`);
    const decks = normalized.startsWith(`${child.to}/decks`);
    if (child.libraryView === "collections") return decks ? "true" : undefined;
    const listed = section.children.some(
      (other) =>
        other.to !== child.to &&
        (normalized === other.to || normalized.startsWith(`${other.to}/`)),
    );
    return deeper && !decks && !listed ? "true" : undefined;
  };
  const renderChildLink = (section: AppSection, child: AppSectionChild) => {
    const unavailable =
      child.enabledWhen?.some((gate) => !gates[gate]) ?? false;
    return (
      <SidebarChildLink
        to={child.to}
        disabled={unavailable}
        aria-disabled={unavailable || undefined}
        resetScroll={desktop}
        replace={desktop && normalized === child.to}
        state={desktop ? { appNavigationSource: "desktop-sidebar" } : undefined}
        activeOptions={{ exact: true }}
        className="sidebar-child-link"
        current={childCurrent(section, child)}
        onClick={(event) => {
          if (unavailable) return;
          if (child.libraryView) showLibraryView(deviceKey, child.libraryView);
          navigateDestination(event, child.to);
        }}
      >
        {t(child.label)}
      </SidebarChildLink>
    );
  };
  const renderChild = (section: AppSection, child: AppSectionChild) => (
    <li key={`${child.to}:${child.libraryView ?? ""}`}>
      {renderChildLink(section, child)}
    </li>
  );

  return (
    <ul className="sidebar-groups" data-rail={rail || undefined}>
      {APP_SECTIONS.map((section) => {
        const { id, to, label, Icon } = section;
        const open = expanded === id;
        // Consecutive children of one group are listed under its label.
        const runs: { group?: string; children: AppSectionChild[] }[] = [];
        for (const child of section.children) {
          if (child.visibleWhen && !gates[child.visibleWhen]) continue;
          const last = runs.at(-1);
          if (last && last.group === child.group) last.children.push(child);
          else runs.push({ group: child.group, children: [child] });
        }
        const current = normalized === to;
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
                aria-current={
                  current
                    ? "page"
                    : // The rail lists nothing deeper, so its section link is
                      // the listed ancestor of every page inside it.
                      rail && activeGroup === id
                      ? "true"
                      : undefined
                }
                onClick={(event) => {
                  // Beside the persistent sidebar the Library root has no
                  // tabs, so its section link always opens the first view.
                  if (desktop && id === "library") {
                    showLibraryView(deviceKey, "systems");
                  }
                  navigateDestination(event, to);
                }}
              >
                <span className="shrink-0" aria-hidden="true">
                  <Icon size={22} className="sidebar-root-icon" />
                </span>
                {rail ? (
                  <RailLabel>{t(label)}</RailLabel>
                ) : (
                  <span>{t(label)}</span>
                )}
              </Link>
              {!rail && (
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
              )}
            </div>
            <ul
              id={`sidebar-${id}`}
              className="sidebar-children"
              hidden={!open || rail}
            >
              {runs.map(({ group, children }) => {
                if (!group) {
                  return children.map((child) => renderChild(section, child));
                }
                const headingId = `sidebar-${id}-${group}`;
                return (
                  <li key={group}>
                    <span id={headingId} className="sidebar-child-group-label">
                      {t(group)}
                    </span>
                    <ul aria-labelledby={headingId}>
                      {children.map((child) => renderChild(section, child))}
                    </ul>
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
