import { describe, expect, it } from "vitest";
import { deckItemLaunchText, mediaDeckItem } from "@/lib/decks";
import type { DeckItem } from "@/lib/models";

const script: DeckItem = {
  id: 1,
  position: 1,
  kind: "script",
  name: "Game",
  zapscript: "**launch.title:NES/Game",
};

describe("adding media to decks", () => {
  const entry = {
    type: "media" as const,
    mediaId: 42,
    name: "ToeJam & Earl",
    systemId: "Genesis",
    path: "/media/fat/games/Genesis/Collection.zip/ToeJam & Earl.md",
    relativePath: "Genesis/Collection.zip/ToeJam & Earl.md",
    zapScript: "@Genesis/ToeJam & Earl (region:us)",
  };

  it("preserves the result's ZapScript even when a media ID is available", () => {
    expect(mediaDeckItem(entry, false)).toEqual({
      kind: "script",
      name: entry.name,
      zapscript: entry.zapScript,
    });
  });

  it("uses relativePath with Show filenames enabled", () => {
    expect(mediaDeckItem(entry, true)).toEqual({
      kind: "script",
      name: entry.name,
      zapscript: entry.relativePath,
    });
  });

  it.each([undefined, "", "   "])(
    "falls back to path when relativePath is %s",
    (relativePath) => {
      expect(mediaDeckItem({ ...entry, relativePath }, true)).toEqual({
        kind: "script",
        name: entry.name,
        zapscript: entry.path,
      });
    },
  );

  it("falls back to the relative path when older results omit ZapScript", () => {
    expect(mediaDeckItem({ ...entry, zapScript: undefined }, false)).toEqual({
      kind: "script",
      name: entry.name,
      zapscript: entry.relativePath,
    });
  });

  it("does not invent a command when no result value is available", () => {
    expect(() =>
      mediaDeckItem(
        { ...entry, path: "", relativePath: "", zapScript: undefined },
        false,
      ),
    ).toThrow("Media result has no playable script or path");
  });
});

describe("deck item launch targets", () => {
  it("preserves the saved script regardless of linked media availability", () => {
    const media = {
      system: "NES",
      path: "/games/NES/Game.nes",
      name: "Game",
      available: true,
    };
    expect(deckItemLaunchText({ ...script, media }, "deck1")).toBe(
      script.zapscript,
    );
    expect(
      deckItemLaunchText(
        { ...script, media: { ...media, path: '/games/A "B"[C].nes' } },
        "deck1",
      ),
    ).toBe(script.zapscript);
    expect(
      deckItemLaunchText(
        { ...script, media: { ...media, available: false } },
        "deck1",
      ),
    ).toBe(script.zapscript);
  });

  it("runs one card script and opens multiple card scripts as the same nested playlist Core uses", () => {
    const card: DeckItem = {
      id: 2,
      position: 2,
      kind: "card",
      name: "Card",
      cardId: "CARD001",
      scripts: [{ name: "One", zapscript: "**launch.system:NES" }],
    };
    expect(deckItemLaunchText(card, "0k3v9x2rq7bm")).toBe(
      "**launch.system:NES",
    );
    expect(
      deckItemLaunchText(
        {
          ...card,
          scripts: [
            { name: "One", zapscript: "**launch.system:NES" },
            { name: "Two", zapscript: "**launch.system:SNES" },
          ],
        },
        "0k3v9x2rq7bm",
      ),
    ).toBe(
      '**playlist.open:{"id":"deck://0k3v9x2rq7bm/CARD001","name":"Card","items":[{"name":"One","zapscript":"**launch.system:NES"},{"name":"Two","zapscript":"**launch.system:SNES"}]}',
    );
  });

  it("keeps an ID-only card selectable but not launchable until scripts arrive", () => {
    expect(
      deckItemLaunchText(
        { id: 3, position: 3, kind: "card", name: "", cardId: "CARD002" },
        "deck1",
      ),
    ).toBeNull();
  });
});
