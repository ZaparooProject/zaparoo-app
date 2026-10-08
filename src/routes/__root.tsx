import {
  createRootRoute,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { SafeAreaHandler } from "@/lib/safeArea";
import { ErrorComponent } from "@/components/ErrorComponent.tsx";
import { BottomNav } from "@/components/BottomNav";
import { ConnectionStatusBar } from "@/components/ConnectionStatusBar";
import { DeviceSheetProvider } from "@/components/DeviceSheetProvider";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { TourInitializer } from "@/components/TourInitializer";
import { useBackButtonHandler } from "@/hooks/useBackButtonHandler";
import { SkipLink } from "@/components/SkipLink";
import { useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useShakeDetection } from "@/hooks/useShakeDetection";
import {
  appBackDestination,
  appBackNavigationOptions,
} from "@/lib/tabSessionStore";

// Shake detection component - must be inside router context to access location
// Exported for testing
export function ShakeDetector() {
  const { pathname } = useLocation();
  const shakeEnabled = usePreferencesStore((state) => state.shakeEnabled);
  const connected = useStatusStore((state) => state.connected);

  useShakeDetection({
    shakeEnabled,
    connected,
    pathname,
  });

  return null;
}

// Exported for testing
export function BackHandler() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useBackButtonHandler(
    "navigation",
    () => {
      if (pathname === "/") {
        if (!Capacitor.isNativePlatform()) return false;

        App.exitApp();
        return true;
      }

      const destination = appBackDestination(pathname);
      if (!destination) return false;

      void navigate(appBackNavigationOptions(destination));
      return true;
    },
    0, // Lowest priority - fallback navigation
  );

  return null;
}

// Exported for testing
export function RootLayout() {
  return (
    <DeviceSheetProvider>
      <AdaptiveRootLayout />
    </DeviceSheetProvider>
  );
}

function AdaptiveRootLayout() {
  const safeInsets = useStatusStore((state) => state.safeInsets);
  const safeBottom = safeInsets.bottom;
  const wide = useMediaQuery("(min-width: 760px)");
  const sidebar = useMediaQuery("(min-width: 1280px)");
  const tablet = wide && !sidebar;
  const mainRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const [footerMetrics, setFooterMetrics] = useState({
    height: 64,
    clearance: 92,
  });

  useLayoutEffect(() => {
    const footer = footerRef.current;
    if (!footer) return;

    const updateFooterClearance = () => {
      const footerRect = footer.getBoundingClientRect();
      if (wide) {
        const status = footer.querySelector<HTMLElement>(
          ".app-connection-status",
        );
        const height = Math.ceil(status?.getBoundingClientRect().height ?? 0);
        setFooterMetrics((current) =>
          current.height === height && current.clearance === height
            ? current
            : { height, clearance: height },
        );
        return;
      }
      if (footerRect.height <= 0) return;

      const navSurface = footer.querySelector<HTMLElement>(
        ".bottom-nav-surface",
      );
      const navShell = footer.querySelector<HTMLElement>(".bottom-nav-shell");
      const safeBottom = navShell
        ? Number.parseFloat(
            getComputedStyle(navShell).getPropertyValue(
              "--bottom-nav-safe-inset",
            ),
          ) || 0
        : 0;
      const outerGutter = navSurface
        ? Math.max(
            0,
            footerRect.bottom -
              navSurface.getBoundingClientRect().bottom -
              safeBottom,
          )
        : 12;
      const nextMetrics = {
        height: Math.ceil(footerRect.height),
        clearance: Math.ceil(footerRect.height + outerGutter),
      };
      setFooterMetrics((currentMetrics) =>
        currentMetrics.height === nextMetrics.height &&
        currentMetrics.clearance === nextMetrics.clearance
          ? currentMetrics
          : nextMetrics,
      );
    };

    updateFooterClearance();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateFooterClearance);
    observer.observe(footer);
    const status = footer.querySelector<HTMLElement>(".app-connection-status");
    if (status) observer.observe(status);
    return () => observer.disconnect();
  }, [wide]);

  // Fixed elements rendered outside the router (such as the global write
  // strip) read the same measured clearance from the document root.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      "--app-footer-overlay-height",
      `${footerMetrics.height}px`,
    );
    root.style.setProperty(
      "--app-footer-overlay-clearance",
      `${footerMetrics.clearance}px`,
    );
    root.style.setProperty("--app-safe-left", safeInsets.left);
    return () => {
      root.style.removeProperty("--app-safe-left");
      root.style.removeProperty("--app-footer-overlay-height");
      root.style.removeProperty("--app-footer-overlay-clearance");
    };
  }, [footerMetrics, safeInsets.left]);

  return (
    <div
      className="adaptive-app-shell flex h-screen w-screen flex-col"
      style={
        {
          "--app-footer-overlay-height": `${footerMetrics.height}px`,
          "--app-footer-overlay-clearance": `${footerMetrics.clearance}px`,
          "--app-safe-top": safeInsets.top,
          "--page-content-safe-top": tablet ? "0px" : safeInsets.top,
          "--app-safe-bottom": safeBottom,
          "--app-safe-left": safeInsets.left,
          "--app-safe-right": safeInsets.right,
        } as CSSProperties
      }
    >
      <SkipLink targetId="main-content" />
      <SafeAreaHandler />
      <BackHandler />
      <ShakeDetector />
      <TourInitializer />
      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className="adaptive-app-main min-h-0 flex-1 outline-none"
      >
        <Outlet />
      </main>
      <footer
        ref={footerRef}
        className="app-primary-chrome pointer-events-none fixed inset-x-0 bottom-0 z-30"
      >
        <div className="app-connection-status">
          <ConnectionStatusBar />
        </div>
        <BottomNav />
      </footer>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: ErrorComponent,
});
