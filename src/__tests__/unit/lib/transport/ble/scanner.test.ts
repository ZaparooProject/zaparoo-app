import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Capacitor } from "@capacitor/core";
import { BluetoothLowEnergy } from "@capawesome-team/capacitor-bluetooth-low-energy";
import {
  __bluetoothListenerCount,
  __simulateDeviceScanned,
} from "../../../../../../__mocks__/@capawesome-team/capacitor-bluetooth-low-energy";
import { BLE_SERVICE_UUID } from "@/lib/transport/ble/constants";
import {
  findBluetoothDevice,
  startBluetoothScan,
} from "@/lib/transport/ble/scanner";

const SERVICE = [BLE_SERVICE_UUID.toUpperCase()];

describe("startBluetoothScan", () => {
  beforeEach(() => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue("android");
  });

  afterEach(() => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue("web");
  });

  it("scans for the API service and reports each Core", async () => {
    const onDevice = vi.fn();
    await startBluetoothScan(onDevice);

    __simulateDeviceScanned({
      id: "A",
      name: "Fallback",
      localName: " Living Room ",
      rssi: -60,
      serviceUuids: SERVICE,
    });

    expect(BluetoothLowEnergy.startScan).toHaveBeenCalledWith({
      serviceIds: [BLE_SERVICE_UUID],
    });
    expect(onDevice).toHaveBeenCalledWith({
      peripheralId: "A",
      name: "Living Room",
      rssi: -60,
    });
  });

  it("reports a Core again only when its name or signal changes", async () => {
    const onDevice = vi.fn();
    await startBluetoothScan(onDevice);

    __simulateDeviceScanned({
      id: "A",
      name: "Core",
      rssi: -60,
      serviceUuids: SERVICE,
    });
    __simulateDeviceScanned({ id: "A", rssi: -60, serviceUuids: SERVICE });
    __simulateDeviceScanned({ id: "A", rssi: -50, serviceUuids: SERVICE });

    expect(onDevice).toHaveBeenCalledTimes(2);
    expect(onDevice).toHaveBeenLastCalledWith({
      peripheralId: "A",
      name: "Core",
      rssi: -50,
    });
  });

  it("skips Android advertisements that do not name the service", async () => {
    const onDevice = vi.fn();
    await startBluetoothScan(onDevice);

    __simulateDeviceScanned({ id: "A", name: "Headphones" });
    __simulateDeviceScanned({ id: "B", serviceUuids: ["180d"] });
    __simulateDeviceScanned({ id: "", serviceUuids: SERVICE });

    expect(onDevice).not.toHaveBeenCalled();
  });

  it("trusts iOS service filtering when the advertisement has no list", async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue("ios");
    const onDevice = vi.fn();
    await startBluetoothScan(onDevice);

    __simulateDeviceScanned({ id: "A" });

    expect(onDevice).toHaveBeenCalledWith({
      peripheralId: "A",
      name: "",
      rssi: undefined,
    });
  });

  it("stops scanning and listening once", async () => {
    const scan = await startBluetoothScan(vi.fn());

    await scan.stop();
    await scan.stop();

    expect(BluetoothLowEnergy.stopScan).toHaveBeenCalledTimes(1);
    expect(__bluetoothListenerCount("deviceScanned")).toBe(0);
  });

  it("removes its listener when the scan cannot start", async () => {
    vi.mocked(BluetoothLowEnergy.startScan).mockRejectedValue(
      new Error("busy"),
    );

    await expect(startBluetoothScan(vi.fn())).rejects.toThrow("busy");
    expect(__bluetoothListenerCount("deviceScanned")).toBe(0);
  });
});

describe("findBluetoothDevice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(Capacitor.getPlatform).mockReturnValue("android");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(Capacitor.getPlatform).mockReturnValue("web");
  });

  it("resolves with the first device that matches and stops scanning", async () => {
    const match = vi.fn(
      async (device: { peripheralId: string }) => device.peripheralId === "B",
    );
    const finding = findBluetoothDevice(match, 5000);
    await vi.advanceTimersByTimeAsync(0);

    __simulateDeviceScanned({ id: "A", serviceUuids: SERVICE });
    __simulateDeviceScanned({ id: "A", rssi: -40, serviceUuids: SERVICE });
    __simulateDeviceScanned({ id: "B", serviceUuids: SERVICE });

    await expect(finding).resolves.toMatchObject({ peripheralId: "B" });
    expect(match).toHaveBeenCalledTimes(2);
    expect(BluetoothLowEnergy.stopScan).toHaveBeenCalled();
  });

  it("resolves null after the timeout", async () => {
    const finding = findBluetoothDevice(async () => false, 5000);
    await vi.advanceTimersByTimeAsync(5000);

    await expect(finding).resolves.toBeNull();
    expect(BluetoothLowEnergy.stopScan).toHaveBeenCalled();
  });

  it("resolves null and stops scanning when aborted", async () => {
    const scanning = new AbortController();
    const finding = findBluetoothDevice(
      async () => false,
      5000,
      scanning.signal,
    );
    await vi.advanceTimersByTimeAsync(0);

    scanning.abort();

    await expect(finding).resolves.toBeNull();
    expect(BluetoothLowEnergy.stopScan).toHaveBeenCalled();
  });

  it("does not scan when already aborted", async () => {
    const scanning = new AbortController();
    scanning.abort();

    await expect(
      findBluetoothDevice(async () => true, 5000, scanning.signal),
    ).resolves.toBeNull();
    expect(BluetoothLowEnergy.startScan).not.toHaveBeenCalled();
  });

  it("resolves null when the scan cannot start", async () => {
    vi.mocked(BluetoothLowEnergy.startScan).mockRejectedValue(
      new Error("busy"),
    );

    await expect(
      findBluetoothDevice(async () => true, 5000),
    ).resolves.toBeNull();
  });
});
