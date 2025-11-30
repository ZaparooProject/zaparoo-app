import toast from "react-hot-toast";
import { CoreAPI } from "./coreApi";
import { TokenResponse } from "./models";
import { sessionManager } from "./nfc";
import { logger } from "./logger";

const zapUrls = [
  "https://zpr.au",
  "https://zaparoo.link",
  "https://go.tapto.life"
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
  override = false
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
      data: ""
    };
    setLastToken(token);

    if (!sessionManager.launchOnScan) {
      return resolve(true);
    }

    const run = async () => {
      // Only allow launch for Pro users, Zap URLs, or override
      if (launcherAccess || isZapUrl(text) || override) {
        CoreAPI.run({
          uid: uid,
          text: text,
          unsafe: unsafe
        })
          .then(() => {
            resolve(true);
          })
          .catch((e) => {
            toast.error((to) => (
              <span
                className="flex grow flex-col"
                onClick={() => toast.dismiss(to.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toast.dismiss(to.id)}
                role="button"
                tabIndex={0}
              >
                {e.message}
              </span>
            ));
            logger.error("launch error", e, {
              category: "api",
              action: "runToken",
              hasUid: !!uid,
              textPrefix: text.slice(0, 20)
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
      setTimeout(() => {
        run();
      }, 500);
    } else {
      run();
    }
  });
};
