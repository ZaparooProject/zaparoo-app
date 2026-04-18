import { describe, it, expect } from "vitest";
import {
  isDevelopmentVersion,
  parseVersion,
  compareVersions,
  satisfies,
} from "../../lib/coreVersion";

describe("isDevelopmentVersion", () => {
  it.each([
    ["", true],
    ["DEVELOPMENT", true],
    ["2.5.0-dev", true],
    ["2.5.0-rc1", true],
    ["2.5.0-beta", true],
    ["2.5.0-alpha.1", true],
    ["notasemver", true],
    ["v2.5.0", true],
  ])("should return true for dev-like version %s", (raw, expected) => {
    expect(isDevelopmentVersion(raw)).toBe(expected);
  });

  it.each([["2.5.0"], ["1.0.0"], ["10.20.30"], ["2.5.1"]])(
    "should return false for release version %s",
    (raw) => {
      expect(isDevelopmentVersion(raw)).toBe(false);
    },
  );
});

describe("parseVersion", () => {
  it("should parse standard semver strings", () => {
    expect(parseVersion("2.5.0")).toEqual({ major: 2, minor: 5, patch: 0 });
    expect(parseVersion("1.10.3")).toEqual({ major: 1, minor: 10, patch: 3 });
  });

  it("should return null for unparseable strings", () => {
    expect(parseVersion("DEVELOPMENT")).toBeNull();
    expect(parseVersion("")).toBeNull();
    expect(parseVersion("notaversion")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("should return 0 for equal versions", () => {
    expect(compareVersions("2.5.0", "2.5.0")).toBe(0);
  });

  it("should correctly compare patch versions", () => {
    expect(compareVersions("2.5.1", "2.5.0")).toBe(1);
    expect(compareVersions("2.5.0", "2.5.1")).toBe(-1);
  });

  it("should correctly compare minor versions", () => {
    expect(compareVersions("2.10.0", "2.9.0")).toBe(1);
    expect(compareVersions("1.9.0", "1.10.0")).toBe(-1);
  });

  it("should correctly compare major versions", () => {
    expect(compareVersions("3.0.0", "2.9.9")).toBe(1);
    expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
  });

  it("should return 0 when versions cannot be parsed", () => {
    expect(compareVersions("DEVELOPMENT", "2.5.0")).toBe(0);
    expect(compareVersions("2.5.0", "bad")).toBe(0);
  });
});

describe("satisfies", () => {
  it("should return false when current version is null", () => {
    expect(satisfies(null, "2.5.0")).toBe(false);
  });

  it("should return true for dev build versions", () => {
    expect(satisfies("DEVELOPMENT", "2.5.0")).toBe(true);
    expect(satisfies("", "2.5.0")).toBe(true);
    expect(satisfies("2.5.0-dev", "99.0.0")).toBe(true);
  });

  it("should return true when current meets minimum exactly", () => {
    expect(satisfies("2.5.0", "2.5.0")).toBe(true);
  });

  it("should return true when current is above minimum", () => {
    expect(satisfies("2.5.1", "2.5.0")).toBe(true);
    expect(satisfies("2.6.0", "2.5.0")).toBe(true);
    expect(satisfies("3.0.0", "2.5.0")).toBe(true);
  });

  it("should return false when current is below minimum", () => {
    expect(satisfies("2.4.9", "2.5.0")).toBe(false);
    expect(satisfies("2.5.0", "2.5.1")).toBe(false);
    expect(satisfies("1.99.99", "2.0.0")).toBe(false);
  });
});
