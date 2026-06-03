import React, { useCallback, useEffect, useRef } from "react";
import { App, URLOpenListenerEvent } from "@capacitor/app";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { useStatusStore } from "./store";
import { logger } from "./logger";

const DEDUPE_WINDOW_MS = 1000;
const DEEP_LINK_HOST = "zaparoo.app";

type ParsedDeepLink =
  | { type: "run"; value: string }
  | { type: "write"; value: string }
  | { type: "unsupported" }
  | { type: "invalid" };

export function parseDeepLink(urlString: string): ParsedDeepLink {
  try {
    const url = new URL(urlString);
    const scheme = url.protocol.replace(":", "");

    if (scheme === "https" && url.host !== DEEP_LINK_HOST) {
      return { type: "unsupported" };
    }

    if (scheme !== "https" && scheme !== "zaparoo") {
      return { type: "unsupported" };
    }

    const path = url.pathname || (scheme === "zaparoo" ? `/${url.host}` : "");
    const value = url.searchParams.get("v");

    if (!value) {
      return { type: "unsupported" };
    }

    if (path === "/run") {
      return { type: "run", value };
    }

    if (path === "/write") {
      return { type: "write", value };
    }

    return { type: "unsupported" };
  } catch {
    return { type: "invalid" };
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
        logger.log("Skipping duplicate URL (within dedup window):", urlString);
        return;
      }

      lastProcessedRef.current = { url: urlString, time: now };
      const parsed = parseDeepLink(urlString);
      logger.log("App URL opened:", { url: urlString, parsed });

      try {
        if (parsed.type === "run") {
          logger.log("Run queue:", parsed.value);
          setRunQueue({ value: parsed.value, unsafe: true });
        } else if (parsed.type === "write") {
          logger.log("Write queue:", parsed.value);
          setWriteQueue(parsed.value);
        } else if (parsed.type === "invalid") {
          logger.warn("Invalid deep link URL", new Error("Invalid URL"));
          toast.error(t("deepLinks.invalidUrl"));
        }
      } catch (error) {
        logger.error("Deep link dispatch failed", error, {
          category: "general",
          action: "deepLinkDispatch",
        });
      }
    },
    [setRunQueue, setWriteQueue, t],
  );

  useEffect(() => {
    let disposed = false;
    let listenerHandle: Awaited<ReturnType<typeof App.addListener>> | null =
      null;

    App.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
      processUrl(event.url);
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
          logger.log("App launched with URL:", result.url);
          processUrl(result.url);
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
  }, [processUrl]);
}

const AppUrlListener: React.FC = () => {
  useDeepLinks();
  return null;
};

export default AppUrlListener;
