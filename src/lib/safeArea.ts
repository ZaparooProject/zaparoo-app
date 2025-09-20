import { Capacitor } from "@capacitor/core";
import { SafeArea } from "capacitor-plugin-safe-area";
import { useEffect } from "react";
import { useStatusStore } from "./store";

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
  right: "0px"
};

const webInsets = {
  top: "env(safe-area-inset-top, 0px)",
  bottom: "env(safe-area-inset-bottom, 0px)",
  left: "env(safe-area-inset-left, 0px)",
  right: "env(safe-area-inset-right, 0px)"
};

const setCSSCustomProperties = (insets: SafeAreaInsets) => {
  const root = document.documentElement;
  root.style.setProperty('--safe-area-top', insets.top);
  root.style.setProperty('--safe-area-bottom', insets.bottom);
  root.style.setProperty('--safe-area-left', insets.left);
  root.style.setProperty('--safe-area-right', insets.right);
};

export const initSafeAreaInsets = async (
  setInsets: (insets: SafeAreaInsets) => void,
  listen = true
) => {
  if (!Capacitor.isNativePlatform()) {
    setInsets(webInsets);
    setCSSCustomProperties(webInsets);
  }

  if (Capacitor.getPlatform() === "android") {
    try {
      await SafeArea.setImmersiveNavigationBar();
    } catch (e) {
      console.error(e);
    }
  }

  try {
    const { insets } = await SafeArea.getSafeAreaInsets();
    const safeAreaInsets = {
      top: `${insets.top}px`,
      bottom: `${insets.bottom}px`,
      left: `${insets.left}px`,
      right: `${insets.right}px`
    };

    setInsets(safeAreaInsets);
    setCSSCustomProperties(safeAreaInsets);

    if (!listen) {
      return;
    }

    await SafeArea.addListener("safeAreaChanged", (data) => {
      const updatedInsets = {
        top: `${data.insets.top}px`,
        bottom: `${data.insets.bottom}px`,
        left: `${data.insets.left}px`,
        right: `${data.insets.right}px`
      };
      setInsets(updatedInsets);
      setCSSCustomProperties(updatedInsets);
    });
  } catch (e) {
    console.error(e);
  }
};

export const SafeAreaHandler = () => {
  const setSafeInsets = useStatusStore((state) => state.setSafeInsets);

  useEffect(() => {
    initSafeAreaInsets(setSafeInsets);
  }, [setSafeInsets]);

  return null;
};
