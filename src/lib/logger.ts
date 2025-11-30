/**
 * Logger utility that can be disabled in production builds.
 * All log/debug/warn calls are stripped in production.
 * Error calls are kept for tracking issues and reported to Rollbar.
 */

import { Capacitor } from "@capacitor/core";
import { Device } from "@capacitor/device";
import { rollbar, isRollbarEnabled } from "./rollbar";
import { useStatusStore } from "./store";

const isDev = import.meta.env.DEV;

/**
 * Rate limiting for Rollbar error reporting.
 * Prevents flooding from error cascades or render loops.
 */
const errorThrottle = new Map<string, number>();
const THROTTLE_WINDOW_MS = 60_000; // 1 minute
const MAX_ERRORS_PER_MINUTE = 10;
let errorCountThisMinute = 0;
let minuteStart = Date.now();

function shouldReportError(fingerprint: string): boolean {
  const now = Date.now();

  // Reset minute counter if window has passed
  if (now - minuteStart > THROTTLE_WINDOW_MS) {
    errorCountThisMinute = 0;
    minuteStart = now;
    errorThrottle.clear();
  }

  // Global limit per minute
  if (errorCountThisMinute >= MAX_ERRORS_PER_MINUTE) {
    return false;
  }

  // Per-error throttle - same error only reported once per window
  const lastReport = errorThrottle.get(fingerprint);
  if (lastReport && now - lastReport < THROTTLE_WINDOW_MS) {
    return false;
  }

  errorThrottle.set(fingerprint, now);
  errorCountThisMinute++;
  return true;
}

/**
 * Cached device info - populated once at startup since it doesn't change.
 * This allows buildBaseContext() to remain synchronous.
 */
let cachedDeviceInfo: {
  model: string;
  osVersion: string;
  manufacturer: string;
  isVirtual: boolean;
} | null = null;

/**
 * Initialize device info cache. Call this once at app startup.
 * Safe to call multiple times - will only fetch once.
 */
export async function initDeviceInfo(): Promise<void> {
  if (cachedDeviceInfo) return;

  try {
    const info = await Device.getInfo();
    cachedDeviceInfo = {
      model: info.model,
      osVersion: info.osVersion,
      manufacturer: info.manufacturer,
      isVirtual: info.isVirtual,
    };
  } catch (e) {
    // Silently fail - device info is nice-to-have, not critical
    if (isDev) console.warn("Failed to get device info:", e);
  }
}

/**
 * Build base context from current app state.
 * Includes platform, version, device info, and connection status.
 */
function buildBaseContext(): Record<string, unknown> {
  const state = useStatusStore.getState();

  return {
    // App info
    platform: Capacitor.getPlatform(),
    appVersion: import.meta.env.VITE_VERSION || "unknown",

    // Device info (from cache)
    deviceModel: cachedDeviceInfo?.model,
    osVersion: cachedDeviceInfo?.osVersion,
    manufacturer: cachedDeviceInfo?.manufacturer,
    isVirtual: cachedDeviceInfo?.isVirtual,

    // Connection state
    connectionState: state.connectionState,
    isConnected: state.connected,
  };
}

/** Categories for error classification in Rollbar */
export type ErrorCategory =
  | "nfc"
  | "storage"
  | "purchase"
  | "api"
  | "camera"
  | "accelerometer"
  | "queue"
  | "connection"
  | "share"
  | "lifecycle"
  | "websocket"
  | "general";

/** Severity levels for error reporting */
export type ErrorSeverity = "critical" | "error" | "warning" | "info" | "debug";

/** Metadata for enhanced error reporting */
export interface ErrorMetadata {
  category?: ErrorCategory;
  action?: string;
  severity?: ErrorSeverity;
  [key: string]: unknown;
}

/**
 * Check if an argument is error metadata (plain object with 'category' key)
 */
function isErrorMetadata(arg: unknown): arg is ErrorMetadata {
  return (
    arg !== null &&
    typeof arg === "object" &&
    !(arg instanceof Error) &&
    !Array.isArray(arg) &&
    "category" in arg
  );
}

export const logger = {
  /** Log general information (dev only) */
  log: (...args: unknown[]): void => {
    if (isDev) console.log(...args);
  },

  /** Log debug information (dev only) */
  debug: (...args: unknown[]): void => {
    if (isDev) console.debug(...args);
  },

  /** Log warnings (dev only) */
  warn: (...args: unknown[]): void => {
    if (isDev) console.warn(...args);
  },

  /**
   * Log errors (always, including production) - also reports to Rollbar.
   *
   * Supports optional metadata as the last argument:
   * @example
   * logger.error("NFC write failed", error, { category: "nfc", action: "write" });
   * logger.error(error, { category: "api", action: "launch", severity: "warning" });
   * logger.error("Something failed"); // basic usage still works
   */
  error: (...args: unknown[]): void => {
    console.error(...args);

    // Only report to Rollbar on native platforms in production
    if (!isRollbarEnabled) return;

    // Check if last argument is metadata
    const lastArg = args[args.length - 1];
    const metadata = isErrorMetadata(lastArg) ? lastArg : undefined;
    const logArgs = metadata ? args.slice(0, -1) : args;

    // Find error object in args
    const error = logArgs.find((a): a is Error => a instanceof Error);

    // Build message from non-error args
    const messageArgs = logArgs.filter((a) => !(a instanceof Error));
    const message =
      messageArgs.length > 0
        ? messageArgs
            .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
            .join(" ")
        : undefined;

    // Rate limit: create fingerprint from category + action + message
    const fingerprint = `${metadata?.category || "general"}:${metadata?.action || "unknown"}:${error?.message || message || ""}`;
    if (!shouldReportError(fingerprint)) {
      return;
    }

    // Prepare custom data for Rollbar (include base context, exclude severity)
    const customData: Record<string, unknown> = buildBaseContext();
    if (metadata) {
      // Copy all metadata except severity (which is used for method selection)
      for (const [key, value] of Object.entries(metadata)) {
        if (key !== "severity") {
          customData[key] = value;
        }
      }
    }
    if (message && error) {
      customData.message = message;
    }

    // Use error if available, otherwise create one from message
    const errorToReport = error || new Error(message || "Unknown error");

    // Report with appropriate severity (always include customData with base context)
    const severity = metadata?.severity || "error";
    switch (severity) {
      case "critical":
        rollbar.critical(errorToReport, customData);
        break;
      case "warning":
        rollbar.warning(errorToReport, customData);
        break;
      case "info":
        rollbar.info(errorToReport, customData);
        break;
      case "debug":
        rollbar.debug(errorToReport, customData);
        break;
      default:
        rollbar.error(errorToReport, customData);
    }
  },
};
