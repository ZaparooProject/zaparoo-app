import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { Capacitor } from "@capacitor/core";
import { server } from "@/test-setup";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { getUsageCountVersion, recordUsageCount } from "@/lib/usageCounts";
import { logger } from "@/lib/logger";

const APP_COUNTS_URL = "https://api.zaparoo.com/v1/analytics/app-counts";

interface SentCount {
  body: unknown;
  headers: Headers;
}

function captureCounts(
  respond: () => Response = () => new HttpResponse(null, { status: 204 }),
) {
  const sent: SentCount[] = [];
  server.use(
    http.post(APP_COUNTS_URL, async ({ request }) => {
      sent.push({ body: await request.json(), headers: request.headers });
      return respond();
    }),
  );
  return sent;
}

// Long enough for a request that was going to be made to have been made.
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("recordUsageCount", () => {
  beforeEach(() => {
    // Vitest runs as a dev build; counts are only sent from release builds.
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_VERSION", "2.0.2");
    vi.stubEnv("VITE_RELEASE_KEY", "");
    vi.stubEnv("VITE_PURCHASE_PREVIEW", "");
    vi.stubEnv("VITE_DISABLE_LIVE_UPDATE_SYNC", "");
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Capacitor.getPlatform).mockReturnValue("ios");
    usePreferencesStore.setState({
      shareUsageCounts: true,
      _hasHydrated: true,
      _preferencesHydrationSucceeded: true,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should send only the five contract fields and no credentials", async () => {
    const sent = captureCounts();

    recordUsageCount("pro_screen_viewed", "nfc");

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toEqual({
      client: "app",
      event: "pro_screen_viewed",
      source: "nfc",
      platform: "ios",
      app_version: "2.0.2",
    });
    expect(sent[0]!.headers.get("authorization")).toBeNull();
    expect(sent[0]!.headers.get("cookie")).toBeNull();
    expect(sent[0]!.headers.get("content-type")).toBe("application/json");
  });

  it("should report the purchase with its entry point on Android", async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue("android");
    const sent = captureCounts();

    recordUsageCount("pro_purchased", "camera");

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toEqual({
      client: "app",
      event: "pro_purchased",
      source: "camera",
      platform: "android",
      app_version: "2.0.2",
    });
  });

  it("should report the live update's version instead of the binary's", async () => {
    // 2.0.3 shipped as a live update on the 2.0.2 binary.
    vi.stubEnv("VITE_RELEASE_KEY", "live:2.0.2-ota.2");
    const sent = captureCounts();

    recordUsageCount("pro_screen_viewed", "shake");

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toMatchObject({ app_version: "2.0.3" });
  });

  it("should fall back to the package version for an unmapped release key", () => {
    vi.stubEnv("VITE_RELEASE_KEY", "live:9.9.9-ota.1");

    expect(getUsageCountVersion()).toBe("2.0.2");
  });

  it.each(["unknown", "2.0", "v2.0.2", "2.0.2-beta.1", "2.0.2+33", ""])(
    "should send nothing for the version %j",
    async (version) => {
      vi.stubEnv("VITE_VERSION", version);
      const sent = captureCounts();

      recordUsageCount("pro_screen_viewed", "nfc");
      await settle();

      expect(getUsageCountVersion()).toBeNull();
      expect(sent).toHaveLength(0);
    },
  );

  it("should send nothing when sharing is turned off", async () => {
    usePreferencesStore.setState({ shareUsageCounts: false });
    const sent = captureCounts();

    recordUsageCount("pro_screen_viewed", "settings");
    recordUsageCount("pro_purchased", "settings");
    await settle();

    expect(sent).toHaveLength(0);
  });

  it("should send nothing while the saved choice could not be read", async () => {
    usePreferencesStore.setState({ _preferencesHydrationSucceeded: false });
    const sent = captureCounts();

    recordUsageCount("pro_screen_viewed", "nfc");
    await settle();

    expect(sent).toHaveLength(0);
  });

  it("should send nothing from the web", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.mocked(Capacitor.getPlatform).mockReturnValue("web");
    const sent = captureCounts();

    recordUsageCount("pro_screen_viewed", "settings");
    await settle();

    expect(sent).toHaveLength(0);
  });

  it("should send nothing from a dev build", async () => {
    vi.stubEnv("DEV", true);
    const sent = captureCounts();

    recordUsageCount("pro_screen_viewed", "nfc");
    await settle();

    expect(sent).toHaveLength(0);
  });

  it.each([
    ["VITE_PURCHASE_PREVIEW", "true"],
    ["VITE_DISABLE_LIVE_UPDATE_SYNC", "true"],
  ])("should send nothing from a build with %s set", async (name, value) => {
    vi.stubEnv(name, value);
    const sent = captureCounts();

    recordUsageCount("pro_screen_viewed", "nfc");
    await settle();

    expect(sent).toHaveLength(0);
  });

  it.each([
    ["a rejected count", () => new HttpResponse(null, { status: 400 })],
    ["a rate limit", () => new HttpResponse(null, { status: 429 })],
    ["a network failure", () => HttpResponse.error()],
  ])("should ignore %s without retrying or reporting", async (_, respond) => {
    const sent = captureCounts(respond);
    const logged = [
      vi.spyOn(logger, "error"),
      vi.spyOn(logger, "warn"),
      vi.spyOn(logger, "log"),
    ];
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    expect(() => recordUsageCount("pro_purchased", "nfc")).not.toThrow();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    await settle();
    process.off("unhandledRejection", unhandled);

    expect(sent).toHaveLength(1);
    expect(unhandled).not.toHaveBeenCalled();
    for (const spy of logged) expect(spy).not.toHaveBeenCalled();
  });

  it("should not throw when the request cannot be started", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("fetch unavailable");
    });

    expect(() => recordUsageCount("pro_screen_viewed", "nfc")).not.toThrow();
  });
});
