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
import { useNavigationMode } from "@/hooks/useNavigationMode";
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
  const wide = useMediaQuery("(min-width: 760px)");
  const navigationMode = useNavigationMode();
  const footerRef = useRef<HTMLElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  // Phone: the whole footer (status strip plus dock, including the bottom
  // inset). Wider layouts have no dock, so only the status strip remains.
  const [footerHeight, setFooterHeight] = useState(64);

  useLayoutEffect(() => {
    const footer = footerRef.current;
    const status = statusRef.current;
    if (!footer || !status) return;

    const updateFooterHeight = () => {
      const measured = (wide ? status : footer).getBoundingClientRect().height;
      // An unlaid-out phone footer keeps the previous clearance.
      if (!wide && measured <= 0) return;
      setFooterHeight(Math.ceil(measured));
    };

    updateFooterHeight();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateFooterHeight);
    observer.observe(footer);
    observer.observe(status);
    return () => observer.disconnect();
  }, [wide]);

  // Fixed elements rendered outside the router (such as the global write
  // strip) read the measured clearance and insets from the document root.
  // Height and clearance are published separately for existing consumers and
  // always carry the same value.
  // The shell's layout, and fixed elements outside it, follow the navigation.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.appNav = navigationMode;
    return () => {
      delete root.dataset.appNav;
    };
  }, [navigationMode]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--app-footer-overlay-height", `${footerHeight}px`);
    root.style.setProperty(
      "--app-footer-overlay-clearance",
      `${footerHeight}px`,
    );
    root.style.setProperty("--app-safe-left", safeInsets.left);
    root.style.setProperty("--app-safe-right", safeInsets.right);
    return () => {
      root.style.removeProperty("--app-safe-left");
      root.style.removeProperty("--app-safe-right");
      root.style.removeProperty("--app-footer-overlay-height");
      root.style.removeProperty("--app-footer-overlay-clearance");
    };
  }, [footerHeight, safeInsets.left, safeInsets.right]);

  return (
    <div
      className="adaptive-app-shell flex h-screen w-screen flex-col"
      style={
        {
          "--app-footer-overlay-height": `${footerHeight}px`,
          "--app-footer-overlay-clearance": `${footerHeight}px`,
          "--app-safe-top": safeInsets.top,
          "--page-content-safe-top": safeInsets.top,
          "--app-safe-bottom": safeInsets.bottom,
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
      {/* Ahead of the page so tablet and desktop navigation leads reading and
          tab order; on phones it places the dock in the footer slot below. */}
      <BottomNav />
      <main
        id="main-content"
        tabIndex={-1}
        className="adaptive-app-main min-h-0 flex-1 outline-none"
      >
        <Outlet />
      </main>
      <footer
        ref={footerRef}
        className="app-primary-chrome pointer-events-none fixed inset-x-0 bottom-0 z-30"
      >
        <div ref={statusRef} className="app-connection-status">
          <ConnectionStatusBar />
        </div>
        <div data-app-dock-slot="" />
      </footer>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: ErrorComponent,
});
