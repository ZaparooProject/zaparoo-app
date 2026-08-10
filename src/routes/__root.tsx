import {
  createRootRoute,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { App } from "@capacitor/app";
import { useRef } from "react";
import { SafeAreaHandler } from "@/lib/safeArea";
import { ErrorComponent } from "@/components/ErrorComponent.tsx";
import { BottomNav } from "@/components/BottomNav";
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

  return (
    <div className="flex h-screen w-screen flex-col">
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
      <footer className="z-30 flex-shrink-0">
        <BottomNav />
      </footer>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: ErrorComponent,
});
