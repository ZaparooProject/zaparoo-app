import { Capacitor } from "@capacitor/core";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { logger } from "./logger";

/** A point on the phone, as fractions of its width and height. */
export interface AntennaPoint {
  x: number;
  y: number;
}

/**
 * Where to tell the user to hold a tag:
 * - `placed`: the OS reported antenna positions (Android 14+).
 * - `topEdge`: iPhone, which always reads at the top edge.
 * - `broad`: unknown, so a broad area on the back.
 */
export type AntennaSpot =
  | { kind: "placed"; points: AntennaPoint[]; aspectRatio: number }
  | { kind: "topEdge" }
  | { kind: "broad" };

const clampFraction = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Looks up the antenna position for the guide. Android reports positions in
 * millimetres from the top-left corner with the screen facing the user;
 * `getAntennaInfo` needs Android 14, so any failure or empty answer falls back
 * to the broad area.
 */
export async function getAntennaSpot(): Promise<AntennaSpot> {
  if (!Capacitor.isNativePlatform()) return { kind: "broad" };

  const platform = Capacitor.getPlatform();
  if (platform === "ios") return { kind: "topEdge" };
  if (platform !== "android") return { kind: "broad" };

  try {
    const info = await Nfc.getAntennaInfo();
    const { deviceWidth, deviceHeight, availableAntennas } = info;
    if (
      !(deviceWidth > 0) ||
      !(deviceHeight > 0) ||
      !Array.isArray(availableAntennas) ||
      availableAntennas.length === 0
    ) {
      return { kind: "broad" };
    }
    return {
      kind: "placed",
      aspectRatio: deviceWidth / deviceHeight,
      points: availableAntennas.map((antenna) => ({
        x: clampFraction(antenna.locationX / deviceWidth),
        y: clampFraction(antenna.locationY / deviceHeight),
      })),
    };
  } catch (error) {
    logger.debug("NFC antenna info unavailable:", error);
    return { kind: "broad" };
  }
}
