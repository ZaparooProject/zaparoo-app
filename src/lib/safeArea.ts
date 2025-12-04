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

const webInsets = {
  top: "env(safe-area-inset-top, 0px)",
  bottom: "env(safe-area-inset-bottom, 0px)",
  left: "env(safe-area-inset-left, 0px)",
  right: "env(safe-area-inset-right, 0px)",
};

export const initSafeAreaInsets = async (
  setInsets: (insets: SafeAreaInsets) => void,
  listen = true,
) => {
  if (!Capacitor.isNativePlatform()) {
    setInsets(webInsets);
    return;
  }

  try {
    const { insets } = await SafeArea.getSafeAreaInsets();
    setInsets({
      top: `${insets.top}px`,
      bottom: `${insets.bottom}px`,
      left: `${insets.left}px`,
      right: `${insets.right}px`,
    });

    if (!listen) {
      return;
    }

    await SafeArea.addListener("safeAreaChanged", (data) => {
      setInsets({
        top: `${data.insets.top}px`,
        bottom: `${data.insets.bottom}px`,
        left: `${data.insets.left}px`,
        right: `${data.insets.right}px`,
      });
    });
  } catch (e) {
    logger.error("Failed to get safe area insets:", e);
  }
};

export const SafeAreaHandler = () => {
  const setSafeInsets = useStatusStore((state) => state.setSafeInsets);

  useEffect(() => {
    initSafeAreaInsets(setSafeInsets);
  }, [setSafeInsets]);

  return null;
};
