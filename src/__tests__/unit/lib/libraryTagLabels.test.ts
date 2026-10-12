import { describe, expect, it } from "vitest";
import { libraryTagDisplayLabel } from "@/lib/libraryTagLabels";
import { validateLibraryMetadataSearch } from "@/lib/libraryMetadataSearch";
import enUS from "@/translations/en-US.json";

const t = (key: string, options?: Record<string, string>) =>
  options
    ? `${key}:${Object.keys(options)
        .sort()
        .map((name) => options[name])
        .join("|")}`
    : key;

const label = (type: string, tag: string, coreLabel?: string) =>
  libraryTagDisplayLabel({ type, tag, label: coreLabel }, t);

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
    ["edition", "goty", "library.tagValues.edition.goty"],
    ["rev", "rev-12", "library.revisionValue:12"],
  ])(
    "formats known %s:%s without changing raw values",
    (type, tag, expected) => {
      const input = { type, tag };
      expect(libraryTagDisplayLabel(input, t)).toBe(expected);
      expect(input).toEqual({ type, tag });
    },
  );

  it.each([
    ["constructor", "constructor"],
    ["__proto__", "__proto__"],
    ["prototype", "prototype"],
    ["hasOwnProperty", "hasOwnProperty"],
  ])("does not resolve inherited keys as labels: %s", (value, expected) => {
    for (const type of ["lang", "genre", "video", "input", value]) {
      expect(label(type, value)).toBe(expected);
    }
  });

  it("keeps a meaningful Core label ahead of every local name", () => {
    expect(label("region", "us", "North America")).toBe("North America");
    expect(label("genre", "action:runandgun", "Run & Gun")).toBe("Run & Gun");
    expect(label("developer", "stern-electronics", "Stern Electronics")).toBe(
      "Stern Electronics",
    );
  });

  it("ignores a Core label that only repeats the raw value", () => {
    expect(label("lang", "en", "en")).toBe("library.tagValues.lang.en");
    expect(label("genre", "sports:soccer", "sports:soccer")).toBe(
      "library.tagValues.genre.sports_soccer",
    );
  });

  describe("genres", () => {
    it.each([
      ["genre", "action", "library.tagValues.genre.action"],
      ["genre", "action:runandgun", "library.tagValues.genre.action_runandgun"],
      [
        "gamegenre",
        "adventure:pointandclick",
        "library.tagValues.genre.adventure_pointandclick",
      ],
      [
        "genre",
        "Parlor:Mogurataiji",
        "library.tagValues.genre.parlor_mogurataiji",
      ],
      ["genre", "rpg:j", "library.tagValues.genre.rpg_j"],
    ])("names %s:%s from the genre vocabulary", (type, tag, expected) => {
      expect(label(type, tag)).toBe(expected);
    });

    it("names a family:child value by the child alone", () => {
      const genre = enUS.translation.library.tagValues.genre;
      expect(genre.action).toBe("Action");
      expect(genre.action_runandgun).toBe("Run and gun");
      expect(genre.adventure_pointandclick).toBe("Point and click");
      expect(genre.board_jankenpon).toBe("Rock paper scissors");
      expect(genre.parlor_mogurataiji).toBe("Whack-a-mole");
    });

    it("leaves a genre Core adds later exactly as sent", () => {
      expect(label("genre", "action:tower-defense")).toBe(
        "action:tower-defense",
      );
      expect(label("genre", "sandbox")).toBe("sandbox");
    });

    it("names each part of a comma-separated list", () => {
      expect(label("genre", "action:platformer, puzzle,future-genre")).toBe(
        "library.tagValues.genre.action_platformer, library.tagValues.genre.puzzle, future-genre",
      );
    });
  });

  describe("closed vocabularies", () => {
    it.each([
      ["players", "coop", "library.tagValues.players.coop"],
      ["players", "2", "2"],
      ["input", "trackball", "library.tagValues.input.trackball"],
      ["input", "joystick:2h", "library.tagValues.input.joystick_2h"],
      ["input", "joystick:8", "library.tagValues.input.joystickWays:8"],
      ["input", "buttons:6", "library.tagValues.input.buttonsCount:6"],
      ["save", "password", "library.tagValues.save.password"],
      ["media", "disk", "library.tagValues.media.disk"],
      ["media", "side-b", "library.tagValues.media.sideLetter:B"],
      ["unfinished", "proto", "library.tagValues.unfinished.proto"],
      [
        "unfinished",
        "beta:2",
        "library.tagValueNumbered:library.tagValues.unfinished.beta|2",
      ],
      ["unfinished", "demo:kiosk", "library.tagValues.unfinished.demo_kiosk"],
      [
        "unlicensed",
        "translation:old",
        "library.tagValues.unlicensed.translation_old",
      ],
      ["release", "not-for-resale", "library.tagValues.release.not-for-resale"],
      ["dump", "checksum-bad", "library.tagValues.dump.checksum-bad"],
      [
        "dump",
        "hacked:intro-removed",
        "library.tagValues.dump.hacked_intro-removed",
      ],
      ["copyright", "sw-r", "library.tagValues.copyright.sw-r"],
      [
        "perspective",
        "sidescroll:horizontal",
        "library.tagValues.perspective.sidescroll_horizontal",
      ],
      ["art", "pixelart", "library.tagValues.art.pixelart"],
      [
        "accessibility",
        "audio:subtitles",
        "library.tagValues.accessibility.audio_subtitles",
      ],
      ["cabinet", "cocktail", "library.tagValues.cabinet.cocktail"],
      ["protection", "encrypted", "library.tagValues.protection.encrypted"],
      ["supplement", "expansion", "library.tagValues.supplement.expansion"],
      ["based", "movie", "library.tagValues.based.movie"],
      ["multigame", "vol:3", "library.tagValues.multigame.volume:3"],
      ["alt", "alt", "library.tagValues.alt.alt"],
    ])("names %s:%s", (type, tag, expected) => {
      expect(label(type, tag)).toBe(expected);
    });

    it.each([
      ["video", "ntsc", "NTSC"],
      ["video", "pal-60", "PAL 60"],
      ["video", "15khz", "15 kHz"],
      ["art", "3d", "3D"],
      ["supplement", "dlc", "DLC"],
      ["protection", "fd1094", "FD1094"],
      ["based", "starwars", "Star Wars"],
      ["distribution", "virtual-console", "Virtual Console"],
      ["patch", "msu1", "MSU-1"],
      ["media", "fds", "Famicom Disk System"],
    ])("shows the fixed name for %s:%s", (type, tag, expected) => {
      expect(label(type, tag)).toBe(expected);
    });

    it("does not borrow a name from another type's vocabulary", () => {
      expect(label("developer", "action")).toBe("action");
      expect(label("players", "alt")).toBe("library.tagValues.players.alt");
      expect(label("genre", "ntsc")).toBe("ntsc");
    });

    it("has an en-US string for every key the code can produce", () => {
      const values = enUS.translation.library.tagValues as Record<
        string,
        Record<string, string>
      >;
      const produced = [
        ["genre", "notagame:purikura"],
        ["genre", "sports:roller"],
        ["input", "hrm"],
        ["input", "pedals:2"],
        ["input", "positional:3"],
        ["input", "puncher:6"],
        ["dump", "no-boot"],
        ["copyright", "lw"],
        ["accessibility", "input:onebuttonmode"],
        ["edition", "remake"],
        ["multigame", "menu"],
        ["media", "cart"],
      ].map(([type, tag]) => label(type!, tag!).split(":")[0]!);
      for (const key of produced) {
        const [, , vocabulary, name] = key.split(".");
        expect(values[vocabulary!]?.[name!]).toEqual(expect.any(String));
      }
    });
  });

  describe("values outside the known vocabularies", () => {
    it.each([
      ["developer", "stern-electronics"],
      ["region", "future-region"],
      ["search", "franchise:castlevania"],
      ["addon", "peripheral:light_phaser"],
      ["rev", "prototype-a"],
      ["unknown", "some--odd__value"],
      ["genre", "one,two"],
    ])("leaves the free text %s:%s exactly as sent", (type, tag) => {
      expect(label(type, tag)).toBe(tag);
    });

    it.each([
      ["year", "1994"],
      ["rev", "1.2"],
      ["rev", "v1.02a"],
      ["builddate", "1996-03-14"],
      ["gamedatabase", "a1b2c3d4"],
      ["compatibility", "amiga:a500-a1200"],
      ["embedded", "chip:sa1"],
      ["arcadeboard", "capcom:cps2"],
      ["region", "xk"],
      ["copyright", "zz"],
      ["publisher", "SNK"],
      ["developer", "Sega AM2"],
      ["disc", "2"],
    ])(
      "leaves the number, version, date, ID or code %s:%s alone",
      (type, tag) => {
        expect(label(type, tag)).toBe(tag);
      },
    );
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
