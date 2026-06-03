import { Capacitor } from "@capacitor/core";

export function isPluginAvailable(pluginName: string): boolean {
  try {
    return Capacitor.isPluginAvailable(pluginName);
  } catch {
    return false;
  }
}

export function isNativePluginAvailable(pluginName: string): boolean {
  try {
    return Capacitor.isNativePlatform() && isPluginAvailable(pluginName);
  } catch {
    return false;
  }
}

export function isCapacitorPluginUnavailableError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return /not implemented|not available|plugin.*missing|plugin.*not.*found|plugin.*not.*implemented/i.test(
    message,
  );
}
