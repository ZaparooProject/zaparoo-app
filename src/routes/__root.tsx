import { createRootRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { App } from "@capacitor/app";
import React, { useRef } from "react";
import { SafeAreaHandler } from "@/lib/safeArea";
import { ErrorComponent } from "@/components/ErrorComponent.tsx";
import { BottomNav } from "@/components/BottomNav";
import { TourInitializer } from "@/components/TourInitializer";
import { useBackButtonHandler } from "@/hooks/useBackButtonHandler";
import { SkipLink } from "@/components/SkipLink";
import { useStatusStore } from "@/lib/store";

function BackHandler() {
  const navigate = useNavigate();

  useBackButtonHandler(
    "navigation",
    () => {
      if (location.pathname === "/") {
        App.exitApp();
        return true;
      }

      if (
        location.pathname === "/create" ||
        location.pathname === "/settings"
      ) {
        navigate({ to: "/" });
        return true;
      }

      if (location.pathname.startsWith("/create")) {
        navigate({ to: "/create" });
        return true;
      }

      if (location.pathname.startsWith("/settings")) {
        navigate({ to: "/settings" });
        return true;
      }

      return false;
    },
    0, // Lowest priority - fallback navigation
  );

  return null;
}

function RootLayout() {
  const mainRef = useRef<HTMLElement>(null);
  const safeInsets = useStatusStore((state) => state.safeInsets);

  return (
    <div className="flex h-screen w-screen flex-col">
      <SkipLink targetId="main-content" />
      <SafeAreaHandler />
      <BackHandler />
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
        className="z-30 flex-shrink-0"
        style={
          {
            "--bottom-nav-height": `calc(80px + ${safeInsets.bottom})`,
          } as React.CSSProperties
        }
      >
        <BottomNav />
      </footer>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: ErrorComponent,
});
