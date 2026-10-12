import { Clipboard } from "@capacitor/clipboard";
import { Capacitor } from "@capacitor/core";

/** Native clipboard in the apps, the browser clipboard everywhere else. */
export async function writeToClipboard(text: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Clipboard.write({ string: text });
  } else {
    await navigator.clipboard.writeText(text);
  }
}
