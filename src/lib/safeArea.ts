import { Capacitor } from "@capacitor/core";
import { SafeArea } from "capacitor-plugin-safe-area";
import { useEffect } from "react";
import { useStatusStore } from "./store";
import { logger } from "./logger";

export interface SafeAreaInsets {
  top: string;
  bottom: string;
  left: string;
  right: string;
}

export const defaultSafeAreaInsets: SafeAreaInsets = {
  top: "0px",
  bottom: "0px",
  left: "0px",
  right: "0px",
};

export const SafeAreaHandler = () => {
  const setSafeInsets = useStatusStore((state) => state.setSafeInsets);

  useEffect(() => {
    const initializeSafeArea = async () => {
      // For web platforms, use env() values directly
      if (!Capacitor.isNativePlatform()) {
        const webInsets = {
          top: "env(safe-area-inset-top, 0px)",
          bottom: "env(safe-area-inset-bottom, 0px)",
          left: "env(safe-area-inset-left, 0px)",
          right: "env(safe-area-inset-right, 0px)",
        };
        setSafeInsets(webInsets);
        return;
      }

      // For native platforms (iOS and Android), use the SafeArea plugin
      try {
        const { insets } = await SafeArea.getSafeAreaInsets();
        setSafeInsets({
          top: `${insets.top}px`,
          bottom: `${insets.bottom}px`,
          left: `${insets.left}px`,
          right: `${insets.right}px`,
        });
      } catch (error) {
        logger.warn("SafeArea plugin not available:", error);
        // Fallback to env() values
        setSafeInsets({
          top: "env(safe-area-inset-top, 0px)",
          bottom: "env(safe-area-inset-bottom, 0px)",
          left: "env(safe-area-inset-left, 0px)",
          right: "env(safe-area-inset-right, 0px)",
        });
      }
    };

    initializeSafeArea();

    // Listen for safe area changes (e.g., orientation changes, keyboard)
    let listenerHandle: { remove: () => Promise<void> } | null = null;

    SafeArea.addListener("safeAreaChanged", (data) => {
      const { insets } = data;
      setSafeInsets({
        top: `${insets.top}px`,
        bottom: `${insets.bottom}px`,
        left: `${insets.left}px`,
        right: `${insets.right}px`,
      });
    })
      .then((handle) => {
        listenerHandle = handle;
      })
      .catch((error) => {
        logger.warn("Failed to add SafeArea listener:", error);
      });

    return () => {
      listenerHandle?.remove();
    };
  }, [setSafeInsets]);

  return null;
};
