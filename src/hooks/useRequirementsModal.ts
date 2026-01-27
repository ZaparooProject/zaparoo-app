import { create } from "zustand";
import type { PendingRequirement } from "@/lib/models";

interface RequirementsState {
  isOpen: boolean;
  pendingRequirements: PendingRequirement[];
  trigger: (requirements: PendingRequirement[]) => void;
  close: () => void;
}

export const useRequirementsStore = create<RequirementsState>((set) => ({
  isOpen: false,
  pendingRequirements: [],
  trigger: (requirements) =>
    set({ isOpen: true, pendingRequirements: requirements }),
  close: () => set({ isOpen: false, pendingRequirements: [] }),
}));
