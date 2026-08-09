import { describe, expect, it } from "vitest";
import { resolveSystemNameRegion, systemDisplayName } from "@/lib/systemNames";

describe("system names", () => {
  it("should use opinionated US names", () => {
    expect(systemDisplayName("Nintendo64", "N64", "us", "en-US")).toBe(
      "Nintendo 64",
    );
    expect(systemDisplayName("DOS", "DOS", "us", "en-US")).toBe("MS-DOS");
  });

  it("should apply European naming differences", () => {
    expect(systemDisplayName("Genesis", "Genesis", "eu", "en-US")).toBe(
      "Mega Drive",
    );
    expect(
      systemDisplayName("TurboGrafx16", "TurboGrafx16", "eu", "en-US"),
    ).toBe("PC Engine");
  });

  it("should apply Japanese naming differences", () => {
    expect(systemDisplayName("NES", "NES", "jp", "en-US")).toBe("Famicom");
    expect(systemDisplayName("SNES", "SNES", "jp", "en-US")).toBe(
      "Super Famicom",
    );
    expect(
      systemDisplayName("MasterSystem", "Master System", "jp", "en-US"),
    ).toBe("Mark III");
  });

  it("should preserve Core names for unknown systems", () => {
    expect(
      systemDisplayName("FutureSystem", "Future System", "jp", "ja-JP"),
    ).toBe("Future System");
    expect(systemDisplayName("FutureSystem", "", "us", "en-US")).toBe(
      "FutureSystem",
    );
  });

  it.each([
    ["en-US", "us"],
    ["en-CA", "us"],
    ["es-MX", "us"],
    ["en-GB", "eu"],
    ["en-AU", "eu"],
    ["es-ES", "eu"],
    ["ja-JP", "jp"],
  ] as const)("should resolve automatic region for %s", (locale, expected) => {
    expect(resolveSystemNameRegion("auto", locale)).toBe(expected);
  });

  it("should honor explicit regions regardless of locale", () => {
    expect(resolveSystemNameRegion("us", "ja-JP")).toBe("us");
    expect(resolveSystemNameRegion("eu", "en-US")).toBe("eu");
    expect(resolveSystemNameRegion("jp", "en-GB")).toBe("jp");
  });
});
