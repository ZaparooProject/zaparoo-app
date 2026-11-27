import { describe, expect, it } from "vitest";
import type { LocalMediaFile } from "@/lib/localMedia";
import { buildCatalog } from "@/lib/localPlayback/catalog";
import {
  matchPath,
  matchTitle,
  sameTitleNumbers,
} from "@/lib/localPlayback/match";
import { lookupMediaSystem } from "@/lib/localPlayback/systems";

function file(path: string): LocalMediaFile {
  return {
    folderId: "app",
    path,
    uri: `file:///media/${path}`,
    size: 1,
    modified: 1,
  };
}

function match(
  catalog: ReturnType<typeof buildCatalog>,
  system: string,
  title: string,
) {
  const found = lookupMediaSystem(system);
  if (!found) throw new Error(`no system ${system}`);
  return matchTitle(catalog, found, title)?.file.path;
}

describe("buildCatalog", () => {
  it("titles files by name and system", () => {
    const catalog = buildCatalog(
      [
        file("Music/Some Song.mp3"),
        file("Clips/Holiday.mp4"),
        file("Pics/Beach.jpg"),
        file("notes.txt"),
      ],
      "android",
    );
    expect(catalog.map((e) => [e.system, e.title])).toEqual([
      ["Audio", "Some Song"],
      ["Video", "Holiday"],
      ["Image", "Beach"],
    ]);
  });

  it("strips track numbers when most files in a folder have them", () => {
    const catalog = buildCatalog(
      [
        "01 - Intro",
        "02 - Hello",
        "03 - World",
        "04 - Again",
        "05 - Outro",
      ].map((n) => file(`Album/${n}.mp3`)),
      "android",
    );
    expect(catalog.filter((e) => !e.alias).map((e) => e.title)).toEqual([
      "Intro",
      "Hello",
      "World",
      "Again",
      "Outro",
    ]);
  });

  it("keeps a number that only one file has", () => {
    const catalog = buildCatalog(
      [file("Music/1999.mp3"), file("Music/Song.mp3")],
      "android",
    );
    expect(catalog.map((e) => e.title)).toContain("1999");
  });
});

describe("matchTitle", () => {
  const catalog = buildCatalog(
    [
      file("Music/The Long Road.mp3"),
      file("Music/Track 2.mp3"),
      file("Music/Track 3.mp3"),
      file("Video/Holiday Trip.mp4"),
      file("Video/copy/Holiday Trip (1).mp4"),
    ],
    "android",
  );

  it("matches a title by slug, ignoring case and punctuation", () => {
    expect(match(catalog, "Audio", "the long-road")).toBe(
      "Music/The Long Road.mp3",
    );
  });

  it("matches a music system through its Audio fallback", () => {
    expect(match(catalog, "Music", "The Long Road")).toBe(
      "Music/The Long Road.mp3",
    );
  });

  it("does not match a title with different numbers", () => {
    expect(match(catalog, "Audio", "Track 4")).toBeUndefined();
    expect(match(catalog, "Audio", "Track 3")).toBe("Music/Track 3.mp3");
  });

  it("prefers the original over a copy", () => {
    expect(match(catalog, "Video", "Holiday Trip")).toBe(
      "Video/Holiday Trip.mp4",
    );
  });

  it("only matches within the asked-for system", () => {
    expect(match(catalog, "Image", "Holiday Trip")).toBeUndefined();
  });
});

describe("matchTitle with numbered files", () => {
  it("matches a numbered file by its title in a folder too small to strip", () => {
    const catalog = buildCatalog(
      [file("Music/01 - The Long Road.mp3"), file("Music/Morning Song.mp3")],
      "android",
    );
    const entry = matchTitle(catalog, lookupMediaSystem("Audio")!, "Long Road");
    expect(entry?.file.path).toBe("Music/01 - The Long Road.mp3");
    expect(entry?.title).toBe("01 - The Long Road");
  });

  it("matches the full name in a folder that strips numbers", () => {
    const catalog = buildCatalog(
      [
        "01 - Intro",
        "02 - Hello",
        "03 - World",
        "04 - Again",
        "05 - Outro",
      ].map((n) => file(`Album/${n}.mp3`)),
      "android",
    );
    expect(match(catalog, "Audio", "02 - Hello")).toBe("Album/02 - Hello.mp3");
  });

  it("prefers a file's own title over another file's numbered form", () => {
    const catalog = buildCatalog(
      [file("Music/01 - Song.mp3"), file("Music/Song.mp3")],
      "android",
    );
    expect(match(catalog, "Audio", "Song")).toBe("Music/Song.mp3");
  });
});

describe("matchPath", () => {
  it("matches a path by file name", () => {
    const catalog = buildCatalog([file("Music/Song.MP3")], "android");
    expect(matchPath(catalog, "/media/fat/music/song.mp3")?.file.path).toBe(
      "Music/Song.MP3",
    );
  });
});

describe("sameTitleNumbers", () => {
  it.each([
    ["Track 02", "Track 2", true],
    ["Part 1", "Part", true],
    ["Track 2", "Track 3", false],
  ])("%s vs %s is %s", (a, b, same) => {
    expect(sameTitleNumbers(a, b)).toBe(same);
  });
});
