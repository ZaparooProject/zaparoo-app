import { useMemo } from "react";
import { useAppUi } from "@/hooks/useAppUi";
import type { ScanMode } from "@/lib/scanMode";

export interface ScanLayout {
  /** Reader action shown first: NFC whenever the phone has it. */
  leading: ScanMode | null;
  /** Other available reader action shown second. */
  alternate: ScanMode | null;
  /** The app can act as a reader at all. */
  canScan: boolean;
  /** App-only UI applies, but the phone has no reader hardware. */
  showEmptyState: boolean;
}

export function resolveScanLayout(
  nfc: boolean,
  camera: boolean,
  appUiEnabled: boolean,
): ScanLayout {
  if (!nfc && !camera) {
    return {
      leading: null,
      alternate: null,
      canScan: false,
      showEmptyState: appUiEnabled,
    };
  }

  if (nfc && !camera) {
    return {
      leading: "nfc",
      alternate: null,
      canScan: true,
      showEmptyState: false,
    };
  }

  if (camera && !nfc) {
    return {
      leading: "camera",
      alternate: null,
      canScan: true,
      showEmptyState: false,
    };
  }

  // The order is fixed, so the page looks the same on every phone and visit.
  return {
    leading: "nfc",
    alternate: "camera",
    canScan: true,
    showEmptyState: false,
  };
}

/**
 * The scan actions this phone can offer, in their fixed order: Tap a tag,
 * then Scan a code.
 */
export function useHomeScanLayout(): ScanLayout {
  const appUi = useAppUi();

  return useMemo(
    () => resolveScanLayout(appUi.nfc, appUi.camera, appUi.enabled),
    [appUi.nfc, appUi.camera, appUi.enabled],
  );
}
