import React, { useEffect } from "react";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import toast, { Toaster, useToasterStore } from "react-hot-toast";
import { StatusBar, Style } from "@capacitor/status-bar";
import { usePrevious } from "@uidotdev/usehooks";
import { useTranslation } from "react-i18next";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { ErrorComponent } from "@/components/ErrorComponent.tsx";
import { InboxModal } from "@/components/InboxModal";
import { PAGE_SCROLL_RESTORATION_SELECTOR } from "@/components/PageFrame";
import { StagedTokenModal } from "@/components/home/StagedTokenModal";
import { useAppReviewPrompt } from "@/hooks/useAppReviewPrompt";
import {
  isNativePluginAvailable,
  isPluginAvailable,
} from "@/lib/capacitorBridge";
import { useDeepLinks } from "@/lib/deepLinks";
import {
  ensurePurchasesUser,
  getPurchaseAccess,
  resetPurchasesUser,
} from "@/lib/purchasesSetup";
import { routeTree } from "./routeTree.gen";
import { useStatusStore } from "./lib/store";
import { DatabaseIcon, PlayIcon } from "./lib/images";
import { ConnectionProvider } from "./components/ConnectionProvider";
import { ReconnectingIndicator } from "./components/ReconnectingIndicator";
import { MediaFinishedToast } from "./components/MediaFinishedToast.tsx";
import { SlideModalProvider } from "./components/SlideModalProvider";
import { RequirementsModal } from "./components/RequirementsModal";
import { usePreferencesStore } from "./lib/preferencesStore";
import { filenameFromPath } from "./lib/path";
import { useProAccessCheck } from "./hooks/useProAccessCheck";
import { useNfcAvailabilityCheck } from "./hooks/useNfcAvailabilityCheck";
import { useCameraAvailabilityCheck } from "./hooks/useCameraAvailabilityCheck";
import { useAccelerometerAvailabilityCheck } from "./hooks/useAccelerometerAvailabilityCheck";
import { useRunQueueProcessor } from "./hooks/useRunQueueProcessor";
import { useWriteQueueProcessor } from "./hooks/useWriteQueueProcessor";
import { WriteModal } from "./components/WriteModal";
import { DeepLinkConfirmModal } from "./components/DeepLinkConfirmModal";
import { usePassiveNfcListener } from "./hooks/usePassiveNfcListener";
import { useLiveUpdate } from "./hooks/useLiveUpdate";
import { WhatsNewInitializer } from "./components/WhatsNewInitializer";
import { initDeviceInfo, logger } from "./lib/logger";
import { getSubscriptionStatus } from "./lib/onlineApi";
import {
  A11yAnnouncerProvider,
  useAnnouncer,
} from "./components/A11yAnnouncer";

const SUBSCRIPTION_STATUS_RETRY_DELAY_MS = 500;

function waitForSubscriptionRetry(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      resolve,
      SUBSCRIPTION_STATUS_RETRY_DELAY_MS,
    );
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

async function getSubscriptionStatusWithRetry(
  signal: AbortSignal,
): Promise<Awaited<ReturnType<typeof getSubscriptionStatus>>> {
  try {
    return await getSubscriptionStatus(signal);
  } catch (error) {
    if (signal.aborted) throw error;
    await waitForSubscriptionRetry(signal);
    return getSubscriptionStatus(signal);
  }
}

