import { describe, expect, it } from "vitest";
import { parseRunFailed, runFailedFeedback } from "@/lib/runFailed";

// The payload from Core's docs/api/notifications.md.
const playlistFailure = {
  source: "Playlist",
  script: "@Arcade/Metal Slug X (year:1999)",
  command: "launch.title",
  category: "media_not_found",
  message: "media not found",
  playlistId: "deck://lhm6n9t8",
  playlistIndex: 0,
};

describe("parseRunFailed", () => {
  it("should read Core's documented payload", () => {
    expect(parseRunFailed(playlistFailure)).toEqual(playlistFailure);
  });

  it("should read a payload with only the required fields", () => {
    expect(
      parseRunFailed({
        source: "API",
        category: "invalid_script",
        message: "ZapScript is invalid",
      }),
    ).toMatchObject({
      source: "API",
      category: "invalid_script",
      playlistIndex: undefined,
    });
  });

  it.each([undefined, null, "run.failed", [], {}, { source: "Playlist" }])(
    "should reject %j",
    (params) => {
      expect(parseRunFailed(params)).toBeNull();
    },
  );

  it("should drop a playlist index that is not a position", () => {
    expect(
      parseRunFailed({ ...playlistFailure, playlistIndex: "0" }),
    ).toMatchObject({ playlistIndex: undefined });
    expect(
      parseRunFailed({ ...playlistFailure, playlistIndex: -1 }),
    ).toMatchObject({ playlistIndex: undefined });
  });
});

describe("runFailedFeedback", () => {
  const feedbackFor = (params: unknown) =>
    runFailedFeedback(parseRunFailed(params)!);

  it("should name the missing playlist item by its one-based position", () => {
    expect(feedbackFor(playlistFailure)).toEqual({
      key: "scan.playlistItemNotFound",
      options: { number: 1 },
    });
  });

  it("should report other playlist item failures by position", () => {
    expect(
      feedbackFor({
        ...playlistFailure,
        category: "execution_failed",
        playlistIndex: 4,
      }),
    ).toEqual({ key: "scan.playlistItemError", options: { number: 5 } });
  });

  it("should report a playlist failure without a position", () => {
    expect(
      feedbackFor({ ...playlistFailure, playlistIndex: undefined }),
    ).toEqual({ key: "decks.itemLaunchError" });
  });

  // The `run` response already reports these to the screen that made the call.
  it("should leave a failed run call to its own error response", () => {
    expect(
      feedbackFor({
        source: "API",
        category: "media_not_found",
        message: "media not found",
      }),
    ).toBeNull();
  });

  it.each(["Reader", "Hook", "Control", "Remote", "GMC", "Later"])(
    "should stay quiet for a %s run",
    (source) => {
      expect(
        feedbackFor({ source, category: "blocked", message: "blocked" }),
      ).toBeNull();
    },
  );
});
