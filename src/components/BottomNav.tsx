import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  LibraryBigIcon,
  SettingsIcon,
  SquarePenIcon,
  ZapIcon,
} from "lucide-react";
import classNames from "classnames";
import { type CSSProperties, ReactElement, useLayoutEffect } from "react";
import { useStatusStore } from "@/lib/store";
import { type BottomTabId, useTabSessionStore } from "@/lib/tabSessionStore";
import { useLibrarySessionStore } from "@/lib/librarySessionStore";
import { useHaptics } from "@/hooks/useHaptics";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { NotificationBadge } from "@/components/NotificationBadge";
import { PAGE_SCROLL_RESTORATION_SELECTOR } from "@/components/PageFrame";
import { ResponsiveContainer } from "./ResponsiveContainer";

function NavButton(props: {
  text: string;
  icon: ReactElement;
  path: string;
  rootPath: string;
  isActive: boolean;
  isAtRoot: boolean;
  onPopToRoot: () => void;
  onScrollToTop: () => boolean;
  className?: string;
  notificationCount?: number;
  ariaLabel?: string;
  "data-tour"?: string;
}) {
  const { impact } = useHaptics();

  return (
    <div
      className={classNames(
        "inline-flex flex-col items-center justify-center",
        props.className,
      )}
      data-tour={props["data-tour"]}
    >
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
        className="text-bd-outline flex min-h-[48px] w-full min-w-0 items-center justify-center rounded-lg px-1 py-2 transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none [&.active]:text-[#3faeec]"
      >
        <div className="drop-shadow-[0_0_5px_transparent] transition-[filter] duration-300 [.active_&]:drop-shadow-[0_0_5px_#3faeec]">
          <div className="relative mx-auto flex w-fit justify-center">
            {props.icon}
            <NotificationBadge
              count={props.notificationCount ?? 0}
              className="-top-2 -right-2"
            />
          </div>
          <div className="text-center leading-4 break-all">{props.text}</div>
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
  const safeInsets = useStatusStore((state) => state.safeInsets);
  const inboxCount = useStatusStore((state) => state.inboxMessages.length);
  const inboxFeature = useCoreFeature("inbox");

  useLayoutEffect(() => {
    rememberLocation(pathname, location.href ?? pathname);
  }, [location.href, pathname, rememberLocation]);

  // Determine which nav item is active based on current path
  const isHome = pathname === "/";
  const isLibrary = pathname.startsWith("/library");
  const isCreate = pathname.startsWith("/create");
  const isSettings = pathname.startsWith("/settings");

  const settingsNotificationCount =
    inboxFeature.available && !isSettings ? inboxCount : 0;
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

  const settingsLabel =
    settingsNotificationCount > 0
      ? t("nav.settingsWithNotifications", {
          count: settingsNotificationCount,
        })
      : undefined;

  return (
    <nav
      aria-label={t("nav.mainNavigation")}
      className="[height:calc(var(--bottom-nav-base-height)+var(--bottom-nav-safe-inset))] border-t border-t-[#ffffff21] bg-[#111928bf] backdrop-blur"
      style={
        {
          "--bottom-nav-safe-inset": safeInsets.bottom,
          paddingBottom: safeInsets.bottom,
        } as CSSProperties
      }
    >
      <ResponsiveContainer maxWidth="nav" className="h-full">
        <div
          className="mx-auto grid h-full max-w-lg grid-cols-4 items-center gap-1 px-2"
          style={{
            paddingRight: `calc(0.5rem + ${safeInsets.right})`,
            paddingLeft: `calc(0.5rem + ${safeInsets.left})`,
          }}
        >
          <NavButton
            text={t("nav.index")}
            icon={<ZapIcon size="24" />}
            path={lastHref.zap}
            rootPath="/"
            isActive={isHome}
            isAtRoot={isAtRoot("/")}
            onPopToRoot={() => popNavigationToRoot("zap")}
            onScrollToTop={scrollActivePageToTop}
          />
          <NavButton
            text={t("nav.library")}
            icon={<LibraryBigIcon size="24" />}
            path={lastHref.library}
            rootPath="/library"
            isActive={isLibrary}
            isAtRoot={isAtRoot("/library")}
            onPopToRoot={() => popNavigationToRoot("library")}
            onScrollToTop={scrollActivePageToTop}
          />
          <NavButton
            text={t("nav.create")}
            icon={<SquarePenIcon size="24" />}
            path={lastHref.create}
            rootPath="/create"
            isActive={isCreate}
            isAtRoot={isAtRoot("/create")}
            onPopToRoot={() => popNavigationToRoot("create")}
            onScrollToTop={scrollActivePageToTop}
            data-tour="nav-create"
          />
          <NavButton
            text={t("nav.settings")}
            icon={<SettingsIcon size="24" />}
            path={lastHref.settings}
            rootPath="/settings"
            isActive={isSettings}
            isAtRoot={isAtRoot("/settings")}
            onPopToRoot={() => popNavigationToRoot("settings")}
            onScrollToTop={scrollActivePageToTop}
            notificationCount={settingsNotificationCount}
            ariaLabel={settingsLabel}
            data-tour="nav-settings"
          />
        </div>
      </ResponsiveContainer>
    </nav>
  );
}
