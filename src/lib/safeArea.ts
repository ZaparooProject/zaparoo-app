import { Capacitor } from "@capacitor/core";
import { EdgeToEdge } from "@capawesome/capacitor-android-edge-to-edge-support";
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

// The @capawesome/capacitor-android-edge-to-edge-support plugin handles edge-to-edge
// and applies proper insets. This handler synchronizes with the store.

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
          right: "env(safe-area-inset-right, 0px)"
        };
        setSafeInsets(webInsets);
        return;
      }

      // For Android, enable edge-to-edge and get insets
      if (Capacitor.getPlatform() === 'android') {
        try {
          await EdgeToEdge.enable();
          const insets = await EdgeToEdge.getInsets();
          setSafeInsets({
            top: `${insets.top}px`,
            bottom: `${insets.bottom}px`,
            left: `${insets.left}px`,
            right: `${insets.right}px`
          });
        } catch (error) {
          console.warn('EdgeToEdge plugin not available:', error);
          // Fallback to env() values
          setSafeInsets({
            top: "env(safe-area-inset-top, 0px)",
            bottom: "env(safe-area-inset-bottom, 0px)",
            left: "env(safe-area-inset-left, 0px)",
            right: "env(safe-area-inset-right, 0px)"
          });
        }
      } else {
        // For iOS, use env() values
        setSafeInsets({
          top: "env(safe-area-inset-top, 0px)",
          bottom: "env(safe-area-inset-bottom, 0px)",
          left: "env(safe-area-inset-left, 0px)",
          right: "env(safe-area-inset-right, 0px)"
        });
      }
    };

    initializeSafeArea();

    // Listen for orientation changes
    const handleOrientationChange = () => {
      setTimeout(initializeSafeArea, 200);
    };

    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, [setSafeInsets]);

  return null;
};
