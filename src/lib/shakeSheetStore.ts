import { create } from "zustand";
import type { LaunchMedia } from "@/lib/launchFeedback";
import { parseZapScript } from "@/lib/zapscript/script";

/**
 * State of the shake sheet: the charge while the user shakes, then the launch
 * it started. Shake detection feeds the charge, the run queue reports blocked
 * runs and failures, and the sheet itself follows launch feedback.
 */
export type ShakeSheetPhase =
  | "idle"
  | "charging"
  | "launching"
  | "launched"
  | "failed";

interface ShakeSheetState {
  phase: ShakeSheetPhase;
  /** Charge from 0 to 1. */
  progress: number;
  /** The command picks random media, so the sheet spins a cover reel. */
  random: boolean;
  /** Launch id from launch feedback, once the run has started. */
  launchId: number | null;
  media: LaunchMedia | null;
  error: string | null;
  charge: (progress: number, random: boolean) => void;
  /** The charge ran out before the shake was confirmed. */
  drain: () => void;
  confirm: () => void;
  started: (launchId: number) => void;
  land: (media: LaunchMedia | null) => void;
  fail: (message: string) => void;
  /** The run ended without starting, e.g. the Pro purchase sheet opened. */
  abandon: () => void;
  dismiss: () => void;
}

const IDLE = {
  phase: "idle" as const,
  progress: 0,
  random: false,
  launchId: null,
  media: null,
  error: null,
};

export const useShakeSheetStore = create<ShakeSheetState>()((set, get) => ({
  ...IDLE,
  charge: (progress, random) => {
    const { phase } = get();
    // A launch already in flight keeps its sheet.
    if (phase === "launching") return;
    set({ ...IDLE, phase: "charging", progress, random });
  },
  drain: () => {
    if (get().phase === "charging") set(IDLE);
  },
  confirm: () => set({ phase: "launching", progress: 1 }),
  started: (launchId) => {
    if (get().phase === "launching") set({ launchId });
  },
  land: (media) => {
    if (get().phase === "launching") set({ phase: "launched", media });
  },
  fail: (message) => {
    if (get().phase === "launching") set({ phase: "failed", error: message });
  },
  abandon: () => {
    if (get().phase === "launching") set(IDLE);
  },
  dismiss: () => set(IDLE),
}));

/** Whether a ZapScript command launches random media. */
export function isRandomLaunchScript(zapscript: string): boolean {
  const parsed = parseZapScript(zapscript);
  return (
    parsed.ok &&
    parsed.steps.some(
      (step) => step.name === "launch.random" || step.name === "random",
    )
  );
}
