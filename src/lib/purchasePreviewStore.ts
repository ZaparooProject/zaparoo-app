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

/**
 * The Warp state a screen should display: the live value, or the one the
 * active preview stands for. Null means it is not known yet.
 */
export function getDisplayedWarpAccess(
  previewState: PurchasePreviewState,
  liveAccess: boolean | null,
): boolean | null {
  switch (previewState) {
    case "live":
      return liveAccess;
    case "warp":
      return true;
    case "free":
    case "checkout":
    case "pro":
      return false;
    default:
      return null;
  }
}

export function resetPurchasePreviewState(): void {
  usePurchasePreviewStore.setState({ state: "live" });
}
