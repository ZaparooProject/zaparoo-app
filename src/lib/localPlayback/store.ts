import { create } from "zustand";
import type {
  LocalMediaFolder,
  LocalMediaIndex,
  LocalPlaybackState,
} from "@/lib/localMedia";
import type { CatalogEntry } from "./catalog";
import type { LocalSystemId } from "./systems";

/** What the app is showing or playing itself. */
export interface LocalNowPlaying extends LocalPlaybackState {
  system?: LocalSystemId;
}

/** An image or video shown in the web build's media viewer. */
export interface LocalViewerItem {
  kind: "image" | "video";
  url: string;
  title: string;
}

interface LocalPlaybackStore {
  /** False until the folders and saved index have loaded. */
  ready: boolean;
  folders: LocalMediaFolder[];
  index: LocalMediaIndex;
  catalog: CatalogEntry[];
  scanning: boolean;
  playback: LocalNowPlaying;
  viewer: LocalViewerItem | null;
  setLoaded: (
    folders: LocalMediaFolder[],
    index: LocalMediaIndex,
    catalog: CatalogEntry[],
  ) => void;
  setFolders: (folders: LocalMediaFolder[]) => void;
  setScanning: (scanning: boolean) => void;
  setPlayback: (playback: LocalNowPlaying) => void;
  setViewer: (viewer: LocalViewerItem | null) => void;
  reset: () => void;
}

export const IDLE_PLAYBACK: LocalNowPlaying = {
  status: "idle",
  position: 0,
  duration: 0,
};

const INITIAL = {
  ready: false,
  folders: [],
  index: { files: [], scannedAt: 0 },
  catalog: [],
  scanning: false,
  playback: IDLE_PLAYBACK,
  viewer: null,
};

export const useLocalPlaybackStore = create<LocalPlaybackStore>()((set) => ({
  ...INITIAL,
  setLoaded: (folders, index, catalog) =>
    set({ ready: true, folders, index, catalog }),
  setFolders: (folders) => set({ folders }),
  setScanning: (scanning) => set({ scanning }),
  setPlayback: (playback) => set({ playback }),
  setViewer: (viewer) => set({ viewer }),
  reset: () => set(INITIAL),
}));

/** Local audio or video is loaded, so the app's Now Playing card shows. */
export function isLocalPlaybackActive(playback: LocalNowPlaying): boolean {
  return (
    playback.status === "loading" ||
    playback.status === "playing" ||
    playback.status === "paused"
  );
}
