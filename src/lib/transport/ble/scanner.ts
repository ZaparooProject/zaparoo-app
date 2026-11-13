/** Finds nearby Zaparoo Core devices advertising the API service. */

import { Capacitor } from "@capacitor/core";
import { BluetoothLowEnergy } from "@capawesome-team/capacitor-bluetooth-low-energy";
import { logger } from "@/lib/logger";
import { BLE_SERVICE_UUID } from "./constants";

export interface NearbyBluetoothDevice {
  /** The phone's handle for the peripheral: a MAC on Android, a UUID on iOS. */
  peripheralId: string;
  name: string;
  rssi?: number;
}

export interface BluetoothScan {
  stop: () => Promise<void>;
}

interface ScannedEvent {
  id: string;
  name?: string;
  localName?: string;
  rssi?: number;
  serviceUuids?: string[];
}

function advertisesService(event: ScannedEvent): boolean {
  const uuids = event.serviceUuids;
  if (uuids === undefined || uuids.length === 0) {
    // iOS filters by service natively; Android does not, so an advertisement
    // there must name the service itself.
    return Capacitor.getPlatform() === "ios";
  }
  return uuids.some(
    (uuid) => uuid.toLowerCase() === BLE_SERVICE_UUID.toLowerCase(),
  );
}

/**
 * Starts scanning and reports each Core once per scan, with updates when its
 * name or signal changes. The caller must check readiness first.
 */
export async function startBluetoothScan(
  onDevice: (device: NearbyBluetoothDevice) => void,
): Promise<BluetoothScan> {
  const seen = new Map<string, NearbyBluetoothDevice>();
  const handle = await BluetoothLowEnergy.addListener(
    "deviceScanned",
    (event: ScannedEvent) => {
      if (!event.id || !advertisesService(event)) return;
      const previous = seen.get(event.id);
      const name =
        event.localName?.trim() || event.name?.trim() || previous?.name || "";
      const device: NearbyBluetoothDevice = {
        peripheralId: event.id,
        name,
        rssi: event.rssi ?? previous?.rssi,
      };
      if (
        previous &&
        previous.name === device.name &&
        previous.rssi === device.rssi
      ) {
        return;
      }
      seen.set(event.id, device);
      onDevice(device);
    },
  );

  try {
    await BluetoothLowEnergy.startScan({ serviceIds: [BLE_SERVICE_UUID] });
  } catch (error) {
    await handle.remove();
    throw error;
  }

  let stopped = false;
  return {
    stop: async () => {
      if (stopped) return;
      stopped = true;
      await handle.remove();
      try {
        await BluetoothLowEnergy.stopScan();
      } catch (error) {
        logger.debug("Stopping the Bluetooth scan failed", error);
      }
    },
  };
}

/**
 * Scans until a peripheral passes `match`, the timeout passes or `signal`
 * aborts. Used to find a known Core again when its peripheral handle has
 * changed or a connect to it hangs.
 */
export async function findBluetoothDevice(
  match: (device: NearbyBluetoothDevice) => Promise<boolean>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<NearbyBluetoothDevice | null> {
  return new Promise((resolve) => {
    let settled = false;
    let scan: BluetoothScan | null = null;
    const checking = new Set<string>();
    const finish = (device: NearbyBluetoothDevice | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void scan?.stop();
      resolve(device);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    if (signal?.aborted) {
      finish(null);
      return;
    }
    signal?.addEventListener("abort", () => finish(null), { once: true });
    startBluetoothScan((device) => {
      if (settled || checking.has(device.peripheralId)) return;
      checking.add(device.peripheralId);
      void match(device)
        .then((ok) => {
          if (ok) finish(device);
        })
        .catch(() => undefined);
    })
      .then((started) => {
        scan = started;
        if (settled) void started.stop();
      })
      .catch((error: unknown) => {
        logger.debug("Bluetooth scan failed", error);
        finish(null);
      });
  });
}
