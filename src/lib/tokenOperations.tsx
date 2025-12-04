import toast from "react-hot-toast";
import { CoreAPI } from "./coreApi";
import { TokenResponse } from "./models";
import { sessionManager } from "./nfc";
import { logger } from "./logger";

const zapUrls = [
  "https://zpr.au",
  "https://zaparoo.link",
  "https://go.tapto.life",
];

const isZapUrl = (url: string) => {
  return zapUrls.some((zapUrl) => url.toLowerCase().startsWith(zapUrl));
};

export const runToken = async (
  uid: string,
  text: string,
  launcherAccess: boolean,
  connected: boolean,
  setLastToken: (token: TokenResponse) => void,
  setProPurchaseModalOpen: (open: boolean) => void,
  unsafe = false,
  override = false,
  /**
   * Whether to queue launch commands when disconnected.
   * - true: Queue commands to run when reconnected (reconnecting scenario)
   * - false: Don't queue, just store token locally (proper offline scenario)
   */
  canQueueCommands = true,
  /**
   * Whether this action requires launching (no read-only fallback).
   * - true: Always check Pro access, show modal if needed (e.g., shake to launch)
   * - false: Respect launchOnScan setting, can be used as read-only (e.g., NFC/camera scan)
   */
  requiresLaunch = false,
): Promise<boolean> => {
  return new Promise((resolve) => {
    if (uid === "" && text === "") {
      return resolve(false);
    }

    const token = {
      uid: uid,
      text: text,
      scanTime: new Date().toISOString(),
      type: "",
      data: "",
    };
    setLastToken(token);

    // For actions that require launching (like shake), always check Pro first
    if (requiresLaunch) {
      if (!launcherAccess && !isZapUrl(text) && !override) {
        setProPurchaseModalOpen(true);
        return resolve(false);
      }
      // requiresLaunch actions skip the launchOnScan check - they always want to launch
    } else {
      // For NFC/camera scans: check launchOnScan first (can be read-only)
      if (!sessionManager.launchOnScan) {
        return resolve(true);
      }
      // launchOnScan is ON, so check Pro access
      if (!launcherAccess && !isZapUrl(text) && !override) {
        setProPurchaseModalOpen(true);
        return resolve(false);
      }
    }

    // If not connected and can't queue commands, just store the token without launching
    if (!connected && !canQueueCommands) {
      logger.log("Offline scan - storing token without queueing launch");
      return resolve(true);
    }

    const run = async () => {
      CoreAPI.run({
        uid: uid,
        text: text,
        unsafe: unsafe,
      })
        .then(() => {
          resolve(true);
        })
        .catch((e) => {
          toast.error(e.message);
          logger.error("launch error", e, {
            category: "api",
            action: "runToken",
            hasUid: !!uid,
            textPrefix: text.slice(0, 20),
          });
          resolve(false);
        });
    };

    if (!connected) {
      // Small delay when reconnecting to let connection stabilize
      setTimeout(() => {
        run();
      }, 500);
    } else {
      run();
    }
  });
};
