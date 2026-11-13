import { vi } from "vitest";

type BleEventCallback = (event?: unknown) => void;
const listeners: Map<string, BleEventCallback[]> = new Map();

export enum ConnectionPriority {
  BALANCED = 0,
  HIGH = 1,
  LOW_POWER = 2,
}

function defaults() {
  return {
    initialize: () => Promise.resolve(undefined),
    isAvailable: () => Promise.resolve({ isAvailable: true }),
    isEnabled: () => Promise.resolve({ enabled: true }),
    isLocationEnabled: () => Promise.resolve({ enabled: true }),
    checkPermissions: () =>
      Promise.resolve({
        bluetooth: "granted",
        bluetoothAdmin: "granted",
        bluetoothConnect: "granted",
        bluetoothScan: "granted",
        location: "granted",
      }),
    requestPermissions: () =>
      Promise.resolve({
        bluetooth: "granted",
        bluetoothAdmin: "granted",
        bluetoothConnect: "granted",
        bluetoothScan: "granted",
        location: "granted",
      }),
    openAppSettings: () => Promise.resolve(undefined),
    openBluetoothSettings: () => Promise.resolve(undefined),
    openLocationSettings: () => Promise.resolve(undefined),
    startScan: () => Promise.resolve(undefined),
    stopScan: () => Promise.resolve(undefined),
    connect: () => Promise.resolve(undefined),
    disconnect: () => Promise.resolve(undefined),
    discoverServices: () => Promise.resolve(undefined),
    requestMtu: () => Promise.resolve(undefined),
    requestConnectionPriority: () => Promise.resolve(undefined),
    readCharacteristic: () => Promise.resolve({ value: [] as number[] }),
    writeCharacteristic: () => Promise.resolve(undefined),
    startCharacteristicNotifications: () => Promise.resolve(undefined),
    stopCharacteristicNotifications: () => Promise.resolve(undefined),
  };
}

const methods = defaults();
type MethodName = keyof typeof methods;

export const BluetoothLowEnergy = {
  ...(Object.fromEntries(
    Object.entries(methods).map(([name, impl]) => [
      name,
      vi.fn().mockImplementation(impl),
    ]),
  ) as {
    [K in MethodName]: ReturnType<typeof vi.fn>;
  }),
  addListener: vi
    .fn()
    .mockImplementation(
      async (eventName: string, callback: BleEventCallback) => {
        const eventListeners = listeners.get(eventName) || [];
        eventListeners.push(callback);
        listeners.set(eventName, eventListeners);
        return {
          remove: vi.fn().mockImplementation(async () => {
            const current = listeners.get(eventName) || [];
            const index = current.indexOf(callback);
            if (index > -1) current.splice(index, 1);
          }),
        };
      },
    ),
  removeAllListeners: vi.fn().mockImplementation(async () => {
    listeners.clear();
  }),
};

function emit(eventName: string, event: unknown): void {
  for (const callback of [...(listeners.get(eventName) || [])]) {
    callback(event);
  }
}

/** Simulates a notification on a characteristic. */
export function __simulateCharacteristicChanged(event: {
  deviceId: string;
  characteristicId: string;
  serviceId?: string;
  value: number[];
}): void {
  emit("characteristicChanged", event);
}

/** Simulates an advertisement seen during a scan. */
export function __simulateDeviceScanned(event: {
  id: string;
  name?: string;
  localName?: string;
  rssi?: number;
  serviceUuids?: string[];
}): void {
  emit("deviceScanned", event);
}

/** Simulates the peripheral dropping the connection. */
export function __simulateDeviceDisconnected(deviceId: string): void {
  emit("deviceDisconnected", { deviceId });
}

export function __bluetoothListenerCount(eventName: string): number {
  return listeners.get(eventName)?.length ?? 0;
}

/** Reset the mock state between tests. */
export function __resetBluetoothMock(): void {
  listeners.clear();
  for (const [name, impl] of Object.entries(defaults())) {
    BluetoothLowEnergy[name as MethodName].mockReset().mockImplementation(impl);
  }
  BluetoothLowEnergy.addListener.mockClear();
  BluetoothLowEnergy.removeAllListeners.mockClear();
}
