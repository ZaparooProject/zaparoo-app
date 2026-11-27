import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Capacitor } from "@capacitor/core";
import toast from "react-hot-toast";
import i18n from "@/i18n";
import { CoreAPI } from "@/lib/coreApi";
import { launchFeedback, type LaunchFeedbackEvent } from "@/lib/launchFeedback";
import { LocalMedia } from "@/lib/localMedia";
import { __setLocalMediaIndex } from "@/lib/__mocks__/localMedia";
import { useLocalPlaybackStore } from "@/lib/localPlayback/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { runToken } from "@/lib/tokenOperations";

vi.mock("react-hot-toast", () => ({ default: { error: vi.fn() } }));

const SONG_URI = "content://media/Music/Artist/Some Song.mp3";
const PHOTO_URI = "content://media/Pictures/Beach Day.jpg";

function scan(text: string, connected = true) {
  return runToken(
    "",
    text,
    true,
    connected,
    vi.fn(),
    vi.fn(),
    false,
    false,
    true,
    false,
    { source: "nfc" },
  );
}

describe("local playback routing", () => {
  let events: LaunchFeedbackEvent[];

  beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Capacitor.getPlatform).mockReturnValue("android");
    __setLocalMediaIndex({
      scannedAt: 1,
      files: [
        {
          folderId: "app",
          path: "Music/Artist/Some Song.mp3",
          uri: SONG_URI,
          size: 1,
          modified: 1,
        },
        {
          folderId: "app",
          path: "Pictures/Beach Day.jpg",
          uri: PHOTO_URI,
          size: 1,
          modified: 1,
        },
      ],
    });
    vi.spyOn(CoreAPI, "run").mockResolvedValue(undefined as never);
    events = [];
    launchFeedback.subscribe((event) => events.push(event));
    usePreferencesStore.setState({ playOn: "device" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(toast.error).mockClear();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.mocked(Capacitor.getPlatform).mockReturnValue("web");
  });

  it("sends a token to the connected device by default", async () => {
    await expect(scan("@Audio/Some Song")).resolves.toBe(true);
    expect(CoreAPI.run).toHaveBeenCalledWith(
      expect.objectContaining({ text: "@Audio/Some Song" }),
    );
    expect(LocalMedia.play).not.toHaveBeenCalled();
  });

  it("plays a #app token in the app", async () => {
    await expect(scan("@Music/Some Song||#app")).resolves.toBe(true);
    expect(LocalMedia.play).toHaveBeenCalledWith({
      uri: SONG_URI,
      kind: "audio",
      title: "Some Song",
    });
    expect(CoreAPI.run).not.toHaveBeenCalled();
    expect(events.map((e) => e.kind)).toEqual(["started", "launched"]);
    expect(useLocalPlaybackStore.getState().playback).toMatchObject({
      status: "loading",
      system: "Audio",
      title: "Some Song",
    });
  });

  it("plays in the app when Play on is set to this app", async () => {
    usePreferencesStore.setState({ playOn: "app" });
    await expect(scan("**launch.title:Audio/some song")).resolves.toBe(true);
    expect(LocalMedia.play).toHaveBeenCalledOnce();
    expect(CoreAPI.run).not.toHaveBeenCalled();
  });

  it("sends a #device token to the device even when Play on is this app", async () => {
    usePreferencesStore.setState({ playOn: "app" });
    await scan("@Audio/Some Song||#device");
    expect(CoreAPI.run).toHaveBeenCalledOnce();
    expect(LocalMedia.play).not.toHaveBeenCalled();
  });

  it("sends what the app has no match for on to the device", async () => {
    usePreferencesStore.setState({ playOn: "app" });
    await scan("@Audio/Another Song");
    expect(CoreAPI.run).toHaveBeenCalledOnce();
  });

  it("fails a #app token with no match instead of sending it on", async () => {
    await expect(scan("@Audio/Another Song||#app")).resolves.toBe(false);
    expect(CoreAPI.run).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({
      kind: "failed",
      error: { message: i18n.t("localMedia.notFound") },
    });
    expect(toast.error).toHaveBeenCalledWith(i18n.t("localMedia.notFound"));
  });

  it("keeps a token for the device while it is disconnected", async () => {
    await scan("@Audio/Some Song", false);
    expect(LocalMedia.play).not.toHaveBeenCalled();
  });

  it("plays locally with no device connected when Play on is this app", async () => {
    usePreferencesStore.setState({ playOn: "app" });
    await expect(scan("@Audio/Some Song", false)).resolves.toBe(true);
    expect(LocalMedia.play).toHaveBeenCalledOnce();
    expect(CoreAPI.run).not.toHaveBeenCalled();
  });

  it("shows an image in the native viewer", async () => {
    await scan("@Image/Beach Day||#app");
    expect(LocalMedia.showImage).toHaveBeenCalledWith({
      uri: PHOTO_URI,
      title: "Beach Day",
    });
    expect(useLocalPlaybackStore.getState().viewer).toBeNull();
    expect(LocalMedia.play).not.toHaveBeenCalled();
  });

  it("fails a #app script the app cannot play", async () => {
    await expect(scan("**input.keyboard:abc||#app")).resolves.toBe(false);
    expect(events.at(-1)).toMatchObject({
      kind: "failed",
      error: { message: i18n.t("localMedia.notPlayable") },
    });
    expect(CoreAPI.run).not.toHaveBeenCalled();
  });
});
