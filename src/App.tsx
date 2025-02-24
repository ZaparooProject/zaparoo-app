import { useEffect, useState } from "react";

import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import toast, { Toaster } from "react-hot-toast";
import { Capacitor } from "@capacitor/core";
import { useStatusStore } from "./lib/store";
import { DatabaseIcon, PlayIcon } from "./lib/images";
import { usePrevious } from "@uidotdev/usehooks";
import { Button } from "./components/wui/Button";
import classNames from "classnames";
import { StatusBar, Style } from "@capacitor/status-bar";
import { useTranslation } from "react-i18next";
import { CoreApiWebSocket } from "./components/CoreApiWebSocket.tsx";
import AppUrlListener from "./lib/deepLinks.tsx";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";

const router = createRouter({
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

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      setStatusBarStyleDark();
    }
  }, []);

  useEffect(() => {
    FirebaseAuthentication.addListener("authStateChange", (change) => {
      setLoggedInUser(change.user);
      FirebaseAuthentication.getIdToken();
    });
  }, [setLoggedInUser]);

  useEffect(() => {
    if (gamesIndex.indexing && !hideGamesIndex) {
      toast.loading(
        (to) => (
          <div
            className="flex flex-grow flex-row items-center justify-between"
            onClick={() => toast.dismiss(to.id)}
          >
            <div className="flex flex-grow flex-col pr-3">
              <div className="font-semibold">{t("toast.updateDbHeading")}</div>
              <div className="text-sm">
                {gamesIndex.currentStepDisplay
                  ? gamesIndex.currentStep === gamesIndex.totalSteps
                    ? t("toast.writingDb")
                    : gamesIndex.currentStepDisplay
                  : t("toast.preparingDb")}
              </div>
              <div className="h-[10px] w-full rounded-full border border-solid border-bd-filled bg-background">
                <div
                  className={classNames(
                    "h-[8px] rounded-full border border-solid border-background bg-button-pattern",
                    {
                      hidden: gamesIndex.currentStep === 0,
                      "animate-pulse":
                        gamesIndex.currentStep === 0 ||
                        gamesIndex.currentStep === gamesIndex.totalSteps
                    }
                  )}
                  style={{
                    width:
                      gamesIndex.currentStep && gamesIndex.totalSteps
                        ? `${((gamesIndex.currentStep / gamesIndex.totalSteps) * 100).toFixed(2)}%`
                        : "100%"
                  }}
                ></div>
              </div>
            </div>
            <div>
              <Button
                label={t("toast.hideLabel")}
                variant="outline"
                onClick={() => {
                  setHideGamesIndex(true);
                  toast.dismiss(to.id);
                }}
                className="h-full w-4 text-sm"
              />
            </div>
          </div>
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
      toast.success(
        (to) => (
          <div
            className="flex flex-grow flex-col"
            onClick={() => toast.dismiss(to.id)}
          >
            <div className="font-semibold">{t("toast.updatedDb")}</div>
            <div className="text-sm">
              {t("toast.filesFound", { count: gamesIndex.totalFiles })}
            </div>
          </div>
        ),
        {
          id: "indexed",
          icon: (
            <span className="pl-1 pr-1 text-success">
              <DatabaseIcon size="24" />
            </span>
          )
        }
      );
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
          top: "calc(env(safe-area-inset-top) + 1rem)",
          left: "env(safe-area-inset-left)",
          right: "env(safe-area-inset-right)"
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
