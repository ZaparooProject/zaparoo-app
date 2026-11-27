import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { LocalMedia, type LocalPlaybackState } from "@/lib/localMedia";
import { logger } from "@/lib/logger";
import { allExtensions, buildCatalog, type LocalPlatform } from "./catalog";
import type { LocalMatch } from "./resolve";
import { IDLE_PLAYBACK, useLocalPlaybackStore } from "./store";

/**
 * Plays what the app matched: audio and video through the native player on
 * iOS and Android, images in the app's viewer. Browser builds have no file
 * index; they play http(s) media URLs with an audio element or the viewer's
 * video element.
 */

export function localPlatform(): LocalPlatform {
  const platform = Capacitor.getPlatform();
  return platform === "ios" || platform === "android" ? platform : "web";
}

/** Whether this build can index files on the device. */
export function canIndexFiles(): boolean {
  return Capacitor.isNativePlatform();
}

let listener: PluginListenerHandle | null = null;
let initializing: Promise<void> | null = null;
let webAudio: HTMLAudioElement | null = null;

function applyNativeState(state: LocalPlaybackState) {
  const store = useLocalPlaybackStore.getState();
  const current = store.playback;
  store.setPlayback({
    ...state,
    // Native state has no system; it belongs to whatever was started last.
    system: state.uri === current.uri ? current.system : undefined,
  });
}

/** Loads folders and the saved index, and follows native playback. */
export function initLocalMedia(): Promise<void> {
  if (initializing) return initializing;
  initializing = (async () => {
    const store = useLocalPlaybackStore.getState();
    if (!canIndexFiles()) {
      store.setLoaded([], { files: [], scannedAt: 0 }, []);
      return;
    }
    try {
      listener = await LocalMedia.addListener(
        "playbackState",
        applyNativeState,
      );
      const [{ folders }, index, state] = await Promise.all([
        LocalMedia.listFolders(),
        LocalMedia.getIndex(),
        LocalMedia.getPlaybackState(),
      ]);
      store.setLoaded(
        folders,
        index,
        buildCatalog(index.files, localPlatform()),
      );
      applyNativeState(state);
    } catch (e) {
      logger.error("local media init failed", e, {
        category: "general",
        action: "localMediaInit",
      });
      store.setLoaded([], { files: [], scannedAt: 0 }, []);
    }
  })();
  return initializing;
}

/** Walks every folder again and replaces the index. */
export async function scanLocalMedia(): Promise<void> {
  if (!canIndexFiles()) return;
  const store = useLocalPlaybackStore.getState();
  if (store.scanning) return;
  store.setScanning(true);
  try {
    const platform = localPlatform();
    const [index, { folders }] = await Promise.all([
      LocalMedia.scan({ extensions: allExtensions(platform) }),
      LocalMedia.listFolders(),
    ]);
    store.setLoaded(folders, index, buildCatalog(index.files, platform));
  } finally {
    useLocalPlaybackStore.getState().setScanning(false);
  }
}

/** Opens the folder picker. Resolves true when a folder was added. */
export async function addLocalFolder(): Promise<boolean> {
  const { folder } = await LocalMedia.addFolder();
  if (!folder) return false;
  await scanLocalMedia();
  return true;
}

export async function removeLocalFolder(id: string): Promise<void> {
  await LocalMedia.removeFolder({ id });
  await scanLocalMedia();
}

function stopWebAudio() {
  if (!webAudio) return;
  webAudio.pause();
  webAudio.removeAttribute("src");
  webAudio.load();
  webAudio = null;
}

function playWebAudio(match: LocalMatch) {
  stopWebAudio();
  const audio = new Audio(match.uri);
  webAudio = audio;
  const base = {
    kind: "audio" as const,
    uri: match.uri,
    title: match.title,
    system: match.system,
  };
  const report = (status: LocalPlaybackState["status"], error?: string) => {
    if (webAudio !== audio) return;
    useLocalPlaybackStore.getState().setPlayback({
      ...base,
      status,
      position: audio.currentTime || 0,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      ...(error ? { error } : {}),
    });
  };
  audio.addEventListener("playing", () => report("playing"));
  audio.addEventListener("pause", () => {
    if (!audio.ended) report("paused");
  });
  audio.addEventListener("waiting", () => report("loading"));
  audio.addEventListener("ended", () => report("ended"));
  audio.addEventListener("error", () =>
    report("error", audio.error?.message || "playback error"),
  );
  report("loading");
  return audio.play();
}

/** Starts playing or showing a match. Rejects when the player can't. */
export async function playLocal(match: LocalMatch): Promise<void> {
  const store = useLocalPlaybackStore.getState();
  const native = Capacitor.isNativePlatform();

  if (match.system === "Image") {
    if (native) {
      await LocalMedia.showImage({ uri: match.uri, title: match.title });
      return;
    }
    store.setViewer({ kind: "image", url: match.uri, title: match.title });
    return;
  }

  const kind = match.system === "Video" ? "video" : "audio";
  if (native) {
    store.setPlayback({
      status: "loading",
      kind,
      uri: match.uri,
      title: match.title,
      system: match.system,
      position: 0,
      duration: 0,
    });
    await LocalMedia.play({ uri: match.uri, kind, title: match.title });
    return;
  }

  if (kind === "video") {
    stopWebAudio();
    store.setPlayback(IDLE_PLAYBACK);
    store.setViewer({ kind: "video", url: match.uri, title: match.title });
    return;
  }
  store.setViewer(null);
  await playWebAudio(match);
}

export async function toggleLocalPlayback(): Promise<void> {
  const { playback } = useLocalPlaybackStore.getState();
  const playing =
    playback.status === "playing" || playback.status === "loading";
  if (!Capacitor.isNativePlatform()) {
    if (!webAudio) return;
    if (playing) webAudio.pause();
    else await webAudio.play();
    return;
  }
  if (playing) await LocalMedia.pause();
  else await LocalMedia.resume();
}

export async function stopLocalPlayback(): Promise<void> {
  const store = useLocalPlaybackStore.getState();
  if (Capacitor.isNativePlatform()) {
    await LocalMedia.stop();
  } else {
    stopWebAudio();
  }
  store.setPlayback(IDLE_PLAYBACK);
}

/** Test-only: forget listeners and the web player. */
export async function resetLocalMediaForTests(): Promise<void> {
  stopWebAudio();
  await listener?.remove();
  listener = null;
  initializing = null;
  useLocalPlaybackStore.getState().reset();
}
