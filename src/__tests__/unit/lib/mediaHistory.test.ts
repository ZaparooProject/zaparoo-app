import { describe, it, expect } from "vitest";
import {
  dedupeHistoryByMedia,
  historyEntryToBrowseEntry,
  historyPageLimit,
} from "@/lib/mediaHistory";
import type { MediaHistoryEntry } from "@/lib/models";

function entry(overrides: Partial<MediaHistoryEntry> = {}): MediaHistoryEntry {
  return {
    systemId: "SNES",
    systemName: "Super Nintendo",
    mediaName: "Super Mario World",
    mediaPath: "/games/smw.sfc",
    startedAt: "2026-09-20T10:00:00Z",
    playTime: 600,
    ...overrides,
  };
}

describe("mediaHistory", () => {
  describe("dedupeHistoryByMedia", () => {
    it("keeps one row per media, newest first", () => {
      const result = dedupeHistoryByMedia(
        [
          entry({ startedAt: "2026-09-20T12:00:00Z" }),
          entry({ startedAt: "2026-09-20T09:00:00Z" }),
          entry({ mediaName: "Zelda", mediaPath: "/games/zelda.sfc" }),
        ],
        10,
      );

      expect(result).toHaveLength(2);
      expect(result[0]?.startedAt).toBe("2026-09-20T12:00:00Z");
      expect(result[1]?.mediaName).toBe("Zelda");
    });

    it("treats the same filename on different systems as different media", () => {
      const result = dedupeHistoryByMedia(
        [
          entry({ systemId: "SNES", mediaPath: "/games/game.rom" }),
          entry({ systemId: "NES", mediaPath: "/games/game.rom" }),
        ],
        10,
      );

      expect(result).toHaveLength(2);
    });

    it("stops at the limit", () => {
      const result = dedupeHistoryByMedia(
        [
          entry({ mediaPath: "/a" }),
          entry({ mediaPath: "/b" }),
          entry({ mediaPath: "/c" }),
        ],
        2,
      );

      expect(result).toHaveLength(2);
    });
  });

  describe("historyPageLimit", () => {
    it("asks for exactly what it shows when Core dedupes", () => {
      expect(historyPageLimit(12, true)).toBe(12);
    });

    it("asks for a wider page when Core cannot dedupe", () => {
      expect(historyPageLimit(12, false)).toBe(48);
    });

    it("never exceeds Core's page cap", () => {
      expect(historyPageLimit(50, false)).toBe(100);
    });
  });

  describe("historyEntryToBrowseEntry", () => {
    it("produces a media entry the artwork pipeline accepts", () => {
      const result = historyEntryToBrowseEntry(
        entry({ mediaId: 42, hasCover: true, relativePath: "smw.sfc" }),
      );

      expect(result).toMatchObject({
        mediaId: 42,
        type: "media",
        systemId: "SNES",
        path: "/games/smw.sfc",
        name: "Super Mario World",
        hasCover: true,
      });
    });
  });
});
