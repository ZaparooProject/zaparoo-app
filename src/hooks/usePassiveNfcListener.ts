import { useEffect, useRef } from "react";
import { Capacitor, PluginListenerHandle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Nfc, NfcTagScannedEvent } from "@capawesome-team/capacitor-nfc";
import { useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { sessionManager, readNfcEvent } from "@/lib/nfc";
import { runToken } from "@/lib/tokenOperations";
import { logger } from "@/lib/logger";

/**
 * Passive NFC listener hook for Android.
 *
 * On Android, with manifest intent filters registered, NFC intents can arrive
 * even when the app isn't actively scanning. This hook listens for those events
 * and processes them appropriately:
 *
 * - If an explicit scan session is active (sessionManager.isScanning), this hook
 *   does nothing - the active scan session handler takes priority.
 * - If the app was in the background/closed when the NFC tap occurred (detected
 *   by appStateChange with isActive:false), the event is processed.
 * - If the app was in the foreground when the NFC tap occurred (no appStateChange
 *   event, just a quick pause/resume), the event is ignored.
 *
 * The key insight is that `appStateChange` with `isActive:false` only fires when
 * the app actually STOPS (goes to background), not during the quick pause/resume
 * cycle that happens when NFC is tapped while the app is in the foreground.
 *
 * This enables the Zaparoo app to appear in Android's NFC app chooser and
 * handle tags when launched from outside the app, while not interfering
 * with normal usage when the user is already in the app.
 *
 * On iOS, this hook does nothing as iOS doesn't support passive NFC listening.
 */
export function usePassiveNfcListener() {
  const nfcListenerRef = useRef<PluginListenerHandle | null>(null);
  const appStateListenerRef = useRef<PluginListenerHandle | null>(null);

  // Track if app was in background - used to detect background NFC taps
  // appStateChange with isActive:false fires when app actually stops (background)
  // It does NOT fire during the quick pause/resume from foreground NFC taps
  const wasInBackgroundRef = useRef<boolean>(false);

  // Get store values and actions
  const setLastToken = useStatusStore((state) => state.setLastToken);
  const setProPurchaseModalOpen = useStatusStore(
    (state) => state.setProPurchaseModalOpen,
  );
  const launcherAccess = usePreferencesStore((state) => state.launcherAccess);
  const nfcAvailable = usePreferencesStore((state) => state.nfcAvailable);

  useEffect(() => {
    // Only run on Android - iOS doesn't support passive NFC listening
    if (Capacitor.getPlatform() !== "android") {
      return;
    }

    // Don't set up listener if NFC isn't available
    if (!nfcAvailable) {
      return;
    }

    const handleNfcTagScanned = (event: NfcTagScannedEvent) => {
      logger.log("Passive NFC listener: event received", {
        category: "nfc",
        action: "passiveListener",
        isScanning: sessionManager.isScanning,
        wasInBackground: wasInBackgroundRef.current,
      });

      // If an explicit scan session is active, let that handler deal with it
      if (sessionManager.isScanning) {
        logger.debug("Passive NFC listener: scan session active, ignoring", {
          category: "nfc",
          action: "passiveListener",
        });
        return;
      }

      // Only process if app was in background (appStateChange fired with isActive:false)
      // If wasInBackground is false, this is a foreground tap - ignore it
      if (!wasInBackgroundRef.current) {
        logger.debug("Passive NFC listener: app was in foreground, ignoring", {
          category: "nfc",
          action: "passiveListener",
        });
        return;
      }

      // Reset the flag now that we're processing
      wasInBackgroundRef.current = false;

      logger.log("Passive NFC listener: processing tag from background", {
        category: "nfc",
        action: "passiveListener",
      });

      // Parse the tag data
      const tag = readNfcEvent(event);
      if (!tag) {
        logger.debug("Passive NFC listener: no valid tag data", {
          category: "nfc",
          action: "passiveListener",
        });
        return;
      }

      // Get current connection state
      const connected = useStatusStore.getState().connected;

      // Process the tag - this will:
      // - Update lastToken in store
      // - If connected and launchOnScan is enabled, attempt to launch
      // - Handle Pro access checks as needed
      runToken(
        tag.uid,
        tag.text,
        launcherAccess,
        connected,
        setLastToken,
        setProPurchaseModalOpen,
        false, // unsafe
        false, // override
        true, // canQueueCommands - allow queuing if reconnecting
        false, // requiresLaunch - respect launchOnScan setting
      ).catch((error) => {
        logger.error("Passive NFC listener: runToken error", error, {
          category: "nfc",
          action: "passiveListener",
        });
      });
    };

    // Register the listeners
    const setupListeners = async () => {
      try {
        // Register NFC listener FIRST - this is critical because the nfcTagScanned
        // event may fire immediately on app launch before other listeners are ready
        nfcListenerRef.current = await Nfc.addListener(
          "nfcTagScanned",
          handleNfcTagScanned,
        );

        // Listen for app state changes - this fires when app actually stops/starts
        // Unlike pause/resume, appStateChange with isActive:false only fires when
        // the app actually goes to background, NOT during the quick pause/resume
        // cycle that happens when NFC is tapped while app is in foreground
        appStateListenerRef.current = await App.addListener(
          "appStateChange",
          ({ isActive }) => {
            if (!isActive) {
              // App is going to background
              wasInBackgroundRef.current = true;
              logger.debug("Passive NFC listener: app went to background", {
                category: "nfc",
                action: "passiveListener",
              });
            } else {
              // App is coming to foreground - don't reset wasInBackground here
              // We reset it in handleNfcTagScanned after processing the tag
              logger.debug("Passive NFC listener: app came to foreground", {
                category: "nfc",
                action: "passiveListener",
                wasInBackground: wasInBackgroundRef.current,
              });
            }
          },
        );

        logger.debug("Passive NFC listener: registered", {
          category: "nfc",
          action: "passiveListener",
        });
      } catch (error) {
        logger.error("Passive NFC listener: failed to register", error, {
          category: "nfc",
          action: "passiveListener",
        });
      }
    };

    setupListeners();

    // Cleanup on unmount
    return () => {
      if (appStateListenerRef.current) {
        appStateListenerRef.current.remove();
        appStateListenerRef.current = null;
      }
      if (nfcListenerRef.current) {
        nfcListenerRef.current.remove();
        nfcListenerRef.current = null;
        logger.debug("Passive NFC listener: removed", {
          category: "nfc",
          action: "passiveListener",
        });
      }
    };
  }, [launcherAccess, nfcAvailable, setLastToken, setProPurchaseModalOpen]);
}