// Component to initialize queue processors and passive listeners after preferences hydrate
// This ensures sessionManager.launchOnScan is set correctly before processing.
// It also renders the UI for queue-driven flows: the write modal (bound to the
// same writer instance that performs queued writes, on every route) and the
// deep-link launch confirmation.
function QueueProcessors() {
  const { pendingConfirm, confirmRun, cancelConfirm } = useRunQueueProcessor();
  const { nfcWriter } = useWriteQueueProcessor();
  // Listen for NFC intents on Android even when not in explicit scan mode
  usePassiveNfcListener();

  const writeOpen = useStatusStore((state) => state.writeOpen);
  const setWriteOpen = useStatusStore((state) => state.setWriteOpen);

  // The queue processor leaves the modal open on verification failure so the
  // retry UI shows; once a retry succeeds (or is cancelled) close it here.
  useEffect(() => {
    if (
      writeOpen &&
      nfcWriter.status !== null &&
      nfcWriter.verifyError === null
    ) {
      setWriteOpen(false);
    }
  }, [writeOpen, nfcWriter.status, nfcWriter.verifyError, setWriteOpen]);

  const closeWriteModal = async () => {
    try {
      await nfcWriter.end();
    } catch (err) {
      logger.error("Failed to end NFC writer session", err, {
        category: "nfc",
        action: "closeWriteModal",
        severity: "error",
      });
    } finally {
      setWriteOpen(false);
    }
  };

  return (
    <>
      <WriteModal
        isOpen={writeOpen}
        close={closeWriteModal}
        verifyError={nfcWriter.verifyError !== null}
        retry={() => void nfcWriter.retry()}
      />
      <DeepLinkConfirmModal
        item={pendingConfirm}
        onConfirm={confirmRun}
        onCancel={cancelConfirm}
      />
    </>
  );
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
  scrollToTopSelectors: [PAGE_SCROLL_RESTORATION_SELECTOR],
  routeTree,
  defaultErrorComponent: ErrorComponent,
  basepath: __APP_BASE_PATH__,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  useDeepLinks();

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
    if (isNativePluginAvailable("StatusBar")) {
      Promise.all([
        StatusBar.show(),
        StatusBar.setStyle({ style: Style.Dark }),
      ]).catch((e) => {
        logger.warn("StatusBar setup failed:", e);
      });
    }
  }, []);

  // Check Pro access status once at app startup
  useProAccessCheck();
  // Check hardware availability once at app startup
  useNfcAvailabilityCheck();
  useCameraAvailabilityCheck();
  useAccelerometerAvailabilityCheck();
  useAppReviewPrompt();
  // Initialize live updates - must be called after app renders successfully
  useLiveUpdate();

  const setLoggedInUser = useStatusStore((state) => state.setLoggedInUser);
  const setLifetimeProAccess = usePreferencesStore(
    (state) => state.setLifetimeProAccess,
  );
  const beginOnlinePremiumAccessCheck = usePreferencesStore(
    (state) => state.beginOnlinePremiumAccessCheck,
  );
  const setOnlinePremiumAccess = usePreferencesStore(
    (state) => state.setOnlinePremiumAccess,
  );
  const clearOnlinePremiumAccess = usePreferencesStore(
    (state) => state.clearOnlinePremiumAccess,
  );

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let active = true;
    let authChangeGeneration = 0;
    let subscriptionController: AbortController | null = null;

    if (!isPluginAvailable("FirebaseAuthentication")) {
      return undefined;
    }

    FirebaseAuthentication.addListener("authStateChange", async (change) => {
      if (!active) return;
      const generation = ++authChangeGeneration;
      subscriptionController?.abort();
      subscriptionController = null;

      const previousUser = useStatusStore.getState().loggedInUser;
      const identityChanged = previousUser?.uid !== change.user?.uid;

      if (identityChanged) setLifetimeProAccess(false);
      if (!change.user) {
        clearOnlinePremiumAccess();
      } else if (identityChanged) {
        beginOnlinePremiumAccessCheck();
      }

      // Refresh user data and token to get latest claims (e.g., email_verified)
      // This must happen before any API calls that depend on token claims
      if (change.user) {
        try {
          await FirebaseAuthentication.reload();
          await FirebaseAuthentication.getIdToken({ forceRefresh: true });
        } catch (e) {
          // Token refresh failed - continue with possibly stale token
          logger.debug("Token refresh on auth state change failed:", e);
        }
      }

      if (!active || generation !== authChangeGeneration) return;
      setLoggedInUser(change.user);

      // Sync RevenueCat identity with Firebase user (skip on web or missing bridge).
      if (isNativePluginAvailable("Purchases")) {
        try {
          if (change.user) {
            const appUserID = change.user.uid;
            const customerInfo = await ensurePurchasesUser(appUserID);
            if (
              !active ||
              generation !== authChangeGeneration ||
              useStatusStore.getState().loggedInUser?.uid !== appUserID
            ) {
              return;
            }
            setLifetimeProAccess(getPurchaseAccess(customerInfo).lifetimePro);
          } else {
            const customerInfo = await resetPurchasesUser();
            if (!active || generation !== authChangeGeneration) return;
            setLifetimeProAccess(getPurchaseAccess(customerInfo).lifetimePro);
          }
        } catch (e) {
          logger.error("RevenueCat login sync failed:", e, {
            category: "purchase",
            action: change.user ? "logIn" : "logOut",
            severity: "warning",
          });
        }
      }

      if (change.user) {
        const appUserID = change.user.uid;
        const controller = new AbortController();
        subscriptionController = controller;
        try {
          const { is_premium } = await getSubscriptionStatusWithRetry(
            controller.signal,
          );
          if (
            !active ||
            generation !== authChangeGeneration ||
            useStatusStore.getState().loggedInUser?.uid !== appUserID
          ) {
            return;
          }
          setOnlinePremiumAccess(is_premium);
        } catch (e) {
          if (controller.signal.aborted) return;
          if (
            !active ||
            generation !== authChangeGeneration ||
            useStatusStore.getState().loggedInUser?.uid !== appUserID
          ) {
            return;
          }
          setOnlinePremiumAccess(false);
          logger.error("Failed to check subscription status:", e, {
            category: "api",
            action: "getSubscription",
            severity: "warning",
          });
        } finally {
          if (subscriptionController === controller) {
            subscriptionController = null;
          }
        }
      }
    })
      .then((handle) => {
        if (!active) {
          void handle.remove();
          return;
        }
        cleanup = () => {
          void handle.remove();
        };
      })
      .catch((e) => {
        logger.warn("Firebase auth listener setup failed:", e);
      });

    return () => {
      active = false;
      authChangeGeneration += 1;
      subscriptionController?.abort();
      cleanup?.();
    };
  }, [
    beginOnlinePremiumAccessCheck,
    clearOnlinePremiumAccess,
    setLifetimeProAccess,
    setLoggedInUser,
    setOnlinePremiumAccess,
  ]);

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
        <SlideModalProvider>
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
              <RouterProvider router={router} />
            </div>
            <RequirementsModal />
            <InboxModal />
            <StagedTokenModal />
            {/* Must live inside A11yAnnouncerProvider and SlideModalProvider:
                its WriteModal uses useAnnouncer and its confirm modal renders
                a SlideModal */}
            <QueueProcessors />
            <WhatsNewInitializer />
          </ConnectionProvider>
        </SlideModalProvider>
      </A11yAnnouncerProvider>
    </>
  );
}
