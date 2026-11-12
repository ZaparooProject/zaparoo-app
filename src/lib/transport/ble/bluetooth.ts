/**
 * Whether the phone can use Bluetooth LE right now, and the permission prompts
 * it takes to get there. Bluetooth is native only: the web build and the build
 * Core serves itself have no radio access.
 */

import { Capacitor } from "@capacitor/core";
import { Device } from "@capacitor/device";
import {
  BluetoothLowEnergy,
  type BluetoothLowEnergyPermissionType,
} from "@capawesome-team/capacitor-bluetooth-low-energy";
import { logger } from "@/lib/logger";

export type BluetoothReadiness =
  /** Scanning and connecting can start. */
  | "ready"
  /** No Bluetooth LE on this phone or build. */
  | "unsupported"
  /** Bluetooth is switched off. */
  | "disabled"
  /** The user has not allowed the app to use Bluetooth. */
  | "denied"
  /** Android 11 and older need location services on to scan. */
  | "location_off";

let initialized: Promise<void> | null = null;

export function isBluetoothTransportSupported(): boolean {
  return Capacitor.isNativePlatform();
}

function initialize(): Promise<void> {
  initialized ??= BluetoothLowEnergy.initialize({ mode: "central" }).catch(
    (error: unknown) => {
      initialized = null;
      throw error;
    },
  );
  return initialized;
}

async function androidSdk(): Promise<number> {
  try {
    const info = await Device.getInfo();
    return info.androidSDKVersion ?? 31;
  } catch {
    return 31;
  }
}

/** The runtime permissions scanning and connecting need on this Android. */
function permissionsFor(sdk: number): BluetoothLowEnergyPermissionType[] {
  return sdk >= 31
    ? ["bluetoothScan", "bluetoothConnect"]
    : ["bluetooth", "bluetoothAdmin", "location"];
}

function allGranted(
  status: Record<string, string | undefined>,
  permissions: BluetoothLowEnergyPermissionType[],
): boolean {
  return permissions.every((permission) => status[permission] === "granted");
}

/** Maps the iOS initialization failure, which is how iOS reports state. */
function iosReadinessFromError(error: unknown): BluetoothReadiness {
  const message = error instanceof Error ? error.message : String(error);
  if (/unauthori[sz]ed/i.test(message)) return "denied";
  if (/powered off|bluetooth.*off/i.test(message)) return "disabled";
  if (/unsupported/i.test(message)) return "unsupported";
  return "disabled";
}

/**
 * Checks, and with `request` asks for, everything scanning needs. Never
 * switches Bluetooth or location on itself; the caller shows the state and
 * offers the settings shortcut.
 */
export async function getBluetoothReadiness(
  options: { request?: boolean } = {},
): Promise<BluetoothReadiness> {
  if (!isBluetoothTransportSupported()) return "unsupported";
  const platform = Capacitor.getPlatform();

  try {
    await initialize();
  } catch (error) {
    if (platform === "ios") return iosReadinessFromError(error);
    logger.warn("Bluetooth initialization failed", error, {
      category: "bluetooth",
      action: "initialize",
    });
    return "unsupported";
  }

  try {
    const { isAvailable } = await BluetoothLowEnergy.isAvailable();
    if (!isAvailable) return "unsupported";

    if (platform === "android") {
      const sdk = await androidSdk();
      const permissions = permissionsFor(sdk);
      let status = (await BluetoothLowEnergy.checkPermissions()) as Record<
        string,
        string | undefined
      >;
      if (!allGranted(status, permissions) && options.request) {
        status = (await BluetoothLowEnergy.requestPermissions({
          permissions,
        })) as Record<string, string | undefined>;
      }
      if (!allGranted(status, permissions)) return "denied";
      if (sdk < 31) {
        const { enabled } = await BluetoothLowEnergy.isLocationEnabled();
        if (!enabled) return "location_off";
      }
    }

    const { enabled } = await BluetoothLowEnergy.isEnabled();
    return enabled ? "ready" : "disabled";
  } catch (error) {
    logger.warn("Bluetooth readiness check failed", error, {
      category: "bluetooth",
      action: "readiness",
    });
    return "unsupported";
  }
}

/** Opens the settings screen that fixes a readiness problem, where one exists. */
export async function openBluetoothFixSettings(
  readiness: BluetoothReadiness,
): Promise<void> {
  const platform = Capacitor.getPlatform();
  try {
    if (readiness === "denied") {
      await BluetoothLowEnergy.openAppSettings();
    } else if (readiness === "disabled" && platform === "android") {
      await BluetoothLowEnergy.openBluetoothSettings();
    } else if (readiness === "location_off" && platform === "android") {
      await BluetoothLowEnergy.openLocationSettings();
    }
  } catch (error) {
    logger.warn("Could not open Bluetooth settings", error, {
      category: "bluetooth",
      action: "open-settings",
    });
  }
}

/** Whether a readiness state has a settings screen the app can open. */
export function canOpenBluetoothFixSettings(
  readiness: BluetoothReadiness,
): boolean {
  if (readiness === "denied") return true;
  return (
    Capacitor.getPlatform() === "android" &&
    (readiness === "disabled" || readiness === "location_off")
  );
}

export function __resetBluetoothReadinessForTests(): void {
  initialized = null;
}
