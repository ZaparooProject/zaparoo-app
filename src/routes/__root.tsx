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
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="flex h-screen w-screen flex-col"
      style={
        {
          "--app-footer-overlay-height": `${footerMetrics.height}px`,
          "--app-footer-overlay-clearance": `${footerMetrics.clearance}px`,
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
        className="min-h-0 flex-1 outline-none"
      >
        <Outlet />
      </main>
      <footer
        ref={footerRef}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30"
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
