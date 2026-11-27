import toast from "react-hot-toast";
import i18n from "@/i18n";
import {
  CoreAPI,
  getRunErrorCategory,
  isRequestCancelledError,
  logRunFailure,
} from "./coreApi";
import { TokenResponse } from "./models";
import { sessionManager } from "./nfc";
import { logger } from "./logger";
import {
  launchFeedback,
  type LaunchError,
  type LaunchSource,
} from "./launchFeedback";
import { runLocally } from "./localPlayback/route";

export interface RunTokenOptions {
  /** Token type for toy tags, e.g. "Amiibo". Sent to Core with `data`. */
  type?: string;
  /** Lowercase hex of the tag memory Core matches mappings against. */
  data?: string;
  /** Where the launch came from, for launch feedback. */
  source?: LaunchSource;
  /** Show a failure on the caller's own surface instead of a toast. */
  onError?: (error: LaunchError) => void;
}

export function toLaunchError(e: unknown): LaunchError {
  if (isRequestCancelledError(e)) {
    return {
      message: i18n.t("deepLinks.notDelivered"),
      category: null,
      cancelled: true,
    };
  }
  return {
    message: e instanceof Error ? e.message : String(e),
    category: getRunErrorCategory(e),
    cancelled: false,
  };
}

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
  options: RunTokenOptions = {},
): Promise<boolean> => {
  const { type = "", data = "", source = "nfc", onError } = options;
  return new Promise((resolve) => {
    if (uid === "" && text === "" && data === "") {
      return resolve(false);
    }

    const token = {
      uid: uid,
      text: text,
      scanTime: new Date().toISOString(),
      type,
      data,
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

    void runLocally(text, { source, onError }).then(
      ({ result, error }) => {
        if (result === "device") {
          sendToDevice();
          return;
        }
        if (error && !onError) toast.error(error.message);
        resolve(result);
      },
      (e: unknown) => {
        logger.warn("local routing failed, sending to device", e);
        sendToDevice();
      },
    );

    function sendToDevice() {
      // If not connected and can't queue commands, just store the token without launching
      if (!connected && !canQueueCommands) {
        logger.log("Offline scan - storing token without queueing launch");
        return resolve(true);
      }

      // When disconnected (and queueing allowed), CoreAPI queues the request
      // and flushes it on reconnect with its own expiry - no extra delay needed.
      const launchId = launchFeedback.begin(source);
      CoreAPI.run({
        uid: uid,
        text: text,
        unsafe: unsafe,
        ...(type ? { type } : {}),
        ...(data ? { data } : {}),
      })
        .then(() => {
          launchFeedback.resolved(launchId);
          resolve(true);
        })
        .catch((e) => {
          // A cancelled request never reached the device; its message says so
          // instead of showing internal error text.
          const launchError = toLaunchError(e);
          launchFeedback.failed(launchId, launchError);
          if (launchError.cancelled) {
            logger.warn("launch request cancelled", e, {
              category: "api",
              action: "runToken",
            });
          } else {
            logRunFailure("launch error", e, {
              action: "runToken",
              hasUid: !!uid,
              textPrefix: text.slice(0, 20),
            });
          }
          if (onError) {
            onError(launchError);
          } else {
            toast.error(launchError.message);
          }
          resolve(false);
        });
    }
  });
};

export type MappingPrefillType = "id" | "value" | "data";

export interface MappingPrefill {
  type: MappingPrefillType;
  pattern: string;
}

/**
 * When a scan failed because the token has nothing for Core to run, return
 * the mapping that would set it up, for the "Map it" action. Tags with no text
 * map by toy data when it was read, otherwise by UID. Camera codes map by
 * their value, which also covers product barcodes Core can't resolve.
 */
export function mappingPrefillFor(
  error: LaunchError,
  token: { uid: string; text: string; data?: string },
  source: LaunchSource,
): MappingPrefill | null {
  if (error.cancelled) return null;
  if (source === "camera") {
    if (
      token.text !== "" &&
      (error.category === "invalid_script" ||
        error.category === "media_not_found")
    ) {
      return { type: "value", pattern: token.text };
    }
    return null;
  }
  if (error.category !== "invalid_script" || token.text.trim() !== "") {
    return null;
  }
  if (token.data) return { type: "data", pattern: token.data };
  if (token.uid) return { type: "id", pattern: token.uid };
  return null;
}
