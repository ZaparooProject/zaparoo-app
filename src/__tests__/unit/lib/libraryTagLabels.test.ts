import { describe, expect, it } from "vitest";
import { libraryTagDisplayLabel } from "@/lib/libraryTagLabels";
import { validateLibraryMetadataSearch } from "@/lib/libraryMetadataSearch";

const t = (key: string, options?: { value: string }) =>
  options ? `${key}:${options.value}` : key;

describe("expanded Library tag labels", () => {
  it.each([
    ["region", "us", "library.tagValues.region.us"],
    ["region", "Europe", "library.tagValues.region.eu"],
    ["region", "world", "library.tagValues.region.world"],
    ["lang", "EN", "library.tagValues.lang.en"],
    ["lang", "jpn", "library.tagValues.lang.ja"],
    ["lang", "en-GB", "library.tagValues.lang.en-GB"],
    ["edition", "directors-cut", "library.tagValues.edition.directorsCut"],
    ["edition", "special", "library.tagValues.edition.special"],
    ["rev", "rev-12", "library.revisionValue:12"],
  ])(
    "formats known %s:%s without changing raw values",
    (type, tag, expected) => {
      const input = { type, tag };
      expect(libraryTagDisplayLabel(input, t)).toBe(expected);
      expect(input).toEqual({ type, tag });
    },
  );
  it.each(["constructor", "__proto__", "prototype"])(
    "does not resolve inherited keys as labels: %s",
    (value) => {
      expect(libraryTagDisplayLabel({ type: "lang", tag: value }, t)).toBe(
        value,
      );
    },
  );
  it("keeps authoritative Core labels and unknown values", () => {
    expect(
      libraryTagDisplayLabel(
        { type: "region", tag: "us", label: "North America" },
        t,
      ),
    ).toBe("North America");
    expect(
      libraryTagDisplayLabel({ type: "region", tag: "future-region" }, t),
    ).toBe("future-region");
    expect(
      libraryTagDisplayLabel(
        { type: "developer", tag: "stern-electronics" },
        t,
      ),
    ).toBe("stern-electronics");
    expect(libraryTagDisplayLabel({ type: "rev", tag: "prototype-a" }, t)).toBe(
      "prototype-a",
    );
    expect(
      libraryTagDisplayLabel({ type: "lang", tag: "en", label: "en" }, t),
    ).toBe("library.tagValues.lang.en");
  });
});

describe("metadata search URL validation", () => {
  it("preserves exact raw tag values including punctuation", () => {
    expect(
      validateLibraryMetadataSearch({
        system: "Arcade",
        tag: "developer:stern:original & co",
      }),
    ).toEqual({ system: "Arcade", tag: "developer:stern:original & co" });
  });
  it.each([
    {},
    { system: 12, tag: ["lang:en"] },
    { system: " ", tag: "region:" },
    { tag: ":en" },
    { tag: "en" },
    { tag: "" },
  ])("discards malformed parameters %j", (value) => {
    expect(validateLibraryMetadataSearch(value)).toEqual({});
  });
});
