import { useEffect, useRef, useState } from "react";
import { useAppUi } from "@/hooks/useAppUi";
import { usePreferencesStore } from "@/lib/preferencesStore";
import type { ScanMode } from "@/lib/scanMode";

export interface ScanLayout {
  /** Reader action shown first, based on the last successful scan mode. */
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
  lastScanMode: ScanMode | null,
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

  // NFC leads unless the camera is demonstrably this person's reader.
  return lastScanMode === "camera"
    ? {
        leading: "camera",
        alternate: "nfc",
        canScan: true,
        showEmptyState: false,
      }
    : {
        leading: "nfc",
        alternate: "camera",
        canScan: true,
        showEmptyState: false,
      };
}

/**
 * Decides which scan action leads. The result is latched rather than derived
 * live: reordering actions as a scan succeeds would move the control under the
 * user's finger. A new order lands on the next visit.
 */
export function useHomeScanLayout(): ScanLayout {
  const appUi = useAppUi();
  const hasHydrated = usePreferencesStore((state) => state._hasHydrated);
  const lastScanMode = usePreferencesStore((state) => state.lastScanMode);

  const [layout, setLayout] = useState<ScanLayout>(() =>
    resolveScanLayout(appUi.nfc, appUi.camera, null, appUi.enabled),
  );
  const latchedRef = useRef(false);
  const capabilityKeyRef = useRef(`${appUi.nfc}:${appUi.camera}`);

  useEffect(() => {
    const capabilityKey = `${appUi.nfc}:${appUi.camera}`;
    const capabilitiesChanged = capabilityKeyRef.current !== capabilityKey;

    // Latch once preferences are known, and again whenever the hardware the
    // page can offer actually changes.
    if (!hasHydrated || (latchedRef.current && !capabilitiesChanged)) {
      capabilityKeyRef.current = capabilityKey;
      return;
    }

    capabilityKeyRef.current = capabilityKey;
    latchedRef.current = true;
    setLayout(
      resolveScanLayout(appUi.nfc, appUi.camera, lastScanMode, appUi.enabled),
    );
  }, [appUi.nfc, appUi.camera, appUi.enabled, hasHydrated, lastScanMode]);

  return layout;
}
