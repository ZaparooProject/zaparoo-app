import React, { useEffect } from "react";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import toast, { Toaster, useToasterStore } from "react-hot-toast";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { usePrevious } from "@uidotdev/usehooks";
import { useTranslation } from "react-i18next";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { ErrorComponent } from "@/components/ErrorComponent.tsx";
import { routeTree } from "./routeTree.gen";
import { useStatusStore } from "./lib/store";
import { DatabaseIcon, PlayIcon } from "./lib/images";
import { ConnectionProvider } from "./components/ConnectionProvider";
import { ReconnectingIndicator } from "./components/ReconnectingIndicator";
import AppUrlListener from "./lib/deepLinks.tsx";
import { MediaFinishedToast } from "./components/MediaFinishedToast.tsx";
import { useDataCache } from "./hooks/useDataCache";
import { SlideModalProvider } from "./components/SlideModalProvider";
import { usePreferencesStore } from "./lib/preferencesStore";
import { filenameFromPath } from "./lib/path";
import { useProAccessCheck } from "./hooks/useProAccessCheck";
import { useNfcAvailabilityCheck } from "./hooks/useNfcAvailabilityCheck";
import { useCameraAvailabilityCheck } from "./hooks/useCameraAvailabilityCheck";
import { useAccelerometerAvailabilityCheck } from "./hooks/useAccelerometerAvailabilityCheck";
import { useRunQueueProcessor } from "./hooks/useRunQueueProcessor";
import { useWriteQueueProcessor } from "./hooks/useWriteQueueProcessor";
import { useShakeDetection } from "./hooks/useShakeDetection";
import { initDeviceInfo } from "./lib/logger";
import {
  A11yAnnouncerProvider,
  useAnnouncer,
} from "./components/A11yAnnouncer";

// Component to initialize queue processors after preferences hydrate
// This ensures sessionManager.launchOnScan is set correctly before processing
function QueueProcessors() {
  const shakeEnabled = usePreferencesStore((state) => state.shakeEnabled);
  const connected = useStatusStore((state) => state.connected);

  useRunQueueProcessor();
  useWriteQueueProcessor();
  useShakeDetection({
    shakeEnabled,
    connected,
  });
  return null;
}

// Component to announce all toasts for screen readers
// This ensures TalkBack/VoiceOver users hear toast notifications
function ToastAnnouncer() {
  const { announce } = useAnnouncer();
  const { toasts } = useToasterStore();
  const announcedIds = React.useRef(new Set<string>());

  useEffect(() => {
    for (const t of toasts) {
      // Only announce new, visible toasts
      if (t.visible && !announcedIds.current.has(t.id)) {
        announcedIds.current.add(t.id);

        // Extract text content from the toast message
        let message = "";
        if (typeof t.message === "string") {
          message = t.message;
        } else if (typeof t.message === "function") {
          // For function messages (like our custom toasts), we can't easily extract text
          // The toast content will need to be announced separately if needed
          // Skip announcement for complex toasts - they should handle their own a11y
          continue;
        }

        if (message) {
          announce(message);
        }
      }
    }

    // Clean up old toast IDs to prevent memory leak
    const currentIds = new Set(toasts.map((t) => t.id));
    for (const id of announcedIds.current) {
      if (!currentIds.has(id)) {
        announcedIds.current.delete(id);
      }
    }
  }, [toasts, announce]);

  return null;
}

// Component to show "now playing" toast with screen reader announcement
function NowPlayingToast() {
  const { t } = useTranslation();
  const { announce } = useAnnouncer();
  const playing = useStatusStore((state) => state.playing);
  const prevPlaying = usePrevious(playing);
  const showFilenames = usePreferencesStore((state) => state.showFilenames);

  useEffect(() => {
    // Only show toast when a new game actually starts (mediaName changes)
    if (
      playing.mediaName !== "" &&
      playing.mediaName !== prevPlaying?.mediaName
    ) {
      const displayName =
        showFilenames && playing.mediaPath
          ? filenameFromPath(playing.mediaPath) || playing.mediaName
          : playing.mediaName;

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
            <span>{displayName}</span>
          </span>
        ),
        {
          id: "playingGame-" + Date.now(),
          icon: (
            <span className="text-success pr-1">
              <PlayIcon size="24" />
            </span>
          ),
        },
      );

      // Announce for screen readers (since this uses a function message)
      announce(`${t("toast.nowPlayingHeading")}: ${displayName}`);
    }
  }, [playing, prevPlaying, t, showFilenames, announce]);

  return null;
}

