import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { MenuIcon, XIcon } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useBackButtonHandler } from "@/hooks/useBackButtonHandler";
import { useSlideModalManager } from "@/hooks/useSlideModalManager";
import { useHaptics } from "@/hooks/useHaptics";
import { bottomTabForPath, type BottomTabId } from "@/lib/tabSessionStore";
import { useStatusStore } from "@/lib/store";
import { ZapLogo } from "@/lib/images";
import { SidebarNavigation } from "@/components/SidebarNavigation";
import { SidebarDeviceStatus } from "@/components/SidebarDeviceStatus";

export function AdaptiveNavigation({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const wide = useMediaQuery("(min-width: 760px)");
  const desktop = useMediaQuery("(min-width: 1280px)");
  const tablet = wide && !desktop;
  const safe = useStatusStore((s) => s.safeInsets);
  const { impact } = useHaptics();
  const manager = useSlideModalManager();
  const id = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [restoreOnClose, setRestoreOnClose] = useState(true);
  const [lastMode, setLastMode] = useState({ wide, desktop });
  const [navigation, setNavigation] = useState<{
    pathname: string;
    expanded: Partial<Record<BottomTabId, boolean>>;
  }>({
    pathname,
    expanded: { [bottomTabForPath(pathname) ?? "zap"]: true },
  });
  // Width changes release the drawer; they never change the route or reset groups.
  if (lastMode.wide !== wide || lastMode.desktop !== desktop) {
    setLastMode({ wide, desktop });
    setOpen(false);
  }
  if (navigation.pathname !== pathname) {
    setRestoreOnClose(false);
    const group = bottomTabForPath(pathname);
    setNavigation({
      pathname,
      expanded: { ...navigation.expanded, ...(group ? { [group]: true } : {}) },
    });
    setOpen(false);
  }
  const drawerOpen = tablet && open;
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
    } else if (
      tablet &&
      !open &&
      drawerRef.current?.contains(document.activeElement)
    ) {
      toggleRef.current?.focus();
    }
  }, [drawerOpen, tablet, open]);

  return (
    <>
      {tablet && (
        <div className="app-tablet-bar">
          <button
            ref={toggleRef}
            type="button"
            className="sidebar-disclosure"
            aria-label={t("navigation.openMenu")}
            aria-expanded={drawerOpen}
            aria-controls={id}
            onClick={() => {
              if (!manager.closeAllExcept(id)) return;
              impact("light");
              setRestoreOnClose(true);
              setOpen(true);
            }}
          >
            <MenuIcon size={24} aria-hidden="true" />
          </button>
          <ZapLogo width={120} />
        </div>
      )}
      {drawerOpen && (
        <div
          className="app-navigation-backdrop"
          data-focus-trap-exempt
          aria-hidden="true"
          onClick={close}
        />
      )}
      <div
        ref={drawerRef}
        id={id}
        role={tablet ? "dialog" : undefined}
        aria-modal={drawerOpen || undefined}
        aria-label={tablet ? t("nav.mainNavigation") : undefined}
        tabIndex={tablet ? -1 : undefined}
        hidden={tablet && !open}
        className={wide ? "app-sidebar" : undefined}
        style={
          {
            "--app-navigation-safe-top": safe.top,
            "--app-navigation-safe-left": safe.left,
            "--app-navigation-safe-right": safe.right,
            "--bottom-nav-safe-inset": safe.bottom,
          } as CSSProperties
        }
      >
        {wide && (
          <div className="sidebar-brand">
            <ZapLogo width={144} />
            {tablet && (
              <button
                type="button"
                className="sidebar-disclosure"
                aria-label={t("nav.close")}
                onClick={close}
              >
                <XIcon size={24} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        <nav
          aria-label={t("nav.mainNavigation")}
          className={wide ? "sidebar-navigation" : "bottom-nav-shell"}
          style={
            {
              "--bottom-nav-safe-inset": safe.bottom,
              "--app-navigation-safe-left": safe.left,
              "--app-navigation-safe-right": safe.right,
            } as CSSProperties
          }
        >
          {wide ? (
            <SidebarNavigation
              desktop={desktop}
              expanded={navigation.expanded}
              onToggle={(group) =>
                setNavigation((current) => ({
                  ...current,
                  expanded: {
                    ...current.expanded,
                    [group]: !current.expanded[group],
                  },
                }))
              }
              onNavigate={() => {
                setRestoreOnClose(false);
                close();
              }}
            />
          ) : (
            children
          )}
        </nav>
        {wide && <SidebarDeviceStatus />}
      </div>
    </>
  );
}
