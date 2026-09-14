import { useEffect, useState } from "react";
import { ScreenReader } from "@capacitor/screen-reader";
import { Capacitor } from "@capacitor/core";

// Last state any mounted hook detected. A remounted list starts in its settled
// layout, so its page restores scroll against the height it was saved from.
let lastDetected: boolean | undefined;

export function __resetScreenReaderDetectionForTests(): void {
  lastDetected = undefined;
}

/**
 * Hook that detects if a screen reader (VoiceOver/TalkBack) is currently enabled.
 *
 * @returns true if a screen reader is active, false otherwise.
 *          Always returns false on web since detection isn't available there.
 */
export function useScreenReaderEnabled(): boolean {
  // Start native sessions in accessible mode until plugin detection resolves,
  // avoiding a brief inaccessible virtualized tree for screen-reader users.
  const [isEnabled, setIsEnabled] = useState(
    () => Capacitor.isNativePlatform() && (lastDetected ?? true),
  );

  useEffect(() => {
    // Screen reader detection only works on native platforms
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    // A detection that resolves after unmount could overwrite a newer mount's
    // result, so only an active effect records it.
    let active = true;
    const update = (value: boolean) => {
      if (!active) return;
      lastDetected = value;
      setIsEnabled(value);
    };

    // Check initial state
    ScreenReader.isEnabled()
      .then(({ value }) => update(value))
      .catch(() => update(false));

    // Listen for changes
    const listener = ScreenReader.addListener("stateChange", ({ value }) => {
      update(value);
    });

    return () => {
      active = false;
      listener.then((l) => l.remove());
    };
  }, []);

  return isEnabled;
}