// Component to show "media finished" toast with screen reader announcement
function MediaFinishedToastHandler() {
  const { t } = useTranslation();
  const { announce } = useAnnouncer();
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const prevGamesIndex = usePrevious(gamesIndex);

  useEffect(() => {
    // Only show completion toast when indexing finishes with results
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
        ),
      });

      // Announce for screen readers
      announce(
        `${t("toast.updatedDb")}. ${t("toast.filesFound", { count: gamesIndex.totalFiles })}`,
      );
    }
  }, [gamesIndex, prevGamesIndex, t, announce]);

  return null;
}

const router = createRouter({
  scrollRestoration: true,
  routeTree,
  defaultErrorComponent: ErrorComponent,
  basepath:
    Capacitor.isNativePlatform() || location.hostname === "zaparoo.app"
      ? "/"
      : "/app/",
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
    (state) => state._proAccessHydrated,
  );
  const nfcAvailabilityHydrated = usePreferencesStore(
    (state) => state._nfcAvailabilityHydrated,
  );
  const cameraAvailabilityHydrated = usePreferencesStore(
    (state) => state._cameraAvailabilityHydrated,
  );
  const accelerometerAvailabilityHydrated = usePreferencesStore(
    (state) => state._accelerometerAvailabilityHydrated,
  );
  const safeInsets = useStatusStore((state) => state.safeInsets);

  // Initialize device info and status bar
  useEffect(() => {
    initDeviceInfo();

    // Show status bar and configure style
    if (Capacitor.isNativePlatform()) {
      StatusBar.show();
      StatusBar.setStyle({ style: Style.Dark });
    }
  }, []);

  // Initialize data cache early in app lifecycle
  useDataCache();
  // Check Pro access status once at app startup
  useProAccessCheck();
  // Check hardware availability once at app startup
  useNfcAvailabilityCheck();
  useCameraAvailabilityCheck();
  useAccelerometerAvailabilityCheck();

  const setLoggedInUser = useStatusStore((state) => state.setLoggedInUser);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    FirebaseAuthentication.addListener("authStateChange", (change) => {
      setLoggedInUser(change.user);
      if (change.user) {
        FirebaseAuthentication.getIdToken().catch(() => {
          // Token refresh failed - will retry on next auth state change
        });
      }
    }).then((handle) => {
      cleanup = () => handle.remove();
    });

    return () => {
      cleanup?.();
    };
  }, [setLoggedInUser]);

  // Block rendering until preferences, Pro access, and hardware availability are hydrated to prevent layout shifts
  if (
    !hasHydrated ||
    !proAccessHydrated ||
    !nfcAvailabilityHydrated ||
    !cameraAvailabilityHydrated ||
    !accelerometerAvailabilityHydrated
  ) {
    return null; // Keep splash screen visible
  }

  return (
    <>
      <AppUrlListener />
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
            color: "var(--color-foreground)",
          },
        }}
        containerStyle={{
          top: `calc(${safeInsets.top} + 1rem)`,
          left: safeInsets.left,
          right: safeInsets.right,
        }}
      />
      <A11yAnnouncerProvider>
        <ConnectionProvider>
          <ToastAnnouncer />
          <NowPlayingToast />
          <MediaFinishedToastHandler />
          <ReconnectingIndicator />
          <div
            className="app-frame h-screen w-screen"
            style={{
              background: "var(--color-background)",
              color: "var(--color-foreground)",
            }}
          >
            <SlideModalProvider>
              <RouterProvider router={router} />
            </SlideModalProvider>
          </div>
        </ConnectionProvider>
      </A11yAnnouncerProvider>
    </>
  );
}
