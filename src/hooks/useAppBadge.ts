import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@capawesome/capacitor-badge";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useStatusStore } from "@/lib/store";
import { logger } from "@/lib/logger";
import { isNativePluginAvailable } from "@/lib/capacitorBridge";

const isPromptPermission = (display: string) =>
  display === "prompt" || display === "prompt-with-rationale";

export function useAppBadge() {
  const inboxCount = useStatusStore((state) => state.inboxMessages.length);
  const appBadgeEnabled = usePreferencesStore((state) => state.appBadgeEnabled);
  const setAppBadgeEnabled = usePreferencesStore(
    (state) => state.setAppBadgeEnabled,
  );
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const previousEnabledRef = useRef(appBadgeEnabled);
  const rationaleHandledRef = useRef(false);
  const [showPermissionRationale, setShowPermissionRationale] = useState(false);
  const [showPermissionDeniedHelp, setShowPermissionDeniedHelp] =
    useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);

  useEffect(() => {
    const enabledByUser = appBadgeEnabled && !previousEnabledRef.current;
    previousEnabledRef.current = appBadgeEnabled;
    if (enabledByUser) {
      rationaleHandledRef.current = false;
    }

    if (!isNativePluginAvailable("Badge")) return;

    let cancelled = false;

    const syncBadge = async () => {
      if (cancelled) return;

      try {
        const support = await Badge.isSupported();
        if (!support.isSupported || cancelled) return;

        const permission = await Badge.checkPermissions();
        if (cancelled) return;

        if (!appBadgeEnabled) {
          if (permission.display === "granted") {
            await Badge.set({ count: 0 });
          }
          return;
        }

        if (permission.display === "granted") {
          await Badge.set({ count: inboxCount });
          return;
        }

        if (
          isPromptPermission(permission.display) &&
          (inboxCount > 0 || enabledByUser) &&
          !rationaleHandledRef.current
        ) {
          setShowPermissionRationale(true);
          return;
        }

        if (permission.display === "denied") {
          setAppBadgeEnabled(false);
          if (enabledByUser) {
            setShowPermissionDeniedHelp(true);
          }
        }
      } catch (error) {
        if (cancelled) return;

        logger.error("Failed to sync app icon badge", error, {
          category: "general",
          action: "appBadge.sync",
          severity: "warning",
        });
      }
    };

    syncQueueRef.current = syncQueueRef.current
      .catch(() => undefined)
      .then(syncBadge);

    return () => {
      cancelled = true;
    };
  }, [appBadgeEnabled, inboxCount, setAppBadgeEnabled]);

  const declinePermissionRationale = useCallback(() => {
    rationaleHandledRef.current = true;
    setAppBadgeEnabled(false);
    setShowPermissionRationale(false);
  }, [setAppBadgeEnabled]);

  const dismissPermissionDeniedHelp = useCallback(() => {
    setShowPermissionDeniedHelp(false);
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isNativePluginAvailable("Badge")) return;

    rationaleHandledRef.current = true;
    setIsRequestingPermission(true);
    try {
      const permission = await Badge.requestPermissions();
      if (permission.display === "granted") {
        setAppBadgeEnabled(true);
        const currentCount = useStatusStore.getState().inboxMessages.length;
        await Badge.set({ count: currentCount });
      } else {
        setAppBadgeEnabled(false);
        setShowPermissionDeniedHelp(true);
      }
      setShowPermissionRationale(false);
    } catch (error) {
      logger.error("Failed to request app icon badge permission", error, {
        category: "general",
        action: "appBadge.requestPermission",
        severity: "warning",
      });
    } finally {
      setIsRequestingPermission(false);
    }
  }, [setAppBadgeEnabled]);

  return {
    showPermissionRationale,
    showPermissionDeniedHelp,
    isRequestingPermission,
    declinePermissionRationale,
    dismissPermissionDeniedHelp,
    requestPermission,
  };
}
