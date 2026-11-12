import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Capacitor } from "@capacitor/core";
import { BluetoothLowEnergy } from "@capawesome-team/capacitor-bluetooth-low-energy";
import {
  __bluetoothListenerCount,
  __simulateCharacteristicChanged,
  __simulateDeviceDisconnected,
} from "../../../../../../__mocks__/@capawesome-team/capacitor-bluetooth-low-energy";
import {
  BLE_BOND_CHAR_UUID,
  BLE_INFO_CHAR_UUID,
  BLE_IOS_ASSUMED_MTU,
  BLE_RX_CHAR_UUID,
  BLE_TX_CHAR_UUID,
} from "@/lib/transport/ble/constants";
import { Chunker, encodeAck, parseChunk } from "@/lib/transport/ble/frame";
import {
  BLE_BOND_TIMEOUT_MS,
  BLE_DISCOVERY_WAIT_MS,
  BLE_WRITE_TIMEOUT_MS,
  BleLink,
  BleLinkDroppedError,
  type BleLinkHandlers,
} from "@/lib/transport/ble/link";

const PERIPHERAL = "AA:BB:CC:DD:EE:FF";
const TAG = 0x1234;

function infoBytes(overrides: Record<string, unknown> = {}): number[] {
  return Array.from(
    new TextEncoder().encode(
      JSON.stringify({
        v: 1,
        deviceId: "core-1",
        preferredMtu: 247,
        window: 4,
        ...overrides,
      }),
    ),
  );
}

function handlers() {
  return {
    onMessage: vi.fn<(message: Uint8Array) => void>(),
    onClose: vi.fn<(reason: string) => void>(),
    onActivity: vi.fn<() => void>(),
    onThroughput: vi.fn<(bytesPerSecond: number) => void>(),
  } satisfies BleLinkHandlers;
}

function notify(chunk: Uint8Array, deviceId = PERIPHERAL): void {
  __simulateCharacteristicChanged({
    deviceId,
    characteristicId: BLE_TX_CHAR_UUID.toUpperCase(),
    value: Array.from(chunk),
  });
}

function writtenChunks(): Uint8Array[] {
  return vi
    .mocked(BluetoothLowEnergy.writeCharacteristic)
    .mock.calls.map(([options]: [{ value: number[] }]) =>
      Uint8Array.from(options.value),
    );
}

const text = (value: string) => new TextEncoder().encode(value);

