import { afterEach, describe, expect, it, vi } from "vitest";
import { Capacitor } from "@capacitor/core";
import { Device } from "@capacitor/device";
import { BluetoothLowEnergy } from "@capawesome-team/capacitor-bluetooth-low-energy";
import {
  canOpenBluetoothFixSettings,
  getBluetoothReadiness,
  isBluetoothTransportSupported,
  openBluetoothFixSettings,
} from "@/lib/transport/ble/bluetooth";

function native(platform: "android" | "ios", sdk = 33): void {
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
  vi.mocked(Capacitor.getPlatform).mockReturnValue(platform);
  vi.mocked(Device.getInfo).mockResolvedValue({
    androidSDKVersion: sdk,
  } as Awaited<ReturnType<typeof Device.getInfo>>);
}

const denied = {
  bluetooth: "denied",
  bluetoothAdmin: "denied",
  bluetoothConnect: "denied",
  bluetoothScan: "denied",
  location: "denied",
} as const;

describe("getBluetoothReadiness", () => {
  afterEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.mocked(Capacitor.getPlatform).mockReturnValue("web");
  });

  it("is unsupported on the web", async () => {
    expect(isBluetoothTransportSupported()).toBe(false);
    await expect(getBluetoothReadiness()).resolves.toBe("unsupported");
    expect(BluetoothLowEnergy.initialize).not.toHaveBeenCalled();
  });

  it("is ready when everything is granted and on", async () => {
    native("android");

    await expect(getBluetoothReadiness()).resolves.toBe("ready");
    expect(BluetoothLowEnergy.initialize).toHaveBeenCalledWith({
      mode: "central",
    });
  });

  it("initializes the plugin once", async () => {
    native("android");

    await getBluetoothReadiness();
    await getBluetoothReadiness();

    expect(BluetoothLowEnergy.initialize).toHaveBeenCalledTimes(1);
  });

  it("is unsupported without Bluetooth LE hardware", async () => {
    native("android");
    vi.mocked(BluetoothLowEnergy.isAvailable).mockResolvedValue({
      isAvailable: false,
    });

    await expect(getBluetoothReadiness()).resolves.toBe("unsupported");
  });

  it("is disabled when Bluetooth is off", async () => {
    native("android");
    vi.mocked(BluetoothLowEnergy.isEnabled).mockResolvedValue({
      enabled: false,
    });

    await expect(getBluetoothReadiness()).resolves.toBe("disabled");
  });

  it("reports denied without asking unless told to", async () => {
    native("android");
    vi.mocked(BluetoothLowEnergy.checkPermissions).mockResolvedValue(denied);

    await expect(getBluetoothReadiness()).resolves.toBe("denied");
    expect(BluetoothLowEnergy.requestPermissions).not.toHaveBeenCalled();
  });

  it("asks for the Android 12 permissions", async () => {
    native("android", 33);
    vi.mocked(BluetoothLowEnergy.checkPermissions).mockResolvedValue(denied);

    await expect(getBluetoothReadiness({ request: true })).resolves.toBe(
      "ready",
    );
    expect(BluetoothLowEnergy.requestPermissions).toHaveBeenCalledWith({
      permissions: ["bluetoothScan", "bluetoothConnect"],
    });
  });

  it("asks for the legacy permissions and needs location on Android 11", async () => {
    native("android", 30);
    vi.mocked(BluetoothLowEnergy.checkPermissions).mockResolvedValue(denied);
    vi.mocked(BluetoothLowEnergy.isLocationEnabled).mockResolvedValue({
      enabled: false,
    });

    await expect(getBluetoothReadiness({ request: true })).resolves.toBe(
      "location_off",
    );
    expect(BluetoothLowEnergy.requestPermissions).toHaveBeenCalledWith({
      permissions: ["bluetooth", "bluetoothAdmin", "location"],
    });
  });

  it("stays denied when the user refuses", async () => {
    native("android");
    vi.mocked(BluetoothLowEnergy.checkPermissions).mockResolvedValue(denied);
    vi.mocked(BluetoothLowEnergy.requestPermissions).mockResolvedValue(denied);

    await expect(getBluetoothReadiness({ request: true })).resolves.toBe(
      "denied",
    );
  });

  it.each([
    ["Bluetooth is unauthorized", "denied"],
    ["Bluetooth is powered off", "disabled"],
    ["Bluetooth LE is unsupported", "unsupported"],
    ["something else", "disabled"],
  ])("maps the iOS failure %s", async (message, readiness) => {
    native("ios");
    vi.mocked(BluetoothLowEnergy.initialize).mockRejectedValue(
      new Error(message),
    );

    await expect(getBluetoothReadiness()).resolves.toBe(readiness);
  });

  it("tries to initialize again after a failure", async () => {
    native("ios");
    vi.mocked(BluetoothLowEnergy.initialize).mockRejectedValueOnce(
      new Error("powered off"),
    );

    await expect(getBluetoothReadiness()).resolves.toBe("disabled");
    await expect(getBluetoothReadiness()).resolves.toBe("ready");
  });

  it("is unsupported when Android initialization fails", async () => {
    native("android");
    vi.mocked(BluetoothLowEnergy.initialize).mockRejectedValue(
      new Error("no adapter"),
    );

    await expect(getBluetoothReadiness()).resolves.toBe("unsupported");
  });

  it("is unsupported when a check throws", async () => {
    native("android");
    vi.mocked(BluetoothLowEnergy.isAvailable).mockRejectedValue(
      new Error("boom"),
    );

    await expect(getBluetoothReadiness()).resolves.toBe("unsupported");
  });
});

describe("Bluetooth fix settings", () => {
  afterEach(() => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue("web");
  });

  it("opens app settings for a denied permission on any platform", async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue("ios");

    expect(canOpenBluetoothFixSettings("denied")).toBe(true);
    await openBluetoothFixSettings("denied");

    expect(BluetoothLowEnergy.openAppSettings).toHaveBeenCalled();
  });

  it("opens Bluetooth and location settings only on Android", async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue("android");

    expect(canOpenBluetoothFixSettings("disabled")).toBe(true);
    expect(canOpenBluetoothFixSettings("location_off")).toBe(true);
    await openBluetoothFixSettings("disabled");
    await openBluetoothFixSettings("location_off");

    expect(BluetoothLowEnergy.openBluetoothSettings).toHaveBeenCalled();
    expect(BluetoothLowEnergy.openLocationSettings).toHaveBeenCalled();
  });

  it("has nothing to open for iOS Bluetooth off or unsupported", async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue("ios");

    expect(canOpenBluetoothFixSettings("disabled")).toBe(false);
    expect(canOpenBluetoothFixSettings("unsupported")).toBe(false);
    await openBluetoothFixSettings("disabled");

    expect(BluetoothLowEnergy.openBluetoothSettings).not.toHaveBeenCalled();
  });

  it("swallows a settings failure", async () => {
    vi.mocked(BluetoothLowEnergy.openAppSettings).mockRejectedValue(
      new Error("nope"),
    );

    await expect(openBluetoothFixSettings("denied")).resolves.toBeUndefined();
  });
});
