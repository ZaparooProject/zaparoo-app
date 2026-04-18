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
});
