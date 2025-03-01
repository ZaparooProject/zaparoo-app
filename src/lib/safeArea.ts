import { Capacitor } from "@capacitor/core";
import { SafeArea } from "capacitor-plugin-safe-area";

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

export const initSafeAreaInsets = async (
  setInsets: (insets: SafeAreaInsets) => void
) => {
  if (!Capacitor.isNativePlatform()) {
    setInsets(webInsets);
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
    setInsets({
      top: `${insets.top}px`,
      bottom: `${insets.bottom}px`,
      left: `${insets.left}px`,
      right: `${insets.right}px`
    });

    await SafeArea.addListener("safeAreaChanged", (data) => {
      setInsets({
        top: `${data.insets.top}px`,
        bottom: `${data.insets.bottom}px`,
        left: `${data.insets.left}px`,
        right: `${data.insets.right}px`
      });
    });
  } catch (e) {
    console.error(e);
  }
};
