import { create } from "zustand";
import type { PendingRequirement } from "@/lib/models";

interface RequirementsState {
  isOpen: boolean;
  pendingRequirements: PendingRequirement[];
  completionRevision: number;
  trigger: (requirements: PendingRequirement[]) => void;
  close: () => void;
  complete: () => void;
}

export const useRequirementsStore = create<RequirementsState>((set) => ({
  isOpen: false,
  pendingRequirements: [],
  completionRevision: 0,
  trigger: (requirements) =>
    set({ isOpen: true, pendingRequirements: requirements }),
  close: () => set({ isOpen: false, pendingRequirements: [] }),
  complete: () =>
    set((state) => ({
      isOpen: false,
      pendingRequirements: [],
      completionRevision: state.completionRevision + 1,
    })),
}));
