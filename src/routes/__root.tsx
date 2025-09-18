import { createRootRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { App } from "@capacitor/app";
import { useEffect } from "react";
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
    <>
      <SafeAreaHandler />
      <BackHandler />
      <main className="main-frame h-screen w-screen">
        <Outlet />
      </main>
      <footer className="fixed bottom-0 left-0 z-30 w-lvw">
        <BottomNav />
      </footer>
    </>
  ),
  errorComponent: ErrorComponent
});
