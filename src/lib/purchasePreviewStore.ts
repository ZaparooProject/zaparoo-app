import { create } from "zustand";

export type PurchasePreviewState =
  | "live"
  | "free"
  | "checkout"
  | "pro"
  | "warp"
  | "loading"
  | "error";

interface PurchasePreviewStore {
  state: PurchasePreviewState;
  setPreviewState: (state: PurchasePreviewState) => void;
}

export const usePurchasePreviewStore = create<PurchasePreviewStore>((set) => ({
  state: "live",
  setPreviewState: (state) => set({ state }),
}));

export function isPurchasePreviewEnabled(): boolean {
  return (
    import.meta.env.DEV || import.meta.env.VITE_PURCHASE_PREVIEW === "true"
  );
}

export function getPurchasePreviewState(
  configuredState: PurchasePreviewState,
): PurchasePreviewState {
  return isPurchasePreviewEnabled() ? configuredState : "live";
}

export function resetPurchasePreviewState(): void {
  usePurchasePreviewStore.setState({ state: "live" });
}
