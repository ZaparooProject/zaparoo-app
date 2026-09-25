import { describe, expect, it } from "vitest";
import { deckArtworkTarget } from "@/lib/deckArtwork";

describe("deck artwork targets", () => {
  it.each([
    "@Genesis/ToeJam & Earl (region:us)",
    "**launch.title:Genesis/ToeJam & Earl (region:us)",
    "@Genesis/ToeJam ^& Earl?launcher=example",
  ])("extracts a title without changing its saved script: %s", (script) => {
    expect(deckArtworkTarget(script)).toEqual({
      kind: "title",
      system: "Genesis",
      name: "ToeJam & Earl",
    });
  });
  it("preserves parentheses in actual titles", () => {
    expect(deckArtworkTarget("@SNES/Game (Special Edition)")).toEqual({
      kind: "title",
      system: "SNES",
      name: "Game (Special Edition)",
    });
  });
  it.each(["SNES/Game.sfc", '**launch:"SNES/Game.sfc"'])(
    "supports system-relative file targets: %s",
    (script) => {
      expect(deckArtworkTarget(script)).toEqual({
        kind: "path",
        system: "SNES",
        path: "SNES/Game.sfc",
      });
    },
  );
  it("keeps absolute file paths for indexed-system resolution", () => {
    expect(deckArtworkTarget("/games/SNES/Game.sfc")).toEqual({
      kind: "path",
      system: "",
      path: "/games/SNES/Game.sfc",
    });
  });

  it.each([
    undefined,
    "",
    "**stop",
    "**launch.random:SNES/*",
    "@SNES/Game||**stop",
    "@SNES/[variable]",
    "https://example.com/game",
  ])("does not guess unsupported or dynamic targets: %s", (script) => {
    expect(deckArtworkTarget(script)).toBeNull();
  });
});
