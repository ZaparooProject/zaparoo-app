import { useEffect, useState } from "react";
import { ScreenReader } from "@capacitor/screen-reader";
import { Capacitor } from "@capacitor/core";

/**
 * Hook that detects if a screen reader (VoiceOver/TalkBack) is currently enabled.
 *
 * @returns true if a screen reader is active, false otherwise.
 *          Always returns false on web since detection isn't available there.
 */
export function useScreenReaderEnabled(): boolean {
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    // Screen reader detection only works on native platforms
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    // Check initial state
    ScreenReader.isEnabled().then(({ value }) => {
      setIsEnabled(value);
    });

    // Listen for changes
    const listener = ScreenReader.addListener("stateChange", ({ value }) => {
      setIsEnabled(value);
    });

    return () => {
      listener.then((l) => l.remove());
    };
  }, []);

  return isEnabled;
}
