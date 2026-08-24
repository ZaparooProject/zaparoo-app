import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { LiveUpdate } from "@capawesome/capacitor-live-update";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getReleaseDisplayVersion,
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

  it("should find the native announcement when a live bundle is active", async () => {
    vi.mocked(App.getInfo).mockResolvedValue({
      name: "Zaparoo",
      id: "dev.wizzo.tapto",
      version: "1.13.0",
      build: "29",
    });
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Capacitor.isPluginAvailable).mockReturnValue(true);
    vi.mocked(LiveUpdate.getCurrentBundle).mockResolvedValue({
      bundleId: "bundle-2026-08-11",
    });

    const identity = await resolveRuntimeReleaseIdentity();
    const announcement = getWhatsNewAnnouncement(identity.releaseKey);

    expect(identity.releaseKey).toBe(
      "native:1.13.0+29:bundle:bundle-2026-08-11",
    );
    expect(announcement?.id).toBe("release-1.13.0");
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

  it("should find the 1.13.0 native announcement", () => {
    const announcement = getWhatsNewAnnouncement("native:1.13.0+29");

    expect(announcement?.id).toBe("release-1.13.0");
    expect(announcement?.version).toBe("1.13.0");
    expect(announcement?.items).toHaveLength(5);
  });

  it("should find the 1.13.1 announcement for the first live update", () => {
    const announcement = getWhatsNewAnnouncement("live:1.13.0-ota.1");

    expect(announcement?.id).toBe("release-1.13.1");
    expect(announcement?.version).toBe("1.13.1");
    expect(announcement?.items).toContain(
      "Still having trouble with purchases or restoring purchases? Email support@zaparoo.com or ask for help in the Zaparoo Discord.",
    );
  });

  it("should display the OTA version for an injected live release key", () => {
    expect(getReleaseDisplayVersion("live:1.13.0-ota.1", "1.13.0")).toBe(
      "1.13.1",
    );
  });

  it("should reuse the 1.13.1 announcement for the 1.13.2 sleeper OTA", () => {
    const announcement = getWhatsNewAnnouncement("live:1.13.0-ota.2");

    expect(announcement?.id).toBe("release-1.13.1");
    expect(announcement?.title).toBe("What's new in v1.13.1");
    expect(announcement?.version).toBe("1.13.2");
    expect(getReleaseDisplayVersion("live:1.13.0-ota.2", "1.13.0")).toBe(
      "1.13.2",
    );
  });

  it("should preserve the native version without a mapped release key", () => {
    expect(getReleaseDisplayVersion(undefined, "1.13.0")).toBe("1.13.0");
    expect(getReleaseDisplayVersion("live:unknown", "1.13.0")).toBe("1.13.0");
  });
});
