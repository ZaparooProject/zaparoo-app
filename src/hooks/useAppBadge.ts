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
  const pendingEnableTransitionRef = useRef(false);
  const rationaleHandledRef = useRef(false);
  const [showPermissionRationale, setShowPermissionRationale] = useState(false);
  const [showPermissionDeniedHelp, setShowPermissionDeniedHelp] =
    useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);

  useEffect(() => {
    const enabledByUser = appBadgeEnabled && !previousEnabledRef.current;
    previousEnabledRef.current = appBadgeEnabled;
    if (enabledByUser) {
      pendingEnableTransitionRef.current = true;
      rationaleHandledRef.current = false;
    } else if (!appBadgeEnabled) {
      pendingEnableTransitionRef.current = false;
    }

    if (!isNativePluginAvailable("Badge")) return;

    let cancelled = false;

    const syncBadge = async () => {
      if (cancelled) return;

      try {
        const support = await Badge.isSupported();
        if (cancelled) return;
        if (!support.isSupported) {
          pendingEnableTransitionRef.current = false;
          return;
        }

        const permission = await Badge.checkPermissions();
        if (cancelled) return;

        const isEnableTransition = pendingEnableTransitionRef.current;

        if (!appBadgeEnabled) {
          if (permission.display === "granted") {
            await Badge.set({ count: 0 });
          }
          return;
        }

        if (permission.display === "granted") {
          await Badge.set({ count: inboxCount });
          if (!cancelled) {
            pendingEnableTransitionRef.current = false;
          }
          return;
        }

        if (
          isPromptPermission(permission.display) &&
          (inboxCount > 0 || isEnableTransition) &&
          !rationaleHandledRef.current
        ) {
          setShowPermissionRationale(true);
          pendingEnableTransitionRef.current = false;
          return;
        }

        if (permission.display === "denied") {
          setAppBadgeEnabled(false);
          if (isEnableTransition) {
            setShowPermissionDeniedHelp(true);
          }
        }
        pendingEnableTransitionRef.current = false;
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

  const dismissPermissionRationale = useCallback(() => {
    rationaleHandledRef.current = true;
    setShowPermissionRationale(false);
  }, []);

  const declinePermissionRationale = useCallback(() => {
    dismissPermissionRationale();
    setAppBadgeEnabled(false);
  }, [dismissPermissionRationale, setAppBadgeEnabled]);

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
    dismissPermissionRationale,
    declinePermissionRationale,
    dismissPermissionDeniedHelp,
    requestPermission,
  };
}
