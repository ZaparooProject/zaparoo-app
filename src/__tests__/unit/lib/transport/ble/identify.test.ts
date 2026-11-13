import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BluetoothLowEnergy } from "@capawesome-team/capacitor-bluetooth-low-energy";
import {
  __bluetoothListenerCount,
  __simulateDeviceDisconnected,
} from "../../../../../../__mocks__/@capawesome-team/capacitor-bluetooth-low-energy";
import {
  IDENTIFIED_LINK_HOLD_MS,
  identifyBluetoothDevice,
  takeIdentifiedLink,
} from "@/lib/transport/ble/identify";
import {
  BleLinkAbortedError,
  BleLinkDroppedError,
} from "@/lib/transport/ble/link";

const info = (value: unknown) =>
  Array.from(new TextEncoder().encode(JSON.stringify(value)));

describe("identifyBluetoothDevice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(BluetoothLowEnergy.readCharacteristic).mockResolvedValue({
      value: info({ v: 1, deviceId: "core-1" }),
    });
  });

  afterEach(async () => {
    // Release whatever a test left held.
    await takeIdentifiedLink("AA")?.close();
    await takeIdentifiedLink("BB")?.close();
    vi.useRealTimers();
  });

  it("reads Info and holds the link for a while", async () => {
    await expect(identifyBluetoothDevice("AA")).resolves.toMatchObject({
      deviceId: "core-1",
    });
    expect(BluetoothLowEnergy.disconnect).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(IDENTIFIED_LINK_HOLD_MS);

    expect(BluetoothLowEnergy.disconnect).toHaveBeenCalledWith({
      deviceId: "AA",
    });
    expect(__bluetoothListenerCount("characteristicChanged")).toBe(0);
    expect(takeIdentifiedLink("AA")).toBeNull();
  });

  it("hands the held link over", async () => {
    await identifyBluetoothDevice("AA");

    const link = takeIdentifiedLink("AA");

    expect(link?.info.deviceId).toBe("core-1");
    expect(takeIdentifiedLink("AA")).toBeNull();
    await vi.advanceTimersByTimeAsync(IDENTIFIED_LINK_HOLD_MS);
    expect(BluetoothLowEnergy.disconnect).not.toHaveBeenCalled();
    expect(link?.closed).toBe(false);
  });

  it("holds only the link to the peripheral asked for", async () => {
    await identifyBluetoothDevice("AA");

    expect(takeIdentifiedLink("BB")).toBeNull();
    expect(takeIdentifiedLink("AA")).not.toBeNull();
  });

  it("closes the held link when another device is identified", async () => {
    await identifyBluetoothDevice("AA");
    await identifyBluetoothDevice("BB");

    expect(BluetoothLowEnergy.disconnect).toHaveBeenCalledWith({
      deviceId: "AA",
    });
    expect(takeIdentifiedLink("AA")).toBeNull();
    expect(takeIdentifiedLink("BB")).not.toBeNull();
  });

  it("forgets a held link that drops", async () => {
    await identifyBluetoothDevice("AA");

    __simulateDeviceDisconnected("AA");

    expect(takeIdentifiedLink("AA")).toBeNull();
  });

  it("connects again once when the peripheral drops while opening", async () => {
    vi.mocked(BluetoothLowEnergy.discoverServices).mockImplementationOnce(
      async () => {
        __simulateDeviceDisconnected("AA");
      },
    );

    await expect(identifyBluetoothDevice("AA")).resolves.toMatchObject({
      deviceId: "core-1",
    });
    expect(BluetoothLowEnergy.connect).toHaveBeenCalledTimes(2);
    expect(takeIdentifiedLink("AA")?.closed).toBe(false);
  });

  it("reports each step of a first connection", async () => {
    const onStep = vi.fn();

    await identifyBluetoothDevice("AA", { onStep });

    expect(onStep.mock.calls.map(([step]) => step)).toEqual([
      "connecting",
      "pairing",
      "reading",
    ]);
  });

  it("reports the second connection as securing", async () => {
    vi.mocked(BluetoothLowEnergy.discoverServices).mockImplementationOnce(
      async () => {
        __simulateDeviceDisconnected("AA");
      },
    );
    const onStep = vi.fn();

    await identifyBluetoothDevice("AA", { onStep });

    expect(onStep.mock.calls.map(([step]) => step)).toEqual([
      "connecting",
      "pairing",
      "securing",
      "reading",
    ]);
  });

  it("stops when cancelled while opening", async () => {
    vi.mocked(BluetoothLowEnergy.discoverServices).mockImplementation(
      () => new Promise<void>(() => undefined),
    );
    const controller = new AbortController();

    const identifying = identifyBluetoothDevice("AA", {
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();

    await expect(identifying).rejects.toBeInstanceOf(BleLinkAbortedError);
    expect(BluetoothLowEnergy.connect).toHaveBeenCalledTimes(1);
    expect(BluetoothLowEnergy.disconnect).toHaveBeenCalled();
    expect(takeIdentifiedLink("AA")).toBeNull();
  });

  it("does not connect again when cancelled as the peripheral drops", async () => {
    const controller = new AbortController();
    vi.mocked(BluetoothLowEnergy.discoverServices).mockImplementationOnce(
      async () => {
        __simulateDeviceDisconnected("AA");
        controller.abort();
      },
    );

    await expect(
      identifyBluetoothDevice("AA", { signal: controller.signal }),
    ).rejects.toBeInstanceOf(BleLinkAbortedError);
    expect(BluetoothLowEnergy.connect).toHaveBeenCalledTimes(1);
  });

  it("gives up when the peripheral drops while opening twice", async () => {
    vi.mocked(BluetoothLowEnergy.discoverServices)
      .mockImplementationOnce(async () => {
        __simulateDeviceDisconnected("AA");
      })
      .mockImplementationOnce(async () => {
        __simulateDeviceDisconnected("AA");
      });

    await expect(identifyBluetoothDevice("AA")).rejects.toBeInstanceOf(
      BleLinkDroppedError,
    );
    expect(BluetoothLowEnergy.connect).toHaveBeenCalledTimes(2);
    expect(takeIdentifiedLink("AA")).toBeNull();
  });

  it("does not connect again after a failure other than a drop", async () => {
    vi.mocked(BluetoothLowEnergy.connect).mockRejectedValueOnce(
      new Error("timeout"),
    );

    await expect(identifyBluetoothDevice("AA")).rejects.toThrow("timeout");
    expect(BluetoothLowEnergy.connect).toHaveBeenCalledTimes(1);
  });

  it("fails for a device that does not speak this protocol", async () => {
    vi.mocked(BluetoothLowEnergy.readCharacteristic).mockResolvedValue({
      value: info({ v: 9, deviceId: "core-1" }),
    });

    await expect(identifyBluetoothDevice("AA")).rejects.toThrow("version");
    expect(BluetoothLowEnergy.disconnect).toHaveBeenCalled();
  });
});
