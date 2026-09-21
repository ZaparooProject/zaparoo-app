/**
 * How a token reached the app. The home page leads with whichever mode last
 * produced one, so the phone's primary reader is the one the person uses.
 */
export type ScanMode = "nfc" | "camera";

export function isScanMode(value: unknown): value is ScanMode {
  return value === "nfc" || value === "camera";
}
