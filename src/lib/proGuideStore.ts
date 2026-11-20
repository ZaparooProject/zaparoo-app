import { create } from "zustand";
import type { AntennaSpot } from "./nfcAntenna";

interface ProGuideStore {
  /** Pro just became active; show the guide once nothing else is on screen. */
  pending: boolean;
  open: boolean;
  /** Dev preview only: stands in for the device's antenna position. */
  previewAntenna: AntennaSpot | null;
  request: () => void;
  show: (previewAntenna?: AntennaSpot | null) => void;
  close: () => void;
}

export const useProGuideStore = create<ProGuideStore>((set) => ({
  pending: false,
  open: false,
  previewAntenna: null,
  request: () => set({ pending: true }),
  show: (previewAntenna = null) =>
    set({ open: true, pending: false, previewAntenna }),
  close: () => set({ open: false, pending: false, previewAntenna: null }),
}));

/** Called where a Pro purchase completes. */
export function requestProGuide(): void {
  useProGuideStore.getState().request();
}

export function resetProGuideState(): void {
  useProGuideStore.setState({
    pending: false,
    open: false,
    previewAntenna: null,
  });
}
