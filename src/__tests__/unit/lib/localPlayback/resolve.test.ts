import { describe, expect, it } from "vitest";
import { findLocalMatch, parseToken } from "@/lib/localPlayback/resolve";

describe("parseToken", () => {
  it("reads a title launch and its target", () => {
    expect(parseToken("@Music/Some Song||#app", "android")).toEqual({
      target: "app",
      request: { kind: "title", systemName: "Music", title: "Some Song" },
    });
  });

  it("reads **launch.title and a bare System/Title", () => {
    expect(parseToken("**launch.title:Video/Clip", "ios").request).toEqual({
      kind: "title",
      systemName: "Video",
      title: "Clip",
    });
    expect(parseToken("Audio/Track", "ios").request).toEqual({
      kind: "title",
      systemName: "Audio",
      title: "Track",
    });
  });

  it("reads a media file path", () => {
    expect(parseToken("/music/Song.mp3", "android").request).toEqual({
      kind: "path",
      path: "/music/Song.mp3",
    });
  });

  it("reads an http media URL with its system", () => {
    expect(
      parseToken("https://example.com/a%20b.mp3||#device", "web"),
    ).toMatchObject({ request: { kind: "url", system: "Audio" } });
  });

  it("plays an HLS stream in the native players only", () => {
    const stream = "https://example.com/live/index.m3u8";
    expect(parseToken(stream, "android").request).toMatchObject({
      kind: "url",
      system: "Video",
    });
    expect(parseToken(stream, "ios").request).toMatchObject({ kind: "url" });
    expect(parseToken(stream, "web").request).toBeNull();
  });

  it.each([
    "**input.keyboard:abc",
    "**launch.random:snes",
    "*Auto",
    "@Audio/Song||**stop",
    "@Audio/Song (year:1999)",
    "@Audio/Song?tags=genre:rock",
    "https://example.com/page",
    "steam://run/1",
  ])("does not play %s in the app", (text) => {
    expect(parseToken(text, "android").request).toBeNull();
  });
});

describe("findLocalMatch for URLs", () => {
  it("titles a URL by its decoded file name", () => {
    expect(
      findLocalMatch(
        { kind: "url", url: "https://example.com/a%20b.mp3", system: "Audio" },
        [],
      ),
    ).toEqual({
      system: "Audio",
      title: "a b",
      uri: "https://example.com/a%20b.mp3",
    });
  });
});
