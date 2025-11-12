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
import { SlideModalProvider } from "./components/SlideModalProvider";
import { usePreferencesStore } from "./lib/preferencesStore";
import { useProAccessCheck } from "./hooks/useProAccessCheck";
import { useNfcAvailabilityCheck } from "./hooks/useNfcAvailabilityCheck";
import { useRunQueueProcessor } from "./hooks/useRunQueueProcessor";
import { useWriteQueueProcessor } from "./hooks/useWriteQueueProcessor";
import { useShakeDetection } from "./hooks/useShakeDetection";

// Component to initialize queue processors after preferences hydrate
// This ensures sessionManager.launchOnScan is set correctly before processing
function QueueProcessors() {
  const shakeEnabled = usePreferencesStore((state) => state.shakeEnabled);
  const launcherAccess = usePreferencesStore((state) => state.launcherAccess);
  const connected = useStatusStore((state) => state.connected);

  useRunQueueProcessor();
  useWriteQueueProcessor();
  useShakeDetection({
    shakeEnabled,
    launcherAccess,
    connected
  });
  return null;
}

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
  // Wait for preferences to hydrate before rendering to prevent layout shifts
  const hasHydrated = usePreferencesStore((state) => state._hasHydrated);
  const proAccessHydrated = usePreferencesStore(
    (state) => state._proAccessHydrated
  );
  const nfcAvailabilityHydrated = usePreferencesStore(
    (state) => state._nfcAvailabilityHydrated
  );

  // Initialize data cache early in app lifecycle
  useDataCache();
  // Check Pro access status once at app startup
  useProAccessCheck();
  // Check NFC availability once at app startup
  useNfcAvailabilityCheck();

  const playing = useStatusStore((state) => state.playing);
  const prevPlaying = usePrevious(playing);
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
    // Skip toast if totalFiles is 0 (indicates cancellation)
    if (
      !gamesIndex.indexing &&
      prevGamesIndex?.indexing &&
      (gamesIndex.totalFiles ?? 0) > 0
    ) {
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
    // Only show toast when a new game actually starts (mediaName changes)
    // This prevents duplicate toasts for the same game and handles debouncing naturally
    if (
      playing.mediaName !== "" &&
      playing.mediaName !== prevPlaying?.mediaName
    ) {
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
          id: "playingGame-" + Date.now(),
          icon: (
            <span className="text-success pr-1">
              <PlayIcon size="24" />
            </span>
          )
        }
      );
    }
  }, [playing, prevPlaying, t]);

  // Block rendering until preferences, Pro access, and NFC availability are hydrated to prevent layout shifts
  if (!hasHydrated || !proAccessHydrated || !nfcAvailabilityHydrated) {
    return null; // Keep splash screen visible
  }

  return (
    <>
      <AppUrlListener />
      <CoreApiWebSocket key={getDeviceAddress()} />
      <QueueProcessors />
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
        <SlideModalProvider>
          <RouterProvider router={router} />
        </SlideModalProvider>
      </div>
    </>
  );
}
