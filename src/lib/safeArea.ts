import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
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

async function removeSafeAreaListener(
  handle: PluginListenerHandle,
): Promise<void> {
  try {
    await handle.remove();
  } catch (error) {
    logger.error("Failed to remove safe area listener", error, {
      category: "lifecycle",
      action: "removeSafeAreaListener",
      severity: "warning",
    });
  }
}

export const initSafeAreaInsets = async (
  setInsets: (insets: SafeAreaInsets) => void,
  listen = true,
  isActive: () => boolean = () => true,
): Promise<PluginListenerHandle | null> => {
  if (!Capacitor.isNativePlatform()) {
    if (isActive()) setInsets(webInsets);
    return null;
  }

  try {
    const { insets } = await SafeArea.getSafeAreaInsets();
    if (!isActive()) return null;

    setInsets({
      top: `${insets.top}px`,
      bottom: `${insets.bottom}px`,
      left: `${insets.left}px`,
      right: `${insets.right}px`,
    });

    if (!listen) {
      return null;
    }

    return await SafeArea.addListener("safeAreaChanged", (data) => {
      if (!isActive()) return;
      setInsets({
        top: `${data.insets.top}px`,
        bottom: `${data.insets.bottom}px`,
        left: `${data.insets.left}px`,
        right: `${data.insets.right}px`,
      });
    });
  } catch (e) {
    logger.error("Failed to get safe area insets:", e);
    return null;
  }
};

export const SafeAreaHandler = () => {
  const setSafeInsets = useStatusStore((state) => state.setSafeInsets);

  useEffect(() => {
    let disposed = false;
    let listener: PluginListenerHandle | null = null;

    void initSafeAreaInsets(setSafeInsets, true, () => !disposed).then(
      (handle) => {
        if (disposed) {
          if (handle) void removeSafeAreaListener(handle);
          return;
        }
        listener = handle;
      },
    );

    return () => {
      disposed = true;
      if (listener) void removeSafeAreaListener(listener);
    };
  }, [setSafeInsets]);

  return null;
};
