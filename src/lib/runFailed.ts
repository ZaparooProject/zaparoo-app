import type { RunFailedParams } from "@/lib/models";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read a `run.failed` payload, or null when it is not one. */
export function parseRunFailed(params: unknown): RunFailedParams | null {
  if (!isRecord(params)) return null;
  const { source, category, message } = params;
  if (typeof source !== "string" || typeof category !== "string") return null;
  const text = (value: unknown) =>
    typeof value === "string" && value !== "" ? value : undefined;
  return {
    source,
    category,
    message: typeof message === "string" ? message : "",
    readerId: text(params.readerId),
    script: text(params.script),
    command: text(params.command),
    playlistId: text(params.playlistId),
    playlistIndex:
      typeof params.playlistIndex === "number" &&
      Number.isInteger(params.playlistIndex) &&
      params.playlistIndex >= 0
        ? params.playlistIndex
        : undefined,
  };
}

export interface RunFailedFeedback {
  key: string;
  options?: { number: number };
}

/**
 * The message to show for a failed run, or null when this notification is not
 * the one that tells the user.
 *
 * Core sends `run.failed` to every client for every failed run and the payload
 * does not say which client started it. A `run` call (source `API`) already
 * fails with the same category and message in its own response, and the screen
 * that made the call shows that, so reporting it here would show the failure
 * twice. A playlist item is launched by Core after the call that started the
 * playlist has returned, so this notification is its only report. Runs from
 * readers, hooks, controls and remote operations were not started in the app.
 */
export function runFailedFeedback(
  failure: RunFailedParams,
): RunFailedFeedback | null {
  if (failure.source !== "Playlist") return null;
  if (failure.playlistIndex === undefined) {
    return { key: "decks.itemLaunchError" };
  }
  const options = { number: failure.playlistIndex + 1 };
  return failure.category === "media_not_found"
    ? { key: "scan.playlistItemNotFound", options }
    : { key: "scan.playlistItemError", options };
}
