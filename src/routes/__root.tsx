import { createRootRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { App } from "@capacitor/app";
import React from "react";
import { SafeAreaHandler } from "@/lib/safeArea";
import { ErrorComponent } from "@/components/ErrorComponent.tsx";
import { BottomNav } from "../components/BottomNav";
import { TourInitializer } from "../components/TourInitializer";
import { useBackButtonHandler } from "../hooks/useBackButtonHandler";

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

export const Route = createRootRoute({
  component: () => (
    <div className="flex h-screen w-screen flex-col">
      <SafeAreaHandler />
      <BackHandler />
      <TourInitializer />
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
      <footer
        className="z-30 flex-shrink-0"
        style={
          {
            "--bottom-nav-height":
              "calc(80px + env(safe-area-inset-bottom, 0px))",
          } as React.CSSProperties
        }
      >
        <BottomNav />
      </footer>
    </div>
  ),
  errorComponent: ErrorComponent,
});
