/**
 * Launch feedback: the two beats a physical reader gives.
 *
 * Beat 1 fires the moment a token is read. Beat 2 fires when Core confirms the
 * launch (`media.started`) or reports a failure. `media.started` carries no
 * request id, so a launch is matched by time: the run is in flight, or it
 * resolved within `MEDIA_WINDOW_MS`. A run that resolves without media starting
 * (a non-media script) lands as a success with no media once the window ends.
 *
 * Haptics are played by `useLaunchFeedbackHaptics`; screens that show the
 * outcome (shake sheet, camera overlay) subscribe here too.
 */

export type LaunchSource = "nfc" | "camera" | "passive" | "shake" | "queue";

export interface LaunchMedia {
  name: string;
  systemId: string;
  systemName: string;
  path: string;
}

export interface LaunchError {
  message: string;
  category: string | null;
  cancelled: boolean;
}

export type LaunchFeedbackEvent =
  | {
      kind: "read";
      source: LaunchSource;
      /** The OS already gave read feedback, so skip the app's beat 1. */
      systemFeedback: boolean;
    }
  | { kind: "started"; id: number; source: LaunchSource }
  | {
      kind: "launched";
      id: number;
      source: LaunchSource;
      media: LaunchMedia | null;
    }
  | { kind: "failed"; id: number; source: LaunchSource; error: LaunchError };

type Listener = (event: LaunchFeedbackEvent) => void;

export const MEDIA_WINDOW_MS = 5000;

interface PendingLaunch {
  id: number;
  source: LaunchSource;
  resolved: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

const listeners = new Set<Listener>();
let nextId = 1;
let pending: PendingLaunch | null = null;

function emit(event: LaunchFeedbackEvent) {
  for (const listener of listeners) {
    listener(event);
  }
}

function clearPending() {
  if (pending?.timer) {
    clearTimeout(pending.timer);
  }
  pending = null;
}

export const launchFeedback = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Beat 1: a token was read. */
  read(source: LaunchSource, systemFeedback = false) {
    emit({ kind: "read", source, systemFeedback });
  },

  /** A run request is going to Core. Returns the launch id. */
  begin(source: LaunchSource): number {
    clearPending();
    const id = nextId++;
    pending = { id, source, resolved: false, timer: null };
    emit({ kind: "started", id, source });
    return id;
  },

  /** Core answered the run without error. */
  resolved(id: number) {
    if (!pending || pending.id !== id) return;
    const launch = pending;
    launch.resolved = true;
    launch.timer = setTimeout(() => {
      if (pending?.id !== id) return;
      clearPending();
      emit({ kind: "launched", id, source: launch.source, media: null });
    }, MEDIA_WINDOW_MS);
  },

  /** Beat 2 (error): the run failed. */
  failed(id: number, error: LaunchError) {
    if (!pending || pending.id !== id) return;
    const { source } = pending;
    clearPending();
    emit({ kind: "failed", id, source, error });
  },

  /** Beat 2 (success): Core reported media started in the primary slot. */
  mediaStarted(media: LaunchMedia) {
    if (!pending) return;
    const { id, source } = pending;
    clearPending();
    emit({ kind: "launched", id, source, media });
  },

  /** Test helper: drop pending state and listeners. */
  reset() {
    clearPending();
    listeners.clear();
  },
};
