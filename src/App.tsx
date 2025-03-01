import { useEffect, useState } from "react";

import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import toast, { Toaster } from "react-hot-toast";
import { Capacitor } from "@capacitor/core";
import { useStatusStore } from "./lib/store";
import { DatabaseIcon, PlayIcon } from "./lib/images";
import { usePrevious } from "@uidotdev/usehooks";
import { StatusBar, Style } from "@capacitor/status-bar";
import { useTranslation } from "react-i18next";
import { CoreApiWebSocket } from "./components/CoreApiWebSocket.tsx";
import AppUrlListener from "./lib/deepLinks.tsx";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { initSafeAreaInsets } from "./lib/safeArea.ts";
import { MediaIndexingToast } from "./components/MediaIndexingToast.tsx";
import { MediaFinishedToast } from "./components/MediaFinishedToast.tsx";

const router = createRouter({
  scrollRestoration: true,
  routeTree,
  basepath:
    Capacitor.isNativePlatform() || location.hostname === "zaparoo.app"
      ? "/"
      : "/app/"
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const setStatusBarStyleDark = async () => {
  await StatusBar.setStyle({ style: Style.Dark });
  await StatusBar.show();
};

export default function App() {
  const playing = useStatusStore((state) => state.playing);
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const prevGamesIndex = usePrevious(gamesIndex);
  const [hideGamesIndex, setHideGamesIndex] = useState(false);
  const setLoggedInUser = useStatusStore((state) => state.setLoggedInUser);
  const { t } = useTranslation();
  const safeInsets = useStatusStore((state) => state.safeInsets);
  const setSafeInsets = useStatusStore((state) => state.setSafeInsets);

  useEffect(() => {
    initSafeAreaInsets(setSafeInsets, true);
    if (Capacitor.isNativePlatform()) {
      setStatusBarStyleDark();
    }
  }, []);

  useEffect(() => {
    FirebaseAuthentication.addListener("authStateChange", (change) => {
      setLoggedInUser(change.user);
      if (change.user) {
        FirebaseAuthentication.getIdToken();
      }
    });
  }, [setLoggedInUser]);

  useEffect(() => {
    if (gamesIndex.indexing && !hideGamesIndex) {
      toast.loading(
        (to) => (
          <MediaIndexingToast id={to.id} setHideToast={setHideGamesIndex} />
        ),
        {
          id: "indexing",
          icon: (
            <span className="pl-1 pr-1 text-primary">
              <DatabaseIcon size="24" />
            </span>
          )
        }
      );
    }

    if (!gamesIndex.indexing && prevGamesIndex?.indexing) {
      toast.dismiss("indexing");
      setHideGamesIndex(false);
      toast.success((to) => <MediaFinishedToast id={to.id} />, {
        id: "indexed",
        icon: (
          <span className="pl-1 pr-1 text-success">
            <DatabaseIcon size="24" />
          </span>
        )
      });
    }
  }, [gamesIndex, prevGamesIndex, hideGamesIndex, t]);

  useEffect(() => {
    if (playing.mediaName !== "") {
      toast.success(
        (to) => (
          <span
            className="flex flex-grow flex-col"
            onClick={() => toast.dismiss(to.id)}
          >
            <span className="font-bold">{t("toast.nowPlayingHeading")}</span>
            <span>{playing.mediaName}</span>
          </span>
        ),
        {
          id: "playingGame-" + playing.mediaName,
          icon: (
            <span className="pr-1 text-success">
              <PlayIcon size="24" />
            </span>
          )
        }
      );
    }
  }, [playing, t]);

  return (
    <>
      <AppUrlListener />
      <CoreApiWebSocket />
      <Toaster
        position="top-center"
        toastOptions={{
          className: "backdrop-blur",
          style: {
            background: "rgba(17, 25, 40, 0.7)",
            mixBlendMode: "normal",
            border: "1px solid rgba(255, 255, 255, 0.13)",
            boxShadow: "0px 4px 9px rgba(0, 0, 0, 0.25)",
            backdropFilter: "blur(8px)",
            borderRadius: "12px",
            width: "calc(100% - 2rem)",
            color: "var(--color-foreground)"
          }
        }}
        containerStyle={{
          top: `calc(${safeInsets.top} + 1rem)`,
          left: safeInsets.left,
          right: safeInsets.right
        }}
      />
      <div
        className="app-frame h-screen w-screen"
        style={{
          background: "var(--color-background)",
          color: "var(--color-foreground)"
        }}
      >
        <RouterProvider router={router} />
      </div>
    </>
  );
}
