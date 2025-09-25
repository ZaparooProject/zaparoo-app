import { useEffect } from "react";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import toast, { Toaster } from "react-hot-toast";
import { Capacitor } from "@capacitor/core";
import { usePrevious } from "@uidotdev/usehooks";
import { useTranslation } from "react-i18next";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { ErrorComponent } from "@/components/ErrorComponent.tsx";
import { routeTree } from "./routeTree.gen";
import { useStatusStore } from "./lib/store";
import { DatabaseIcon, PlayIcon } from "./lib/images";
import { CoreApiWebSocket } from "./components/CoreApiWebSocket.tsx";
import AppUrlListener from "./lib/deepLinks.tsx";
import { MediaFinishedToast } from "./components/MediaFinishedToast.tsx";
import { useDataCache } from "./hooks/useDataCache";
import { getDeviceAddress } from "./lib/coreApi";

const router = createRouter({
  scrollRestoration: true,
  routeTree,
  defaultErrorComponent: ErrorComponent,
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


export default function App() {
  // Initialize data cache early in app lifecycle
  useDataCache();

  const playing = useStatusStore((state) => state.playing);
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const prevGamesIndex = usePrevious(gamesIndex);
  const setLoggedInUser = useStatusStore((state) => state.setLoggedInUser);
  const { t } = useTranslation();


  useEffect(() => {
    FirebaseAuthentication.addListener("authStateChange", (change) => {
      setLoggedInUser(change.user);
      if (change.user) {
        FirebaseAuthentication.getIdToken();
      }
    });
  }, [setLoggedInUser]);

  useEffect(() => {
    // Only show completion toast, progress is now shown in MediaDatabaseCard
    if (!gamesIndex.indexing && prevGamesIndex?.indexing) {
      toast.success((to) => <MediaFinishedToast id={to.id} />, {
        id: "indexed",
        icon: (
          <span className="text-success pr-1 pl-1">
            <DatabaseIcon size="24" />
          </span>
        )
      });
    }
  }, [gamesIndex, prevGamesIndex, t]);

  useEffect(() => {
    if (playing.mediaName !== "") {
      toast.success(
        (to) => (
          <span
            className="flex grow flex-col"
            onClick={() => toast.dismiss(to.id)}
            onKeyDown={(e) =>
              (e.key === "Enter" || e.key === " ") && toast.dismiss(to.id)
            }
            role="button"
            tabIndex={0}
          >
            <span className="font-bold">{t("toast.nowPlayingHeading")}</span>
            <span>{playing.mediaName}</span>
          </span>
        ),
        {
          id: "playingGame-" + playing.mediaName,
          icon: (
            <span className="text-success pr-1">
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
      <CoreApiWebSocket key={getDeviceAddress()} />
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
          top: "calc(env(safe-area-inset-top, 0px) + 1rem)",
          left: "env(safe-area-inset-left, 0px)",
          right: "env(safe-area-inset-right, 0px)"
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
