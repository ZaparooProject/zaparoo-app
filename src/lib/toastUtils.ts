/**
 * Toast utilities with rate limiting to prevent spam.
 *
 * When many errors occur simultaneously (e.g., connection issues),
 * showing hundreds of toasts can crash the app. This utility
 * rate-limits error toasts to prevent UI overload.
 */

import toast from "react-hot-toast";
import { logger } from "./logger";

/** Cooldown period between error toasts (ms) */
const TOAST_COOLDOWN_MS = 2000;

/** Tracks when the last error toast was shown */
let lastErrorToastTime = 0;

/**
 * Show an error toast with rate limiting.
 *
 * If called multiple times within the cooldown period,
 * only the first call will show a toast. Subsequent calls
 * are logged but not displayed to prevent spam.
 *
 * @param message - The error message to display
 */
export function showRateLimitedErrorToast(message: string): void {
  const now = Date.now();
  if (now - lastErrorToastTime > TOAST_COOLDOWN_MS) {
    toast.error(message);
    lastErrorToastTime = now;
  } else {
    logger.warn("Toast suppressed due to rate limiting:", message);
  }
}

/**
 * Reset the toast rate limiter.
 * Useful for testing or when you want to ensure the next toast shows.
 */
export function resetToastRateLimiter(): void {
  lastErrorToastTime = 0;
}
