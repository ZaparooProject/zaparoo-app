import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  BellIcon,
  MaximizeIcon,
  MenuIcon,
  MinimizeIcon,
  MoonIcon,
  PanelLeftCloseIcon,
  SunIcon,
  XIcon,
} from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useTheme } from "@/components/theme-provider";
import { useNavigationMode } from "@/hooks/useNavigationMode";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useBackButtonHandler } from "@/hooks/useBackButtonHandler";
import { useSlideModalManager } from "@/hooks/useSlideModalManager";
import { useHaptics } from "@/hooks/useHaptics";
import { bottomTabForPath, type BottomTabId } from "@/lib/tabSessionStore";
import { ZapLogo } from "@/lib/images";
import { SidebarNavigation } from "@/components/SidebarNavigation";
import { SidebarDeviceStatus } from "@/components/SidebarDeviceStatus";
import { NotificationBadge } from "@/components/NotificationBadge";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { useStatusStore } from "@/lib/store";

export function AdaptiveNavigation({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const wide = useMediaQuery("(min-width: 760px)");
  const desktop = useMediaQuery("(min-width: 1280px)");
  const mode = useNavigationMode();
  const setCollapsed = usePreferencesStore(
    (state) => state.setSidebarCollapsed,
  );
  const setFullScreen = usePreferencesStore((state) => state.setFullScreen);
  const { resolvedTheme, setTheme } = useTheme();
  const inbox = useCoreFeature("inbox");
  const inboxCount = useStatusStore((state) => state.inboxMessages.length);
  const inboxOpen = useStatusStore((state) => state.inboxModalOpen);
  const setInboxOpen = useStatusStore((state) => state.setInboxModalOpen);
  const { impact } = useHaptics();
  const manager = useSlideModalManager();
  const id = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inlineSlotRef = useRef<HTMLDivElement>(null);
  // One stable host keeps the navigation tree and its DOM mounted while its
  // place in reading order follows the layout: ahead of the page from 760px,
  // in the footer dock slot on phones.
  const [host] = useState(() =>
    typeof document === "undefined" ? null : document.createElement("div"),
  );
  const [open, setOpen] = useState(false);
  const [restoreOnClose, setRestoreOnClose] = useState(true);
  const [lastMode, setLastMode] = useState({ wide, desktop });
  const [navigation, setNavigation] = useState<{
    pathname: string;
    // One section is open at a time, so the sidebar stays short.
    expanded: BottomTabId | null;
  }>({
    pathname,
    expanded: bottomTabForPath(pathname) ?? "zap",
  });
  // Width changes release the drawer; they never change the route or reset groups.
  if (lastMode.wide !== wide || lastMode.desktop !== desktop) {
    setLastMode({ wide, desktop });
    setOpen(false);
  }
  if (navigation.pathname !== pathname) {
    setRestoreOnClose(false);
    setNavigation({
      pathname,
      expanded: bottomTabForPath(pathname) ?? navigation.expanded,
    });
    setOpen(false);
  }
  useLayoutEffect(() => {
    const inlineSlot = inlineSlotRef.current;
    if (!host || !inlineSlot) return;
    const dockSlot = wide
      ? null
      : document.querySelector<HTMLElement>("[data-app-dock-slot]");
    const target = dockSlot ?? inlineSlot;
    if (host.parentElement !== target) target.appendChild(host);
  }, [host, wide]);
  useEffect(() => () => host?.remove(), [host]);
  const currentPath = pathname.replace(/\/$/, "") || "/";
  // Below 1280px the rail opens the full list over the page; from there it
  // has room to sit beside it, so the same control pins it open instead.
  const drawerOpen = mode === "rail" && !desktop && open;
  const listed = mode === "full" || drawerOpen;
  const close = useCallback(() => setOpen(false), []);
  useLayoutEffect(() => {
    if (!drawerOpen) return;
    manager.registerModal(id, close);
    return () => manager.unregisterModal(id);
  }, [drawerOpen, manager, id, close]);
  useFocusTrap({
    isActive: drawerOpen,
    containerRef: drawerRef,
    restoreFocus: !desktop && restoreOnClose,
    autoFocus: false,
    onEscape: close,
  });
  useBackButtonHandler(
    "navigation-drawer",
    () => {
      close();
      return true;
    },
    100,
    drawerOpen,
  );
  useEffect(() => {
    if (drawerOpen && !drawerRef.current?.contains(document.activeElement)) {
      drawerRef.current?.focus();
    }
  }, [drawerOpen]);
  // Full screen leaves one way back; Escape is the other, unless a dialog
  // is open and owns the key.
  const exitRef = useRef<HTMLButtonElement>(null);
  const [exitShown, setExitShown] = useState(true);
  useEffect(() => {
    if (mode !== "hidden") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reveal = () => {
      setExitShown(true);
      clearTimeout(timer);
      timer = setTimeout(() => setExitShown(false), 1500);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !manager.hasOpenModalExcept?.(id)
      ) {
        setFullScreen(false);
        return;
      }
      reveal();
    };
    reveal();
    window.addEventListener("pointermove", reveal);
    window.addEventListener("pointerdown", reveal);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", reveal);
      window.removeEventListener("pointerdown", reveal);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mode, setFullScreen, manager, id]);
  const toggle = () => {
    if (drawerOpen) {
      close();
    } else if (mode === "full") {
      impact("light");
      setCollapsed(true);
    } else if (desktop) {
      impact("light");
      setCollapsed(false);
    } else {
      if (!manager.closeAllExcept(id)) return;
      impact("light");
      setRestoreOnClose(true);
      setOpen(true);
    }
  };

  return (
    <>
      {mode === "hidden" && (
        <button
          ref={exitRef}
          type="button"
          className="app-fullscreen-exit"
          data-shown={exitShown || undefined}
          aria-label={t("nav.exitFullScreen")}
          onFocus={() => setExitShown(true)}
          onClick={() => {
            impact("light");
            setFullScreen(false);
          }}
        >
          <MinimizeIcon size={24} aria-hidden="true" />
        </button>
      )}
      {drawerOpen && (
        <div
          className="app-navigation-backdrop"
          data-focus-trap-exempt
          aria-hidden="true"
          onClick={close}
        />
      )}
      <div ref={inlineSlotRef} />
      {host &&
        createPortal(
          <div
            ref={drawerRef}
            id={id}
            role={drawerOpen ? "dialog" : undefined}
            aria-modal={drawerOpen || undefined}
            aria-label={drawerOpen ? t("nav.menu") : undefined}
            tabIndex={drawerOpen ? -1 : undefined}
            hidden={mode === "hidden"}
            data-mode={wide ? (listed ? "full" : "rail") : undefined}
            className={wide ? "app-sidebar" : undefined}
          >
            {wide && (
              <div className="sidebar-brand">
                {/* One control at every size, so focus stays put as the
                    sidebar opens, closes, collapses and expands. */}
                <button
                  ref={toggleRef}
                  type="button"
                  className="sidebar-disclosure"
                  aria-label={t(
                    drawerOpen
                      ? "nav.close"
                      : mode === "full"
                        ? "nav.collapseSidebar"
                        : "nav.openMenu",
                  )}
                  aria-expanded={listed}
                  aria-controls={`${id}-list`}
                  onClick={toggle}
                >
                  {drawerOpen ? (
                    <XIcon size={24} aria-hidden="true" />
                  ) : mode === "full" ? (
                    <PanelLeftCloseIcon size={24} aria-hidden="true" />
                  ) : (
                    <MenuIcon size={24} aria-hidden="true" />
                  )}
                </button>
                {listed && <ZapLogo width={144} />}
              </div>
            )}
            <nav
              id={`${id}-list`}
              aria-label={t("nav.mainNavigation")}
              className={wide ? "sidebar-navigation" : "bottom-nav-shell"}
            >
              {wide ? (
                <SidebarNavigation
                  desktop={mode === "full"}
                  rail={!listed}
                  expanded={navigation.expanded}
                  onToggle={(group) =>
                    setNavigation((current) => ({
                      ...current,
                      expanded: current.expanded === group ? null : group,
                    }))
                  }
                  onNavigate={(to) => {
                    // Reselecting the current page changes no route, so no
                    // page heading takes focus; return it to the menu button.
                    if (to !== currentPath) setRestoreOnClose(false);
                    close();
                  }}
                />
              ) : (
                children
              )}
            </nav>
            {wide && (
              <div className="sidebar-footer">
                {inbox.available && (
                  <button
                    type="button"
                    className="sidebar-action"
                    aria-label={
                      inboxCount > 0
                        ? t("inbox.openLabelWithCount", { count: inboxCount })
                        : t("inbox.openLabel")
                    }
                    aria-expanded={inboxOpen}
                    onClick={() => {
                      impact("light");
                      close();
                      setInboxOpen(true);
                    }}
                  >
                    <span className="relative shrink-0" aria-hidden="true">
                      <BellIcon size={22} />
                      <NotificationBadge
                        count={inboxCount}
                        className="-top-2 -right-2"
                      />
                    </span>
                    {listed && <span>{t("inbox.title")}</span>}
                  </button>
                )}
                {/* One button flips what is showing now; "System" stays under
                    Settings > Accessibility. It names the mode it switches to. */}
                <button
                  type="button"
                  className="sidebar-action"
                  aria-label={
                    listed
                      ? undefined
                      : t(
                          resolvedTheme === "dark"
                            ? "nav.lightMode"
                            : "nav.darkMode",
                        )
                  }
                  onClick={() => {
                    impact("light");
                    setTheme(resolvedTheme === "dark" ? "light" : "dark");
                  }}
                >
                  {resolvedTheme === "dark" ? (
                    <SunIcon size={22} aria-hidden="true" />
                  ) : (
                    <MoonIcon size={22} aria-hidden="true" />
                  )}
                  {listed && (
                    <span>
                      {t(
                        resolvedTheme === "dark"
                          ? "nav.lightMode"
                          : "nav.darkMode",
                      )}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="sidebar-action"
                  aria-label={listed ? undefined : t("nav.fullScreen")}
                  onClick={() => {
                    impact("light");
                    close();
                    setFullScreen(true);
                  }}
                >
                  <MaximizeIcon size={22} aria-hidden="true" />
                  {listed && <span>{t("nav.fullScreen")}</span>}
                </button>
                {listed && <SidebarDeviceStatus />}
              </div>
            )}
          </div>,
          host,
        )}
    </>
  );
}
