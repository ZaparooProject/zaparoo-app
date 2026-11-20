import { Capacitor } from "@capacitor/core";
import { usePreferencesStore } from "@/lib/preferencesStore";
import type { ProPurchaseSource } from "@/lib/store";
import { getReleaseDisplayVersion } from "@/lib/whatsNew";

/**
 * Anonymous usage counts: each call adds 1 to a daily total on Zaparoo
 * Online. See docs/usage-counts.md for the events and their fields.
 *
 * The request carries no account, device, installation or RevenueCat
 * identifier and no Authorization header. Keep it that way: do not route it
 * through the signed-in Online client or add a field that could tell two
 * installs apart.
 */

const APP_COUNTS_URL = "https://api.zaparoo.com/v1/analytics/app-counts";

// The API accepts a plain MAJOR.MINOR.PATCH version and nothing else.
const RELEASE_VERSION_PATTERN = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

export type UsageCountEvent = "pro_screen_viewed" | "pro_purchased";

type UsageCountPlatform = "ios" | "android";

function getUsageCountPlatform(): UsageCountPlatform | null {
  if (!Capacitor.isNativePlatform()) return null;
  const platform = Capacitor.getPlatform();
  return platform === "ios" || platform === "android" ? platform : null;
}

/**
 * The release the running JavaScript belongs to, which after a live update is
 * newer than the native binary. A live bundle maps its release key to the
 * version it ships as; a store build has no mapping and runs the JavaScript
 * built from its own package version. This is the version Settings shows.
 */
export function getUsageCountVersion(): string | null {
  const version = getReleaseDisplayVersion(
    import.meta.env.VITE_RELEASE_KEY?.trim() || undefined,
    import.meta.env.VITE_VERSION,
  );
  return RELEASE_VERSION_PATTERN.test(version) ? version : null;
}

// Dev server, purchase preview and local device test builds are not usage.
function isCountedBuild(): boolean {
  return (
    !import.meta.env.DEV &&
    import.meta.env.VITE_PURCHASE_PREVIEW !== "true" &&
    import.meta.env.VITE_DISABLE_LIVE_UPDATE_SYNC !== "true"
  );
}

/**
 * Send one count. Best effort: it never throws, never waits, never retries
 * and reports no failure to the user or to error reporting.
 */
export function recordUsageCount(
  event: UsageCountEvent,
  source: ProPurchaseSource,
): void {
  try {
    if (!isCountedBuild()) return;

    const platform = getUsageCountPlatform();
    if (!platform) return;

    // A session that could not read its saved settings runs on defaults,
    // and the default must not stand in for a saved "off".
    const preferences = usePreferencesStore.getState();
    if (
      !preferences._preferencesHydrationSucceeded ||
      !preferences.shareUsageCounts
    ) {
      return;
    }

    const appVersion = getUsageCountVersion();
    if (!appVersion) return;

    void fetch(APP_COUNTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({
        client: "app",
        event,
        source,
        platform,
        app_version: appVersion,
      }),
    }).catch(() => undefined);
  } catch {
    // Counting must never affect the screen or the purchase.
  }
}
