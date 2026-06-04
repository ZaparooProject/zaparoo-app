import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { LiveUpdate } from "@capawesome/capacitor-live-update";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getWhatsNewAnnouncement,
  resolveRuntimeReleaseIdentity,
} from "@/lib/whatsNew";
import { buildRuntimeReleaseIdentity } from "@/test-utils/factories";

describe("whatsNew", () => {
  beforeEach(() => {
    vi.mocked(App.getInfo).mockResolvedValue({
      name: "Zaparoo",
      id: "dev.wizzo.tapto",
      version: "1.2.3",
      build: "42",
    });
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.mocked(Capacitor.isPluginAvailable).mockReturnValue(false);
    vi.mocked(LiveUpdate.getCurrentBundle).mockResolvedValue({
      bundleId: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should resolve native identity when no live bundle is active", async () => {
    const identity = await resolveRuntimeReleaseIdentity();

    expect(identity).toEqual(
      buildRuntimeReleaseIdentity({
        nativeVersion: "1.2.3",
        nativeBuild: "42",
        liveBundleId: null,
        releaseKey: "native:1.2.3+42",
      }),
    );
  });

  it("should include the current live bundle in the fallback release key", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Capacitor.isPluginAvailable).mockReturnValue(true);
    vi.mocked(LiveUpdate.getCurrentBundle).mockResolvedValue({
      bundleId: "bundle-2026-06-04",
    });

    const identity = await resolveRuntimeReleaseIdentity();

    expect(identity).toEqual(
      buildRuntimeReleaseIdentity({
        nativeVersion: "1.2.3",
        nativeBuild: "42",
        liveBundleId: "bundle-2026-06-04",
        releaseKey: "native:1.2.3+42:bundle:bundle-2026-06-04",
      }),
    );
  });

  it("should prefer the injected release key", async () => {
    vi.stubEnv("VITE_RELEASE_KEY", "live:1.2.3-ota.1");
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Capacitor.isPluginAvailable).mockReturnValue(true);
    vi.mocked(LiveUpdate.getCurrentBundle).mockResolvedValue({
      bundleId: "bundle-2026-06-04",
    });

    const identity = await resolveRuntimeReleaseIdentity();

    expect(identity.releaseKey).toBe("live:1.2.3-ota.1");
    expect(identity.liveBundleId).toBe("bundle-2026-06-04");
  });

  it("should find the first 1.11.1 announcement", () => {
    const announcement = getWhatsNewAnnouncement("native:1.11.1+26");

    expect(announcement?.id).toBe("release-1.11.1");
    expect(announcement?.items).toHaveLength(5);
  });
});
