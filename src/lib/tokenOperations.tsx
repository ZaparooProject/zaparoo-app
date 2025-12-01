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

    if (!sessionManager.launchOnScan) {
      return resolve(true);
    }

    // If not connected and can't queue commands, just store the token without launching
    if (!connected && !canQueueCommands) {
      logger.log("Offline scan - storing token without queueing launch");
      return resolve(true);
    }

    const run = async () => {
      // Only allow launch for Pro users, Zap URLs, or override
      if (launcherAccess || isZapUrl(text) || override) {
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
        return;
      } else {
        // Non-Pro users without Zap URL should see Pro purchase modal
        setProPurchaseModalOpen(true);
        return resolve(false);
      }
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
