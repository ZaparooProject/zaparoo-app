import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  launchFeedback,
  MEDIA_WINDOW_MS,
  type LaunchFeedbackEvent,
} from "@/lib/launchFeedback";

const media = {
  name: "Chrono Trigger",
  systemId: "SNES",
  systemName: "Super Nintendo",
  path: "/snes/chrono.sfc",
};

describe("launchFeedback", () => {
  let events: LaunchFeedbackEvent[];

  beforeEach(() => {
    vi.useFakeTimers();
    events = [];
    launchFeedback.subscribe((event) => events.push(event));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lands on the media Core reports while the run is in flight", () => {
    const id = launchFeedback.begin("nfc");
    launchFeedback.mediaStarted(media);
    launchFeedback.resolved(id);

    expect(events.at(-1)).toEqual({
      kind: "launched",
      id,
      source: "nfc",
      media,
    });
    vi.advanceTimersByTime(MEDIA_WINDOW_MS);
    expect(events.filter((e) => e.kind === "launched")).toHaveLength(1);
  });

  it("lands on media that starts shortly after the run resolves", () => {
    const id = launchFeedback.begin("shake");
    launchFeedback.resolved(id);
    vi.advanceTimersByTime(MEDIA_WINDOW_MS - 1);
    launchFeedback.mediaStarted(media);

    expect(events.at(-1)).toMatchObject({ kind: "launched", media });
  });

  it("lands without media when a resolved run starts nothing", () => {
    const id = launchFeedback.begin("camera");
    launchFeedback.resolved(id);
    expect(events.some((e) => e.kind === "launched")).toBe(false);

    vi.advanceTimersByTime(MEDIA_WINDOW_MS);
    expect(events.at(-1)).toEqual({
      kind: "launched",
      id,
      source: "camera",
      media: null,
    });
  });

  it("reports a failed run", () => {
    const id = launchFeedback.begin("nfc");
    const error = {
      message: "nope",
      category: "invalid_script",
      cancelled: false,
    };
    launchFeedback.failed(id, error);

    expect(events.at(-1)).toEqual({ kind: "failed", id, source: "nfc", error });
  });

  it("ignores media started by something the app did not launch", () => {
    launchFeedback.mediaStarted(media);
    expect(events).toEqual([]);
  });

  it("ignores answers for a launch that a newer one replaced", () => {
    const first = launchFeedback.begin("nfc");
    const second = launchFeedback.begin("nfc");
    launchFeedback.failed(first, {
      message: "late",
      category: null,
      cancelled: false,
    });

    expect(events.some((e) => e.kind === "failed")).toBe(false);
    launchFeedback.mediaStarted(media);
    expect(events.at(-1)).toMatchObject({ kind: "launched", id: second });
  });

  it("passes on whether the OS already gave read feedback", () => {
    launchFeedback.read("nfc", true);
    expect(events).toEqual([
      { kind: "read", source: "nfc", systemFeedback: true },
    ]);
  });
});
