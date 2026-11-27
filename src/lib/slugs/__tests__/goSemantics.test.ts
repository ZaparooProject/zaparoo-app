/**
 * Go regexp and strings behavior the parity fixtures don't reach, with
 * expected values taken from Go 1.26.
 */
import { describe, expect, it } from "vitest";
import { goRegExp } from "../goRegexp";
import { fields, formatScannedInt, toLower, trimSpace } from "../goStrings";

describe("goRegExp", () => {
  it.each([
    [String.raw`(?i)^s$`, "ſ", true],
    [String.raw`(?i)^k$`, "K", true],
    [String.raw`(?i)^[a-z]+$`, "ſK", true],
    [String.raw`(?i)^[^s]$`, "ſ", false],
    [String.raw`(?i)\bs\b`, "ſ", false],
    [String.raw`^\s$`, "\v", false],
    [String.raw`^\s$`, " ", false],
    [String.raw`^a.b$`, "a\rb", true],
    [String.raw`^a.b$`, "a\nb", false],
  ])("%s on %j matches like Go", (pattern, input, want) => {
    expect(goRegExp(pattern).test(input)).toBe(want);
  });
});

describe("goStrings", () => {
  it("lowercases per rune without final sigma", () => {
    expect(toLower("ΟΔΟΣ")).toBe("οδοσ");
    expect(toLower("İSTANBUL")).toBe("istanbul");
  });

  it("trims and splits on Go's whitespace set", () => {
    expect(trimSpace("\u0085x　")).toBe("x");
    expect(trimSpace("﻿x​")).toBe("﻿x​");
    expect(fields("a b c")).toEqual(["a", "b", "c"]);
  });

  it("scans integers like fmt.Sscanf, overflow giving 0", () => {
    expect(formatScannedInt("99999999999999999999", 2)).toBe("00");
    expect(formatScannedInt("9223372036854775807", 2)).toBe(
      "9223372036854775807",
    );
    expect(formatScannedInt("007", 2)).toBe("07");
  });
});
