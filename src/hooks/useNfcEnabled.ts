import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { logger } from "@/lib/logger";

/**
 * Whether Android's system NFC toggle is on. Re-checked when the app comes
 * back to the foreground, because the fix for it being off is to leave for
 * Android settings and return - a one-shot check would still say "disabled".
 *
 * Any other platform reports true: iOS has no equivalent user toggle, and the
 * dev preview has no plugin to ask.
 */
export function useNfcEnabled(): boolean {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!import.meta.env.PROD || Capacitor.getPlatform() !== "android") {
      return;
    }

    let disposed = false;
    let listener: PluginListenerHandle | null = null;

    const check = () => {
      Nfc.isEnabled()
        .then((result) => {
          if (!disposed) setEnabled(result.isEnabled);
        })
        .catch((error) => {
          logger.debug("NFC enabled check failed:", error);
        });
    };

    check();
    void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive && !disposed) check();
    }).then((handle) => {
      if (disposed) {
        void handle.remove();
        return;
      }
      listener = handle;
    });

    return () => {
      disposed = true;
      void listener?.remove();
    };
  }, []);

  return enabled;
}
