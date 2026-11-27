import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/**
 * App-local media bridge (`LocalMediaPlugin` on Android and iOS).
 *
 * Native code owns the folders the app may read, walks them for media files
 * and plays audio and video with the platform player (AVPlayer on iOS,
 * ExoPlayer on Android). Titles and matching live in TypeScript so they follow
 * the same filename rules as Core; native code only reports files.
 *
 * Folders:
 * - iOS has one built-in folder, the app's Documents directory, which the
 *   Files app shows as "Zaparoo". Linked folders are picked with the document
 *   picker and kept with security-scoped bookmarks.
 * - Android has no built-in folder. Linked folders are picked with the Storage
 *   Access Framework and kept with persisted URI permissions.
 */

export type LocalMediaKind = "audio" | "video" | "image";

export interface LocalMediaFolder {
  /** Stable id, also used as the folder key in scan results. */
  id: string;
  /** Display name of the folder. */
  name: string;
  /** "app" is the built-in iOS folder; "linked" was picked by the user. */
  kind: "app" | "linked";
  /** False when the folder can no longer be read (moved, revoked, unplugged). */
  available: boolean;
}

export interface LocalMediaFile {
  folderId: string;
  /** Path inside the folder, "/"-separated, no leading slash. */
  path: string;
  /** Native URI passed back to `play` and `showImage`. */
  uri: string;
  /** Size in bytes. */
  size: number;
  /** Last-modified time in milliseconds since the epoch. */
  modified: number;
}

export interface LocalMediaIndex {
  files: LocalMediaFile[];
  /** Milliseconds since the epoch, 0 when no scan has finished yet. */
  scannedAt: number;
}

export type LocalPlaybackStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "ended"
  | "error";

export interface LocalPlaybackState {
  status: LocalPlaybackStatus;
  kind?: "audio" | "video";
  uri?: string;
  title?: string;
  /** Seconds. */
  position: number;
  /** Seconds, 0 when unknown (live streams, still loading). */
  duration: number;
  /** Native error message when status is "error". */
  error?: string;
}

export interface LocalMediaPlayOptions {
  /** A file URI from the index, or an http(s) URL. */
  uri: string;
  kind: "audio" | "video";
  /** Shown on the lock screen, notification and video player. */
  title: string;
  /** Secondary line, usually the system name. */
  subtitle?: string;
}

export interface LocalMediaPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  listFolders(): Promise<{ folders: LocalMediaFolder[] }>;
  /** Opens the platform folder picker. Resolves without a folder on cancel. */
  addFolder(): Promise<{ folder?: LocalMediaFolder }>;
  removeFolder(options: { id: string }): Promise<void>;
  /**
   * Walks every available folder for files whose lowercase extension (without
   * the dot) is in `extensions`, skipping hidden files and folders. Saves the
   * result as the index in app data and returns it.
   */
  scan(options: { extensions: string[] }): Promise<LocalMediaIndex>;
  /** The index saved by the last scan. */
  getIndex(): Promise<LocalMediaIndex>;
  /**
   * Shows an image full screen in the platform's own viewer. Resolves once it
   * is on screen; playing audio carries on underneath.
   */
  showImage(options: { uri: string; title: string }): Promise<void>;
  play(options: LocalMediaPlayOptions): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  /** Seconds. */
  seek(options: { position: number }): Promise<void>;
  getPlaybackState(): Promise<LocalPlaybackState>;
  /**
   * Fires on every status change and about once a second while playing.
   * Playback started from the lock screen or notification fires here too.
   */
  addListener(
    eventName: "playbackState",
    listener: (state: LocalPlaybackState) => void,
  ): Promise<PluginListenerHandle>;
}

export const LocalMedia = registerPlugin<LocalMediaPlugin>("LocalMedia");
