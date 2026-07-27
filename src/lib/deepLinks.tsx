import { useCallback, useEffect, useRef } from "react";
import { App, URLOpenListenerEvent } from "@capacitor/app";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { useStatusStore } from "@/lib/store";
import { logger } from "@/lib/logger";

const DEDUPE_WINDOW_MS = 1000;
const DEEP_LINK_HOST = "zaparoo.app";
const CUSTOM_SCHEME_HOSTS = new Set(["", "app"]);
const LOG_VALUE_LIMIT = 50;

type ParsedDeepLink =
  | { type: "run"; value: string }
  | { type: "write"; value: string }
  | { type: "missingValue" }
  | { type: "unsupported" }
  | { type: "invalid"; error: Error };

// Tolerate trailing slashes and casing: "/Run/" and "/run" are the same action
const normalizeAction = (path: string): string =>
  path.toLowerCase().replace(/\/+$/, "");

export function parseDeepLink(urlString: string): ParsedDeepLink {
  try {
    const url = new URL(urlString);
    const scheme = url.protocol.replace(":", "").toLowerCase();

    if (scheme !== "https" && scheme !== "zaparoo") {
      return { type: "unsupported" };
    }

    if (scheme === "https" && url.host.toLowerCase() !== DEEP_LINK_HOST) {
      return { type: "unsupported" };
    }

    let path: string;
    if (scheme === "zaparoo") {
      const host = url.host.toLowerCase();
      if (host === "run" || host === "write") {
        // zaparoo://run?v=... parses the action as the URL host
        path = `/${host}${url.pathname}`;
      } else if (CUSTOM_SCHEME_HOSTS.has(host)) {
        // zaparoo:///run and zaparoo://app/run carry the action in the path
        path = url.pathname;
      } else {
        return { type: "unsupported" };
      }
    } else {
      path = url.pathname;
    }

    const action = normalizeAction(path);
    if (action !== "/run" && action !== "/write") {
      return { type: "unsupported" };
    }

    const value = url.searchParams.get("v");
    if (!value) {
      // Recognized action link without a payload - worth telling the user,
      // unlike arbitrary unsupported URLs
      return { type: "missingValue" };
    }

    if (action === "/run") {
      return { type: "run", value };
    }
    return { type: "write", value };
  } catch (error) {
    return {
      type: "invalid",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

export function useDeepLinks() {
  const { t } = useTranslation();
  const setRunQueue = useStatusStore((state) => state.setRunQueue);
  const setWriteQueue = useStatusStore((state) => state.setWriteQueue);
  const lastProcessedRef = useRef<{ url: string; time: number } | null>(null);

  const processUrl = useCallback(
    (urlString: string) => {
      const now = Date.now();

      if (
        lastProcessedRef.current &&
        lastProcessedRef.current.url === urlString &&
        now - lastProcessedRef.current.time < DEDUPE_WINDOW_MS
      ) {
        logger.log("Skipping duplicate URL (within dedup window)");
        return;
      }

      lastProcessedRef.current = { url: urlString, time: now };
      const parsed = parseDeepLink(urlString);
      logger.log("App URL opened:", { type: parsed.type });

      try {
        if (parsed.type === "run") {
          logger.log("Run queue:", parsed.value.slice(0, LOG_VALUE_LIMIT));
          setRunQueue({
            value: parsed.value,
            unsafe: true,
            source: "deepLink",
          });
        } else if (parsed.type === "write") {
          logger.log("Write queue:", parsed.value.slice(0, LOG_VALUE_LIMIT));
          setWriteQueue(parsed.value);
        } else if (parsed.type === "missingValue") {
          logger.warn("Deep link missing value param");
          toast.error(t("deepLinks.missingValue"));
        } else if (parsed.type === "invalid") {
          logger.error("Invalid deep link URL", parsed.error, {
            category: "general",
            action: "deepLinkParse",
            severity: "error",
          });
          toast.error(t("deepLinks.invalidUrl"));
        }
      } catch (error) {
        logger.error("Deep link dispatch failed", error, {
          category: "general",
          action: "deepLinkDispatch",
          severity: "error",
        });
      }
    },
    [setRunQueue, setWriteQueue, t],
  );

  // Keep the latest processUrl available without re-running the listener
  // effect: the listener must register exactly once. Re-registering on
  // dependency changes (e.g. i18n t identity) would drop events in the
  // remove/add gap and re-run App.getLaunchUrl(), double-firing the original
  // launch URL.
  const processUrlRef = useRef(processUrl);
  useEffect(() => {
    processUrlRef.current = processUrl;
  }, [processUrl]);

  useEffect(() => {
    let disposed = false;
    let listenerHandle: Awaited<ReturnType<typeof App.addListener>> | null =
      null;

    App.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
      processUrlRef.current(event.url);
    })
      .then((handle) => {
        if (disposed) {
          void handle.remove();
          return;
        }
        listenerHandle = handle;
      })
      .catch((error) => {
        logger.error("Failed to register deep link listener", error, {
          category: "lifecycle",
          action: "deepLinkListener",
          severity: "warning",
        });
      });

    App.getLaunchUrl()
      .then((result) => {
        if (!disposed && result?.url) {
          logger.log("App launched with URL");
          processUrlRef.current(result.url);
        }
      })
      .catch((error) => {
        logger.error("Failed to read launch URL", error, {
          category: "lifecycle",
          action: "getLaunchUrl",
          severity: "warning",
        });
      });

    return () => {
      disposed = true;
      void listenerHandle?.remove();
    };
  }, []);
}
