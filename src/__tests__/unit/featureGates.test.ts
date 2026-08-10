import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FEATURE_GATES, isCoreFeatureAvailable } from "../../lib/featureGates";

describe("isCoreFeatureAvailable", () => {
  const originalGates = { ...FEATURE_GATES };

  beforeEach(() => {
    // Inject a test gate without modifying the real registry permanently
    Object.assign(FEATURE_GATES, {
      testFeature: {
        since: "2.5.0",
        marquee: false,
        labelKey: "features.testFeature",
      },
    });
  });

  afterEach(() => {
    // Restore original registry
    Object.keys(FEATURE_GATES).forEach((k) => {
      if (!(k in originalGates))
        delete (FEATURE_GATES as Record<string, unknown>)[k];
    });
  });

  it("should return true for unknown feature id (no gate = no restriction)", () => {
    expect(isCoreFeatureAvailable("unknownId" as never, "2.0.0")).toBe(true);
  });

  it("should return false when version is null", () => {
    expect(isCoreFeatureAvailable("testFeature", null)).toBe(false);
  });

  it("should return true for dev build versions", () => {
    expect(isCoreFeatureAvailable("testFeature", "DEVELOPMENT")).toBe(true);
    expect(isCoreFeatureAvailable("testFeature", "2.5.0-dev")).toBe(true);
  });

  it("should return true when version meets requirement", () => {
    expect(isCoreFeatureAvailable("testFeature", "2.5.0")).toBe(true);
    expect(isCoreFeatureAvailable("testFeature", "2.6.0")).toBe(true);
  });

  it("should return false when version is below requirement", () => {
    expect(isCoreFeatureAvailable("testFeature", "2.4.9")).toBe(false);
    expect(isCoreFeatureAvailable("testFeature", "1.0.0")).toBe(false);
  });

  it("should gate media scrapers behind Core 2.12.0", () => {
    expect(FEATURE_GATES.mediaScrapers?.since).toBe("2.12.0");
    expect(isCoreFeatureAvailable("mediaScrapers", "2.11.9")).toBe(false);
    expect(isCoreFeatureAvailable("mediaScrapers", "2.12.0")).toBe(true);
  });

  it("should gate media orphan cleanup behind Core 2.12.0", () => {
    expect(FEATURE_GATES.mediaCleanOrphans?.since).toBe("2.12.0");
    expect(isCoreFeatureAvailable("mediaCleanOrphans", "2.11.9")).toBe(false);
    expect(isCoreFeatureAvailable("mediaCleanOrphans", "2.12.0")).toBe(true);
  });

  it("should gate media tags behind Core 2.7.0", () => {
    expect(FEATURE_GATES.mediaTags?.since).toBe("2.7.0");
    expect(isCoreFeatureAvailable("mediaTags", "2.6.2")).toBe(false);
    expect(isCoreFeatureAvailable("mediaTags", "2.7.0")).toBe(true);
  });

  it("should gate browse-all media search behind Core 2.10.0", () => {
    expect(FEATURE_GATES.mediaBrowseAllSearch?.since).toBe("2.10.0");
    expect(isCoreFeatureAvailable("mediaBrowseAllSearch", "2.9.1")).toBe(false);
    expect(isCoreFeatureAvailable("mediaBrowseAllSearch", "2.10.0")).toBe(true);
  });

  it("should gate media disambiguating tags behind Core 2.15.0", () => {
    expect(FEATURE_GATES.mediaDisambiguatingTags?.since).toBe("2.15.0");
    expect(isCoreFeatureAvailable("mediaDisambiguatingTags", "2.14.1")).toBe(
      false,
    );
    expect(isCoreFeatureAvailable("mediaDisambiguatingTags", "2.15.0")).toBe(
      true,
    );
  });

  it("should gate Library behind Core 2.15.0", () => {
    expect(FEATURE_GATES.mediaLibrary?.since).toBe("2.15.0");
    expect(isCoreFeatureAvailable("mediaLibrary", "2.14.9")).toBe(false);
    expect(isCoreFeatureAvailable("mediaLibrary", "2.15.0")).toBe(true);
  });

  it("should gate media favorites behind Core 2.15.0", () => {
    expect(FEATURE_GATES.mediaFavorites?.since).toBe("2.15.0");
    expect(isCoreFeatureAvailable("mediaFavorites", "2.14.9")).toBe(false);
    expect(isCoreFeatureAvailable("mediaFavorites", "2.15.0")).toBe(true);
  });

  it("should gate active-media ZapScript behind Core 2.9.0", () => {
    expect(FEATURE_GATES.activeMediaZapScript?.since).toBe("2.9.0");
    expect(isCoreFeatureAvailable("activeMediaZapScript", "2.8.9")).toBe(false);
    expect(isCoreFeatureAvailable("activeMediaZapScript", "2.9.0")).toBe(true);
  });

  it("should gate background media slots behind Core 2.15.0", () => {
    expect(FEATURE_GATES.backgroundMediaSlot?.since).toBe("2.15.0");
    expect(isCoreFeatureAvailable("backgroundMediaSlot", "2.14.1")).toBe(false);
    expect(isCoreFeatureAvailable("backgroundMediaSlot", "2.15.0")).toBe(true);
  });

  it("should gate device linking behind Core 2.16.0", () => {
    expect(FEATURE_GATES.deviceLinking?.since).toBe("2.16.0");
    expect(isCoreFeatureAvailable("deviceLinking", "2.15.9")).toBe(false);
    expect(isCoreFeatureAvailable("deviceLinking", "2.16.0")).toBe(true);
  });
});
