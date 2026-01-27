import React, { useCallback, useEffect, useRef } from "react";
import { App, URLOpenListenerEvent } from "@capacitor/app";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { useStatusStore } from "./store";
import { logger } from "./logger";

// Deduplication window in milliseconds - prevents double-processing when both
// getLaunchUrl() and appUrlOpen fire for the same URL on cold start
const DEDUPE_WINDOW_MS = 1000;

const AppUrlListener: React.FC = () => {
  const { t } = useTranslation();
  const setRunQueue = useStatusStore((state) => state.setRunQueue);
  const setWriteQueue = useStatusStore((state) => state.setWriteQueue);

  // Track last processed URL with timestamp for time-based deduplication
  const lastProcessedRef = useRef<{ url: string; time: number } | null>(null);

  /**
   * Process a deep link URL and dispatch to appropriate queue.
   * Handles both /run and /write paths with a 'v' query parameter.
   * Uses time-based deduplication to prevent double-processing on cold start
   * while still allowing intentional repeat clicks.
   */
  const processUrl = useCallback(
    (urlString: string) => {
      const now = Date.now();

      // Skip if same URL was processed within deduplication window
      // This catches cold-start duplicates (getLaunchUrl + appUrlOpen)
      // but allows intentional repeat clicks after the window expires
      if (
        lastProcessedRef.current &&
        lastProcessedRef.current.url === urlString &&
        now - lastProcessedRef.current.time < DEDUPE_WINDOW_MS
      ) {
        logger.log("Skipping duplicate URL (within dedup window):", urlString);
        return;
      }

      lastProcessedRef.current = { url: urlString, time: now };

      try {
        const url = new URL(urlString);
        const path = url.pathname;
        const params = new URLSearchParams(url.search);
        const queryParams = Object.fromEntries(params.entries());
        const data = {
          path,
          queryParams,
        };
        logger.log("App URL opened:", data);

        if (path === "/run" && queryParams.v) {
          logger.log("Run queue:", queryParams.v);
          setRunQueue({ value: queryParams.v, unsafe: true });
        } else if (path === "/write" && queryParams.v) {
          logger.log("Write queue:", queryParams.v);
          setWriteQueue(queryParams.v);
        }
      } catch (error) {
        logger.error("Failed to parse deep link URL", error, {
          category: "general",
          action: "parseDeepLink",
          severity: "warning",
        });
        toast.error(t("deepLinks.invalidUrl"));
      }
    },
    [setRunQueue, setWriteQueue, t],
  );

  useEffect(() => {
    // Check for launch URL on cold start - this catches deep links that
    // arrived before the listener was registered (app was not running)
    App.getLaunchUrl().then((result) => {
      if (result?.url) {
        logger.log("App launched with URL:", result.url);
        processUrl(result.url);
      }
    });

    // Register listener for deep links while app is running
    let listenerHandle: Awaited<ReturnType<typeof App.addListener>> | null =
      null;

    App.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
      processUrl(event.url);
    }).then((handle) => {
      listenerHandle = handle;
    });

    // Cleanup listener on unmount to prevent memory leaks
    return () => {
      listenerHandle?.remove();
    };
  }, [processUrl]);

  return null;
};

export default AppUrlListener;
