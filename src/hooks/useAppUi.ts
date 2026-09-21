import { useMemo } from "react";
import { Capacitor } from "@capacitor/core";
import {
  isAppPreviewAvailable,
  useAppPreviewStore,
} from "@/lib/appPreviewStore";
import { usePreferencesStore } from "@/lib/preferencesStore";

export interface AppUi {
  /** App-only UI may render: a real native app, or the dev app preview. */
  enabled: boolean;
  /** UI is standing in for a device, so nothing behind it is functional. */
  preview: boolean;
  nfc: boolean;
  camera: boolean;
  accelerometer: boolean;
}

/**
 * Gates UI that only exists in the native apps. Dev app preview reports every
 * capability as present so the screens can be reviewed in a browser; native
 * plugin calls must still be guarded with `Capacitor.isNativePlatform()`.
 */
export function useAppUi(): AppUi {
  const previewEnabled = useAppPreviewStore((state) => state.enabled);
  const nfcAvailable = usePreferencesStore((state) => state.nfcAvailable);
  const cameraAvailable = usePreferencesStore((state) => state.cameraAvailable);
  const accelerometerAvailable = usePreferencesStore(
    (state) => state.accelerometerAvailable,
  );

  return useMemo(() => {
    const preview = isAppPreviewAvailable() && previewEnabled;
    const native = Capacitor.isNativePlatform();

    return {
      enabled: native || preview,
      preview,
      nfc: preview || (native && nfcAvailable),
      camera: preview || (native && cameraAvailable),
      accelerometer: preview || (native && accelerometerAvailable),
    };
  }, [previewEnabled, nfcAvailable, cameraAvailable, accelerometerAvailable]);
}
