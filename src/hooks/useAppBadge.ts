import { useEffect } from "react";
import { Badge } from "@capawesome/capacitor-badge";
import { useStatusStore } from "@/lib/store";
import { logger } from "@/lib/logger";
import { isNativePluginAvailable } from "@/lib/capacitorBridge";

export function useAppBadge() {
  const inboxCount = useStatusStore((state) => state.inboxMessages.length);

  useEffect(() => {
    if (!isNativePluginAvailable("Badge")) return;

    let cancelled = false;

    const syncBadge = async () => {
      try {
        const support = await Badge.isSupported();
        if (!support.isSupported || cancelled) return;

        let permission = await Badge.checkPermissions();
        if (
          inboxCount > 0 &&
          (permission.display === "prompt" ||
            permission.display === "prompt-with-rationale")
        ) {
          permission = await Badge.requestPermissions();
        }

        if (permission.display !== "granted" || cancelled) return;

        await Badge.set({ count: inboxCount });
      } catch (error) {
        if (cancelled) return;

        logger.error("Failed to sync app icon badge", error, {
          category: "general",
          action: "appBadge.sync",
          severity: "warning",
        });
      }
    };

    void syncBadge();

    return () => {
      cancelled = true;
    };
  }, [inboxCount]);
}