describe("BleLink", () => {
  beforeEach(() => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue("android");
    vi.mocked(BluetoothLowEnergy.readCharacteristic).mockResolvedValue({
      value: infoBytes(),
    });
  });

  afterEach(() => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue("web");
  });

  it("opens, reads Info and subscribes to TX", async () => {
    const link = await BleLink.open(PERIPHERAL, handlers(), { tag: TAG });

    expect(link.info.deviceId).toBe("core-1");
    expect(link.tag).toBe(TAG);
    expect(BluetoothLowEnergy.connect).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: PERIPHERAL }),
    );
    expect(
      BluetoothLowEnergy.startCharacteristicNotifications,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ characteristicId: BLE_TX_CHAR_UUID }),
    );
  });

  it("waits for the bond before reading Info and subscribing", async () => {
    const order: string[] = [];
    vi.mocked(BluetoothLowEnergy.readCharacteristic).mockImplementation(
      async (options: { characteristicId: string }) => {
        order.push(`read:${options.characteristicId}`);
        return { value: infoBytes() };
      },
    );
    vi.mocked(
      BluetoothLowEnergy.startCharacteristicNotifications,
    ).mockImplementation(async () => {
      order.push("subscribe");
    });

    await BleLink.open(PERIPHERAL, handlers(), { tag: TAG });

    expect(order).toEqual([
      `read:${BLE_BOND_CHAR_UUID}`,
      `read:${BLE_INFO_CHAR_UUID}`,
      "subscribe",
    ]);
    expect(BluetoothLowEnergy.readCharacteristic).toHaveBeenCalledWith(
      expect.objectContaining({
        characteristicId: BLE_BOND_CHAR_UUID,
        timeout: BLE_BOND_TIMEOUT_MS,
      }),
    );
  });

  it("keeps asking for discovery while the pairing prompt holds it", async () => {
    vi.mocked(BluetoothLowEnergy.discoverServices)
      .mockRejectedValueOnce(new Error("Operation timed out"))
      .mockRejectedValueOnce(new Error("Operation timed out"))
      .mockResolvedValueOnce(undefined);

    await BleLink.open(PERIPHERAL, handlers(), { tag: TAG });

    expect(BluetoothLowEnergy.discoverServices).toHaveBeenCalledTimes(3);
    expect(BluetoothLowEnergy.discoverServices).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: BLE_DISCOVERY_WAIT_MS }),
    );
  });

  it("gives up on discovery once the pairing prompt's time has passed", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    vi.mocked(BluetoothLowEnergy.discoverServices).mockImplementation(
      async () => {
        now.mockReturnValue(BLE_BOND_TIMEOUT_MS);
        throw new Error("Operation timed out");
      },
    );

    await expect(
      BleLink.open(PERIPHERAL, handlers(), { tag: TAG }),
    ).rejects.toThrow("Operation timed out");
    expect(BluetoothLowEnergy.discoverServices).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });

  it("does not ask for discovery again after another failure", async () => {
    vi.mocked(BluetoothLowEnergy.discoverServices).mockRejectedValue(
      new Error("discovery failed"),
    );

    await expect(
      BleLink.open(PERIPHERAL, handlers(), { tag: TAG }),
    ).rejects.toThrow("discovery failed");
    expect(BluetoothLowEnergy.discoverServices).toHaveBeenCalledTimes(1);
  });

  it("stops asking for discovery once the peripheral drops", async () => {
    vi.mocked(BluetoothLowEnergy.discoverServices).mockImplementation(
      async () => {
        __simulateDeviceDisconnected(PERIPHERAL);
        throw new Error("Operation timed out");
      },
    );

    await expect(
      BleLink.open(PERIPHERAL, handlers(), { tag: TAG }),
    ).rejects.toBeInstanceOf(BleLinkDroppedError);
    expect(BluetoothLowEnergy.discoverServices).toHaveBeenCalledTimes(1);
  });

  it("opens without a bond when Bond cannot be read", async () => {
    vi.mocked(BluetoothLowEnergy.readCharacteristic).mockRejectedValueOnce(
      new Error("characteristic not found"),
    );

    const link = await BleLink.open(PERIPHERAL, handlers(), { tag: TAG });

    expect(link.info.deviceId).toBe("core-1");
    expect(link.closed).toBe(false);
  });

  it("asks for a large MTU on Android and caps it at Core's preference", async () => {
    const link = await BleLink.open(PERIPHERAL, handlers(), { tag: TAG });

    expect(BluetoothLowEnergy.requestMtu).toHaveBeenCalledWith(
      expect.objectContaining({ mtu: 512 }),
    );
    expect(BluetoothLowEnergy.requestConnectionPriority).toHaveBeenCalled();
    expect(link.chunkMtu).toBe(247);
  });

  it("uses the default MTU when Android refuses a larger one", async () => {
    vi.mocked(BluetoothLowEnergy.requestMtu).mockRejectedValue(
      new Error("refused"),
    );

    const link = await BleLink.open(PERIPHERAL, handlers(), { tag: TAG });

    expect(link.chunkMtu).toBe(23);
  });

  it("assumes the iOS MTU without asking", async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue("ios");
    vi.mocked(BluetoothLowEnergy.readCharacteristic).mockResolvedValue({
      value: infoBytes({ preferredMtu: 512 }),
    });

    const link = await BleLink.open(PERIPHERAL, handlers(), { tag: TAG });

    expect(BluetoothLowEnergy.requestMtu).not.toHaveBeenCalled();
    expect(link.chunkMtu).toBe(BLE_IOS_ASSUMED_MTU);
  });

  it("cleans up and throws when connecting fails", async () => {
    vi.mocked(BluetoothLowEnergy.connect).mockRejectedValue(
      new Error("timeout"),
    );

    const opening = BleLink.open(PERIPHERAL, handlers(), { tag: TAG });

    await expect(opening).rejects.toThrow("timeout");
    await expect(opening).rejects.not.toBeInstanceOf(BleLinkDroppedError);
    expect(__bluetoothListenerCount("characteristicChanged")).toBe(0);
    expect(__bluetoothListenerCount("deviceDisconnected")).toBe(0);
    expect(BluetoothLowEnergy.disconnect).toHaveBeenCalled();
  });

  it("throws when the peripheral drops while opening", async () => {
    vi.mocked(BluetoothLowEnergy.discoverServices).mockImplementation(
      async () => {
        __simulateDeviceDisconnected(PERIPHERAL);
      },
    );
    const h = handlers();

    await expect(
      BleLink.open(PERIPHERAL, h, { tag: TAG }),
    ).rejects.toBeInstanceOf(BleLinkDroppedError);
    expect(h.onClose).not.toHaveBeenCalled();
  });

  it("reports a drop at once while a step is still waiting", async () => {
    vi.mocked(BluetoothLowEnergy.discoverServices).mockImplementation(
      () => new Promise<void>(() => undefined),
    );
    vi.mocked(BluetoothLowEnergy.connect).mockImplementation(async () => {
      queueMicrotask(() => __simulateDeviceDisconnected(PERIPHERAL));
    });

    await expect(
      BleLink.open(PERIPHERAL, handlers(), { tag: TAG }),
    ).rejects.toBeInstanceOf(BleLinkDroppedError);
    expect(BluetoothLowEnergy.readCharacteristic).not.toHaveBeenCalled();
    expect(BluetoothLowEnergy.disconnect).toHaveBeenCalled();
  });

  it("reports a drop when a step fails because the peripheral dropped", async () => {
    vi.mocked(BluetoothLowEnergy.discoverServices).mockImplementation(
      async () => {
        __simulateDeviceDisconnected(PERIPHERAL);
        throw new Error("Peripheral disconnected");
      },
    );

    await expect(
      BleLink.open(PERIPHERAL, handlers(), { tag: TAG }),
    ).rejects.toBeInstanceOf(BleLinkDroppedError);
  });

  it("hands messages and closes to new handlers after rebind", async () => {
    const first = handlers();
    const link = await BleLink.open(PERIPHERAL, first, { tag: TAG });
    const next = handlers();

    expect(link.rebind(next)).toBe(true);
    for (const chunk of new Chunker(TAG).split(text("hi"), 23)) notify(chunk);
    __simulateDeviceDisconnected(PERIPHERAL);

    expect(next.onMessage).toHaveBeenCalledWith(text("hi"));
    expect(next.onClose).toHaveBeenCalledWith("peripheral disconnected");
    expect(first.onMessage).not.toHaveBeenCalled();
    expect(first.onClose).not.toHaveBeenCalled();
  });

  it("refuses to rebind a closed link", async () => {
    const link = await BleLink.open(PERIPHERAL, handlers(), { tag: TAG });
    await link.close();

    expect(link.rebind(handlers())).toBe(false);
  });

  it("reads Info again", async () => {
    const link = await BleLink.open(PERIPHERAL, handlers(), { tag: TAG });
    vi.mocked(BluetoothLowEnergy.readCharacteristic).mockResolvedValueOnce({
      value: infoBytes({ deviceId: "core-2" }),
    });

    await expect(link.readInfo()).resolves.toMatchObject({
      deviceId: "core-2",
    });
    expect(link.closed).toBe(false);
  });

  it("closes the link when reading Info fails", async () => {
    const h = handlers();
    const link = await BleLink.open(PERIPHERAL, h, { tag: TAG });
    vi.mocked(BluetoothLowEnergy.readCharacteristic).mockRejectedValueOnce(
      new Error("timed out"),
    );

    await expect(link.readInfo()).rejects.toThrow("timed out");
    expect(link.closed).toBe(true);
    expect(h.onClose).toHaveBeenCalledWith("info read failed");
    await expect(link.readInfo()).rejects.toThrow("closed");
  });

  it("reassembles a message Core sends in several chunks", async () => {
    const h = handlers();
    await BleLink.open(PERIPHERAL, h, { tag: TAG });
    const message = text("x".repeat(100));

    for (const chunk of new Chunker(TAG).split(message, 23)) notify(chunk);

    expect(h.onMessage).toHaveBeenCalledTimes(1);
    expect(h.onMessage.mock.calls[0]![0]).toEqual(message);
    expect(h.onActivity).toHaveBeenCalled();
  });

  it("ignores chunks for another session or peripheral", async () => {
    const h = handlers();
    await BleLink.open(PERIPHERAL, h, { tag: TAG });

    for (const chunk of new Chunker(0x9999).split(text("hi"), 23)) {
      notify(chunk);
    }
    for (const chunk of new Chunker(TAG).split(text("hi"), 23)) {
      notify(chunk, "11:22:33:44:55:66");
    }

    expect(h.onMessage).not.toHaveBeenCalled();
    expect(h.onActivity).not.toHaveBeenCalled();
  });

  it("acknowledges every half window", async () => {
    await BleLink.open(PERIPHERAL, handlers(), { tag: TAG });
    const chunks = new Chunker(TAG).split(text("y".repeat(60)), 23);
    expect(chunks.length).toBeGreaterThanOrEqual(4);

    notify(chunks[0]!);
    expect(BluetoothLowEnergy.writeCharacteristic).not.toHaveBeenCalled();
    notify(chunks[1]!);

    await vi.waitFor(() =>
      expect(writtenChunks()).toEqual([encodeAck(TAG, 2)]),
    );
    expect(BluetoothLowEnergy.writeCharacteristic).toHaveBeenCalledWith(
      expect.objectContaining({
        characteristicId: BLE_RX_CHAR_UUID,
        timeout: BLE_WRITE_TIMEOUT_MS,
      }),
    );
  });

  it("never sends acknowledgements out of order", async () => {
    await BleLink.open(PERIPHERAL, handlers(), { tag: TAG });
    let finishWrite: () => void = () => undefined;
    vi.mocked(BluetoothLowEnergy.writeCharacteristic).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = resolve;
        }),
    );
    const chunks = new Chunker(TAG).split(text("z".repeat(200)), 23);
    expect(chunks.length).toBeGreaterThanOrEqual(6);

    // The first acknowledgement is in flight while two more come due.
    for (const chunk of chunks.slice(0, 6)) notify(chunk);
    finishWrite();

    await vi.waitFor(() =>
      expect(writtenChunks()).toEqual([encodeAck(TAG, 2), encodeAck(TAG, 6)]),
    );
  });

  it("reports throughput for a message of four or more chunks", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1000);
    const h = handlers();
    await BleLink.open(PERIPHERAL, h, { tag: TAG });
    const message = text("z".repeat(80));
    const chunks = new Chunker(TAG).split(message, 23);
    expect(chunks.length).toBeGreaterThanOrEqual(4);

    notify(chunks[0]!);
    now.mockReturnValue(1500);
    for (const chunk of chunks.slice(1)) notify(chunk);

    expect(h.onThroughput).toHaveBeenCalledWith(message.length * 2);
    now.mockRestore();
  });

  it("closes on a framing error", async () => {
    const h = handlers();
    await BleLink.open(PERIPHERAL, h, { tag: TAG });

    notify(new Uint8Array([1]));

    expect(h.onClose).toHaveBeenCalledWith(
      expect.stringContaining("framing error"),
    );
    await vi.waitFor(() =>
      expect(__bluetoothListenerCount("characteristicChanged")).toBe(0),
    );
  });

  it("closes when the peripheral disconnects", async () => {
    const h = handlers();
    const link = await BleLink.open(PERIPHERAL, h, { tag: TAG });

    __simulateDeviceDisconnected(PERIPHERAL);

    expect(h.onClose).toHaveBeenCalledWith("peripheral disconnected");
    expect(link.closed).toBe(true);
    await expect(link.send(text("hi"))).rejects.toThrow("closed");
  });

  it("splits a sent message into tagged chunks in order", async () => {
    const link = await BleLink.open(PERIPHERAL, handlers(), { tag: TAG });

    await link.send(text("q".repeat(600)));

    const chunks = writtenChunks().map((chunk) => parseChunk(chunk).header);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((header) => header.tag === TAG)).toBe(true);
    expect(chunks.map((header) => header.seq)).toEqual(
      chunks.map((_, index) => index),
    );
    expect(chunks[0]!.first).toBe(true);
    expect(chunks.at(-1)!.last).toBe(true);
  });

  it("closes the link when a write fails", async () => {
    const h = handlers();
    const link = await BleLink.open(PERIPHERAL, h, { tag: TAG });
    vi.mocked(BluetoothLowEnergy.writeCharacteristic).mockRejectedValue(
      new Error("gatt error"),
    );

    await expect(link.send(text("hi"))).rejects.toThrow("gatt error");
    expect(h.onClose).toHaveBeenCalledWith("write failed");
    expect(link.closed).toBe(true);
  });

  it("closes quietly when asked", async () => {
    const h = handlers();
    const link = await BleLink.open(PERIPHERAL, h, { tag: TAG });

    await link.close();
    __simulateDeviceDisconnected(PERIPHERAL);

    expect(h.onClose).not.toHaveBeenCalled();
    expect(__bluetoothListenerCount("deviceDisconnected")).toBe(0);
    expect(BluetoothLowEnergy.disconnect).toHaveBeenCalledWith({
      deviceId: PERIPHERAL,
    });
  });
});
