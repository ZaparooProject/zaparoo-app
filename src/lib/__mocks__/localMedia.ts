import { vi } from "vitest";
import type {
  LocalMediaFolder,
  LocalMediaIndex,
  LocalPlaybackState,
} from "../localMedia";

const APP_FOLDER: LocalMediaFolder = {
  id: "app",
  name: "Zaparoo",
  kind: "app",
  available: true,
};

const IDLE: LocalPlaybackState = { status: "idle", position: 0, duration: 0 };

let folders: LocalMediaFolder[] = [APP_FOLDER];
let index: LocalMediaIndex = { files: [], scannedAt: 0 };
let listeners: ((state: LocalPlaybackState) => void)[] = [];

/** Sets what the next `getIndex` and `scan` return. */
export function __setLocalMediaIndex(next: LocalMediaIndex) {
  index = next;
}

export function __setLocalMediaFolders(next: LocalMediaFolder[]) {
  folders = next;
}

/** Sends a native playback update to every listener. */
export function __emitLocalPlaybackState(state: LocalPlaybackState) {
  for (const listener of listeners) listener(state);
}

export const LocalMedia = {
  isAvailable: vi.fn(async () => ({ available: true })),
  listFolders: vi.fn(async () => ({ folders })),
  addFolder: vi.fn(async (): Promise<{ folder?: LocalMediaFolder }> => ({})),
  removeFolder: vi.fn(async ({ id }: { id: string }) => {
    folders = folders.filter((folder) => folder.id !== id);
  }),
  scan: vi.fn(async () => index),
  getIndex: vi.fn(async () => index),
  showImage: vi.fn(async () => undefined),
  play: vi.fn(async () => undefined),
  pause: vi.fn(async () => undefined),
  resume: vi.fn(async () => undefined),
  stop: vi.fn(async () => undefined),
  seek: vi.fn(async () => undefined),
  getPlaybackState: vi.fn(async () => IDLE),
  addListener: vi.fn(
    async (_event: string, listener: (state: LocalPlaybackState) => void) => {
      listeners.push(listener);
      return {
        remove: vi.fn(async () => {
          listeners = listeners.filter((l) => l !== listener);
        }),
      };
    },
  ),
};

export function __resetLocalMediaMock() {
  folders = [APP_FOLDER];
  index = { files: [], scannedAt: 0 };
  listeners = [];
  for (const fn of Object.values(LocalMedia)) fn.mockClear();
}
