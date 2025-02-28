import { createRootRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { SafeArea } from "capacitor-plugin-safe-area";
import { BottomNav } from "../components/BottomNav";
import { App } from "@capacitor/app";
import { useEffect, useState } from "react";

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

const SafeAreaPaddingTop = () => {
  const [padding, setPadding] = useState(0);
  useEffect(() => {
    (async function () {
      const safeAreaData = await SafeArea.getSafeAreaInsets();
      setPadding(safeAreaData.insets.top);
    })();
  }, []);

  return <div style={{ paddingTop: padding }} />;
};

const SafeAreaPaddingBottom = () => {
  const [padding, setPadding] = useState(0);
  useEffect(() => {
    (async function () {
      const safeAreaData = await SafeArea.getSafeAreaInsets();
      setPadding(safeAreaData.insets.bottom);
    })();
  }, []);

  return <div style={{ paddingBottom: padding }} />;
};

export const Route = createRootRoute({
  component: () => (
    <>
      <SafeAreaPaddingTop />
      <BackHandler />
      <main className="main-frame h-screen w-screen">
        <Outlet />
        <SafeAreaPaddingBottom />
      </main>
      <footer className="fixed bottom-0 left-0 z-30 w-lvw">
        <BottomNav />
      </footer>
    </>
  )
});
