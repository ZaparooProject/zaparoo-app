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
    id: "release-1.11.1",
    releaseKeys: ["native:1.11.1+26", "native:1.11.1+1"],
    title: "What's new in 1.11.1",
    items: [
      "Use the new Controls modal for remote and keyboard input.",
      "View and manage existing mappings from the Mappings page.",
      "Monitor and start media scraper runs from Settings.",
      "Use encrypted sessions with supported Core versions.",
      "Reliability fixes for deep links, startup, media search, NFC, and purchases.",
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
  return WHATS_NEW_ANNOUNCEMENTS.find((announcement) =>
    announcement.releaseKeys.includes(releaseKey),
  );
}
