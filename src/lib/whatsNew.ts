import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { LiveUpdate } from "@capawesome/capacitor-live-update";
import { isNativePluginAvailable } from "@/lib/capacitorBridge";
import { logger } from "@/lib/logger";

export type RuntimeReleaseIdentity = {
  nativeVersion: string;
  nativeBuild: string;
  liveBundleId: string | null;
  releaseKey: string;
};

export type WhatsNewAnnouncement = {
  id: string;
  releaseKeys: string[];
  title: string;
  items: string[];
};

export const WHATS_NEW_ANNOUNCEMENTS: WhatsNewAnnouncement[] = [
  {
    id: "release-1.13.0",
    releaseKeys: ["native:1.13.0+29"],
    title: "What's new in 1.13.0",
    items: [
      "Browse, search, favorite, launch, and write media from the new Library tab.",
      "Subscribe, restore, and manage Zaparoo Warp from the App.",
      "Create and manage device profiles, roles, PINs, playtime limits, and profile cards.",
      "Keep saved Core connections working through address changes and App restarts, with clearer connection status.",
      "Get more reliable NFC scanning and writing, plus smoother modals, swipe-back feedback, haptics, and app icon badges.",
    ],
  },
];

function getInjectedReleaseKey(): string | undefined {
  const releaseKey = import.meta.env.VITE_RELEASE_KEY?.trim();
  return releaseKey || undefined;
}

export async function resolveRuntimeReleaseIdentity(): Promise<RuntimeReleaseIdentity> {
  let nativeVersion = import.meta.env.VITE_VERSION || "unknown";
  let nativeBuild = "web";

  try {
    const info = await App.getInfo();
    nativeVersion = info.version || nativeVersion;
    nativeBuild = info.build || nativeBuild;
  } catch (error) {
    logger.warn("What's New: Failed to read app info", error);
  }

  let liveBundleId: string | null = null;

  if (Capacitor.isNativePlatform() && isNativePluginAvailable("LiveUpdate")) {
    try {
      const currentBundle = await LiveUpdate.getCurrentBundle();
      liveBundleId = currentBundle.bundleId;
    } catch (error) {
      logger.warn("What's New: Failed to read live update bundle", error);
    }
  }

  const injectedReleaseKey = getInjectedReleaseKey();
  const releaseKey =
    injectedReleaseKey ??
    (liveBundleId
      ? `native:${nativeVersion}+${nativeBuild}:bundle:${liveBundleId}`
      : `native:${nativeVersion}+${nativeBuild}`);

  return {
    nativeVersion,
    nativeBuild,
    liveBundleId,
    releaseKey,
  };
}

export function getWhatsNewAnnouncement(
  releaseKey: string,
): WhatsNewAnnouncement | undefined {
  const bundleSuffixIndex = releaseKey.indexOf(":bundle:");
  const announcementReleaseKey =
    releaseKey.startsWith("native:") && bundleSuffixIndex !== -1
      ? releaseKey.slice(0, bundleSuffixIndex)
      : releaseKey;

  return WHATS_NEW_ANNOUNCEMENTS.find((announcement) =>
    announcement.releaseKeys.includes(announcementReleaseKey),
  );
}
