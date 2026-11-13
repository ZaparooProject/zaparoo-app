import { BLE_DEFAULT_WINDOW, BLE_PROTOCOL_VERSION } from "./constants";

/** Core's Info characteristic, readable before authenticating. */
export interface BleInfo {
  version: number;
  /** Core's device id; the same id `device.endpoints` reports. */
  deviceId: string;
  /** Largest message Core accepts once authenticated. */
  maxMessage: number;
  /** Largest message Core accepts before authenticating. */
  maxUnauthenticated: number;
  preferredMtu: number;
  /** Chunks Core sends without an acknowledgement. */
  window: number;
}

export class BleInfoError extends Error {
  constructor(
    readonly kind: "malformed" | "unsupported_version",
    message: string,
  ) {
    super(message);
    this.name = "BleInfoError";
  }
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

/** Parses Info, refusing a protocol version this app does not speak. */
export function parseBleInfo(bytes: Uint8Array | readonly number[]): BleInfo {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder().decode(
        bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
      ),
    );
  } catch {
    throw new BleInfoError("malformed", "Info is not JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new BleInfoError("malformed", "Info is not an object");
  }
  const info = parsed as Record<string, unknown>;
  if (info.v !== BLE_PROTOCOL_VERSION) {
    throw new BleInfoError(
      "unsupported_version",
      `Bluetooth protocol version ${String(info.v)} is not supported`,
    );
  }
  const deviceId =
    typeof info.deviceId === "string" ? info.deviceId.trim() : "";
  if (deviceId === "") {
    throw new BleInfoError("malformed", "Info has no device id");
  }
  return {
    version: BLE_PROTOCOL_VERSION,
    deviceId,
    maxMessage: positiveInteger(info.maxMessage, 4 * 1024 * 1024),
    maxUnauthenticated: positiveInteger(info.maxUnauthenticated, 64 * 1024),
    preferredMtu: positiveInteger(info.preferredMtu, 512),
    window: positiveInteger(info.window, BLE_DEFAULT_WINDOW),
  };
}
