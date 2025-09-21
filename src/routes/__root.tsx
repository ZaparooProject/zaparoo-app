import { createRootRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { App } from "@capacitor/app";
import React, { useEffect } from "react";
import { SafeAreaHandler } from "@/lib/safeArea";
import { ErrorComponent } from "@/components/ErrorComponent.tsx";
import { BottomNav } from "../components/BottomNav";

function BackHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    App.addListener("backButton", () => {
      if (location.pathname === "/") {
        App.exitApp();
        return;
      }

      if (
        location.pathname === "/create" ||
        location.pathname === "/settings"
      ) {
        navigate({ to: "/" });
        return;
      }

      if (location.pathname.startsWith("/create")) {
        navigate({ to: "/create" });
        return;
      }

      if (location.pathname.startsWith("/settings")) {
        navigate({ to: "/settings" });
        return;
      }
    });

    return () => {
      App.removeAllListeners();
    };
  }, [navigate]);

  return null;
}

export const Route = createRootRoute({
  component: () => (
    <div className="flex flex-col h-screen w-screen">
      <SafeAreaHandler />
      <BackHandler />
      <main className="flex-1 min-h-0">
        <Outlet />
      </main>
      <footer
        className="flex-shrink-0 z-30"
        style={{ '--bottom-nav-height': 'calc(80px + env(safe-area-inset-bottom, 0px))' } as React.CSSProperties}
      >
        <BottomNav />
      </footer>
    </div>
  ),
  errorComponent: ErrorComponent
});
