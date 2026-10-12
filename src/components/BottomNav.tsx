import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ReactElement, useLayoutEffect } from "react";
import { AdaptiveNavigation } from "@/components/AdaptiveNavigation";
import { APP_SECTIONS } from "@/lib/appSections";
import { useStatusStore } from "@/lib/store";
import {
  bottomTabForPath,
  type BottomTabId,
  useTabSessionStore,
} from "@/lib/tabSessionStore";
import { useLibrarySessionStore } from "@/lib/librarySessionStore";
import { useHaptics } from "@/hooks/useHaptics";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { NotificationBadge } from "@/components/NotificationBadge";
import { PAGE_SCROLL_RESTORATION_SELECTOR } from "@/components/PageFrame";

function NavButton(props: {
  text: string;
  icon: ReactElement;
  path: string;
  rootPath: string;
  isActive: boolean;
  isAtRoot: boolean;
  onPopToRoot: () => void;
  onScrollToTop: () => boolean;
  notificationCount?: number;
  ariaLabel?: string;
}) {
  const { impact } = useHaptics();

  return (
    <div className="inline-flex flex-col items-center justify-center">
      <Link
        to={props.isActive ? props.rootPath : props.path}
        resetScroll={false}
        onClick={(event) => {
          if (props.isActive && props.isAtRoot) {
            event.preventDefault();
            if (props.onScrollToTop()) impact("light");
            return;
          }

          impact("light");
          if (props.isActive) props.onPopToRoot();
        }}
        aria-current={props.isActive ? "page" : undefined}
        aria-label={props.ariaLabel}
        className="bottom-nav-tab flex w-full min-w-0 items-center rounded-md"
      >
        <div className="flex min-w-0">
          <div className="relative mx-auto flex w-fit justify-center">
            <span className="bottom-nav-icon">{props.icon}</span>
            <NotificationBadge
              count={props.notificationCount ?? 0}
              className="-top-2 -right-2"
            />
          </div>
          {/* Hyphenate labels too long for the tab, and only break inside a
              word when hyphenation cannot, such as capitalized English. */}
          <div className="app-navigation-label text-center font-semibold tracking-[0.5px] wrap-anywhere hyphens-auto uppercase">
            {props.text}
          </div>
        </div>
      </Link>
    </div>
  );
}

export function BottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const { pathname } = location;
  const lastHref = useTabSessionStore((state) => state.lastHref);
  const rememberLocation = useTabSessionStore(
    (state) => state.rememberLocation,
  );
  const popTabToRoot = useTabSessionStore((state) => state.popTabToRoot);
  const resetLibraryNavigation = useLibrarySessionStore(
    (state) => state.resetNavigation,
  );
  const inboxCount = useStatusStore((state) => state.inboxMessages.length);
  const inboxFeature = useCoreFeature("inbox");

  useLayoutEffect(() => {
    rememberLocation(pathname, location.href ?? pathname);
  }, [location.href, pathname, rememberLocation]);

  const activeTab = bottomTabForPath(pathname);

  // Settings carries its own Inbox entry point, so the badge only shows elsewhere.
  const settingsNotificationCount =
    inboxFeature.available && activeTab !== "settings" ? inboxCount : 0;
  const popNavigationToRoot = (tab: BottomTabId) => {
    popTabToRoot(tab);
    if (tab === "library") resetLibraryNavigation();
  };
  const isAtRoot = (rootPath: string) =>
    pathname === rootPath || (rootPath !== "/" && pathname === `${rootPath}/`);
  const scrollActivePageToTop = () => {
    const scrollContainer = document.querySelector(
      PAGE_SCROLL_RESTORATION_SELECTOR,
    );
    if (
      !(scrollContainer instanceof HTMLElement) ||
      scrollContainer.scrollTop <= 0
    ) {
      return false;
    }

    useTabSessionStore
      .getState()
      .rememberScroll(location.href ?? pathname, 0, 0);
    scrollContainer.scrollTo({ left: 0, top: 0, behavior: "smooth" });
    return true;
  };

  return (
    <AdaptiveNavigation>
      <div className="bottom-nav-surface">
        <div className="app-navigation-grid mx-auto grid max-w-lg items-center">
          {APP_SECTIONS.map(({ id, to, label, Icon }) => {
            const notificationCount =
              id === "settings" ? settingsNotificationCount : 0;
            return (
              <NavButton
                key={id}
                text={t(label)}
                icon={<Icon size="24" />}
                path={lastHref[id]}
                rootPath={to}
                isActive={activeTab === id}
                isAtRoot={isAtRoot(to)}
                onPopToRoot={() => popNavigationToRoot(id)}
                onScrollToTop={scrollActivePageToTop}
                notificationCount={notificationCount}
                ariaLabel={
                  notificationCount > 0
                    ? t("nav.settingsWithNotifications", {
                        count: notificationCount,
                      })
                    : undefined
                }
              />
            );
          })}
        </div>
      </div>
    </AdaptiveNavigation>
  );
}
