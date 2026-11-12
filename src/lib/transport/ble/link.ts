/**
 * One Bluetooth LE connection to Core's API service: connects, reads Info,
 * subscribes to TX and moves whole messages in both directions using the
 * chunk framing. Encryption, pairing and reconnecting live above this.
 */

import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import {
  BluetoothLowEnergy,
  ConnectionPriority,
} from "@capawesome-team/capacitor-bluetooth-low-energy";
import { logger } from "@/lib/logger";
import {
  BLE_BOND_CHAR_UUID,
  BLE_DEFAULT_MTU,
  BLE_INFO_CHAR_UUID,
  BLE_IOS_ASSUMED_MTU,
  BLE_REQUESTED_MTU,
  BLE_RX_CHAR_UUID,
  BLE_SERVICE_UUID,
  BLE_TX_CHAR_UUID,
} from "./constants";
import {
  Chunker,
  FrameError,
  Reassembler,
  encodeAck,
  parseChunk,
} from "./frame";
import { parseBleInfo, type BleInfo } from "./info";

export const BLE_CONNECT_TIMEOUT_MS = 10000;
const BLE_OPERATION_TIMEOUT_MS = 10000;
/** Long enough for the user to answer the system's Bluetooth pairing prompt. */
export const BLE_BOND_TIMEOUT_MS = 60000;
/** One wait for discovery; see BleLink.discover. */
export const BLE_DISCOVERY_WAIT_MS = 2000;
/**
 * A write is answered only once the radio has carried it, and on a slow or
 * crowded link that can lag far behind. Matches Core's wait for an
 * acknowledgement so a slow but healthy link is never dropped from this side.
 */
export const BLE_WRITE_TIMEOUT_MS = 30000;

export interface BleLinkHandlers {
  /** A whole message from Core, in order. */
  onMessage: (message: Uint8Array) => void;
  /** The link ended for a reason other than close(). Fires at most once. */
  onClose: (reason: string) => void;
  /** Any chunk for this link arrived; proves the link is alive. */
  onActivity?: () => void;
  /** Measured delivery rate of a multi-chunk message, in bytes per second. */
  onThroughput?: (bytesPerSecond: number) => void;
}

/**
 * The peripheral connected and then dropped the link before it was ready.
 * Core drops a phone that bonded but stalled, and that phone gets through at
 * once when it connects again.
 */
export class BleLinkDroppedError extends Error {
  constructor() {
    super("Bluetooth link dropped while opening");
    this.name = "BleLinkDroppedError";
  }
}

export interface BleLinkOptions {
  connectTimeoutMs?: number;
  /** Fixed tag for tests; a random non-zero tag otherwise. */
  tag?: number;
}

function sameUuid(a: string | undefined, b: string): boolean {
  return a !== undefined && a.toLowerCase() === b.toLowerCase();
}

function isPluginTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "Operation timed out";
}

function randomTag(): number {
  const bytes = new Uint16Array(1);
  do {
    crypto.getRandomValues(bytes);
  } while (bytes[0] === 0);
  return bytes[0]!;
}

interface QueuedWrite {
  chunk: Uint8Array;
  resolve: () => void;
  reject: (error: unknown) => void;
  ack?: boolean;
}

export class BleLink {
  private readonly chunker: Chunker;
  private readonly reassembler = new Reassembler();
  private readonly listeners: PluginListenerHandle[] = [];
  private readonly writes: QueuedWrite[] = [];
  private writing = false;
  private lastAcked = 0;
  private closedFlag = false;
  private opened = false;
  private linked = false;
  private onSetupDrop: (() => void) | null = null;
  private mtu = BLE_DEFAULT_MTU;
  private _info: BleInfo | null = null;
  private messageStartedAt = 0;
  private messageChunks = 0;

  private constructor(
    readonly peripheralId: string,
    private handlers: BleLinkHandlers,
    readonly tag: number,
  ) {
    this.chunker = new Chunker(tag);
  }

  /** Opens a link, or throws after cleaning up whatever it started. */
  static async open(
    peripheralId: string,
    handlers: BleLinkHandlers,
    options: BleLinkOptions = {},
  ): Promise<BleLink> {
    const link = new BleLink(
      peripheralId,
      handlers,
      options.tag ?? randomTag(),
    );
    // The plugin leaves a step waiting when the peripheral drops, so the
    // drop itself has to end the wait.
    const dropped = new Promise<never>((_resolve, reject) => {
      link.onSetupDrop = () => reject(new BleLinkDroppedError());
    });
    const setup = link.setup(
      options.connectTimeoutMs ?? BLE_CONNECT_TIMEOUT_MS,
    );
    // Left behind by a drop, setup still ends once its pending step does.
    setup.catch(() => undefined);
    try {
      await Promise.race([setup, dropped]);
    } catch (error) {
      link.onSetupDrop = null;
      await link.teardown();
      if (link.linked && link.closedFlag) throw new BleLinkDroppedError();
      throw error;
    }
    if (link.closedFlag) {
      await link.teardown();
      throw new BleLinkDroppedError();
    }
    link.onSetupDrop = null;
    link.opened = true;
    return link;
  }

  get info(): BleInfo {
    return this._info!;
  }

  get closed(): boolean {
    return this.closedFlag;
  }

  /** The ATT MTU the link chunks for. */
  get chunkMtu(): number {
    return this.mtu;
  }

  /** Sends one message; resolves when every chunk has been written. */
  async send(message: Uint8Array): Promise<void> {
    if (this.closedFlag) throw new Error("Bluetooth link is closed");
    const chunks = this.chunker.split(message, this.mtu);
    await Promise.all(chunks.map((chunk) => this.enqueue(chunk, false)));
  }

  /**
   * Hands the link to new handlers. Returns false if it has already closed,
   * in which case nobody is told.
   */
  rebind(handlers: BleLinkHandlers): boolean {
    if (this.closedFlag) return false;
    this.handlers = handlers;
    return true;
  }

  /**
   * Reads Core's Info again. A read that fails ends the link, since nothing
   * else can get through it either.
   */
  async readInfo(): Promise<BleInfo> {
    if (this.closedFlag) throw new Error("Bluetooth link is closed");
    try {
      const { value } = await BluetoothLowEnergy.readCharacteristic({
        deviceId: this.peripheralId,
        serviceId: BLE_SERVICE_UUID,
        characteristicId: BLE_INFO_CHAR_UUID,
        timeout: BLE_OPERATION_TIMEOUT_MS,
      });
      return parseBleInfo(value);
    } catch (error) {
      this.fail("info read failed");
      throw error;
    }
  }

  /** Ends the link without reporting onClose. */
  async close(): Promise<void> {
    if (this.closedFlag) return;
    this.closedFlag = true;
    await this.teardown();
  }

  private async setup(connectTimeoutMs: number): Promise<void> {
    const deviceId = this.peripheralId;
    // Listeners first, so a disconnect during setup is not missed.
    this.listeners.push(
      await BluetoothLowEnergy.addListener("deviceDisconnected", (event) => {
        if (event.deviceId === deviceId) this.fail("peripheral disconnected");
      }),
      await BluetoothLowEnergy.addListener("characteristicChanged", (event) => {
        if (
          event.deviceId === deviceId &&
          sameUuid(event.characteristicId, BLE_TX_CHAR_UUID)
        ) {
          this.handleChunk(Uint8Array.from(event.value));
        }
      }),
    );

    await BluetoothLowEnergy.connect({ deviceId, timeout: connectTimeoutMs });
    this.linked = true;

    if (Capacitor.getPlatform() === "android") {
      try {
        await BluetoothLowEnergy.requestMtu({
          deviceId,
          mtu: BLE_REQUESTED_MTU,
          timeout: BLE_OPERATION_TIMEOUT_MS,
        });
        this.mtu = BLE_REQUESTED_MTU;
      } catch (error) {
        logger.debug("Bluetooth MTU request refused; using the default", error);
        this.mtu = BLE_DEFAULT_MTU;
      }
      try {
        await BluetoothLowEnergy.requestConnectionPriority({
          deviceId,
          connectionPriority: ConnectionPriority.HIGH,
        });
      } catch (error) {
        logger.debug("Bluetooth connection priority request failed", error);
      }
    } else {
      this.mtu = BLE_IOS_ASSUMED_MTU;
    }

    await this.discover();
    this.throwIfClosed();
    await this.awaitBond();
    this.throwIfClosed();
    const { value } = await BluetoothLowEnergy.readCharacteristic({
      deviceId,
      serviceId: BLE_SERVICE_UUID,
      characteristicId: BLE_INFO_CHAR_UUID,
      timeout: BLE_OPERATION_TIMEOUT_MS,
    });
    this._info = parseBleInfo(value);
    this.mtu = Math.min(
      this.mtu,
      Math.max(this._info.preferredMtu, BLE_DEFAULT_MTU),
    );

    await BluetoothLowEnergy.startCharacteristicNotifications({
      deviceId,
      serviceId: BLE_SERVICE_UUID,
      characteristicId: BLE_TX_CHAR_UUID,
      timeout: BLE_OPERATION_TIMEOUT_MS,
    });
  }

  /**
   * Core's Bond characteristic is readable over an encrypted link only, so
   * reading it makes the phone pair first, asking its user, and answers once
   * that is done. TX must be subscribed after that: BlueZ files a
   * subscription under the address the phone connected with, and a pairing
   * that reveals the phone's real address strands it, so Core's replies
   * never arrive. A failure means there is no pairing to wait for, as with
   * a Core that predates the characteristic or one that is not pairable.
   */
  private async awaitBond(): Promise<void> {
    try {
      await BluetoothLowEnergy.readCharacteristic({
        deviceId: this.peripheralId,
        serviceId: BLE_SERVICE_UUID,
        characteristicId: BLE_BOND_CHAR_UUID,
        timeout: BLE_BOND_TIMEOUT_MS,
      });
    } catch (error) {
      logger.debug("Bluetooth bond wait ended without a read", error);
    }
  }

  /**
   * Core's Bluetooth stack can ask the phone to pair as soon as it connects,
   * and iOS then holds discovery until its prompt is answered, so discovery
   * gets as long as the prompt does. It is asked for in short waits because
   * the plugin runs one call per peripheral at a time and cannot give one
   * up: a single long wait would hold back the disconnect and the next
   * connect for all of it after the peripheral drops.
   */
  private async discover(): Promise<void> {
    const deadline = Date.now() + BLE_BOND_TIMEOUT_MS;
    for (;;) {
      try {
        await BluetoothLowEnergy.discoverServices({
          deviceId: this.peripheralId,
          timeout: BLE_DISCOVERY_WAIT_MS,
        });
        return;
      } catch (error) {
        if (
          this.closedFlag ||
          Date.now() >= deadline ||
          !isPluginTimeout(error)
        ) {
          throw error;
        }
      }
    }
  }

  /** Stops a setup the link's drop already ended from touching the radio. */
  private throwIfClosed(): void {
    if (this.closedFlag) throw new Error("Bluetooth link is closed");
  }

  private handleChunk(chunk: Uint8Array): void {
    if (this.closedFlag) return;
    let messages: Uint8Array[];
    try {
      const { header, payload } = parseChunk(chunk);
      // Chunks for another client's session on a shared stack are not ours.
      if (header.tag !== this.tag) return;
      // Core does not acknowledge on this side; ignore one if it ever does.
      if (header.ack) return;
      this.handlers.onActivity?.();
      if (header.first) {
        this.messageStartedAt = Date.now();
        this.messageChunks = 0;
      }
      this.messageChunks++;
      messages = this.reassembler.push(header, payload);
    } catch (error) {
      const reason =
        error instanceof FrameError ? error.message : "unreadable chunk";
      logger.warn("Bluetooth framing error", error, {
        category: "bluetooth",
        action: "framing-error",
      });
      this.fail(`framing error: ${reason}`);
      return;
    }
    this.maybeAck();
    if (messages.length > 0) this.reportThroughput(messages);
    for (const message of messages) {
      if (this.closedFlag) return;
      this.handlers.onMessage(message);
    }
  }

  private reportThroughput(messages: Uint8Array[]): void {
    const chunks = this.messageChunks;
    this.messageChunks = 0;
    if (chunks < 4 || !this.handlers.onThroughput) return;
    const elapsed = Date.now() - this.messageStartedAt;
    if (elapsed <= 0) return;
    const bytes = messages.reduce((sum, message) => sum + message.length, 0);
    this.handlers.onThroughput((bytes * 1000) / elapsed);
  }

  /** Acknowledges every half window so Core never stalls on a full one. */
  private maybeAck(): void {
    const window = this._info?.window ?? 0;
    const half = Math.max(1, Math.floor(window / 2));
    const next = this.reassembler.next;
    if (((next - this.lastAcked) & 0xffff) < half) return;
    this.lastAcked = next;
    const chunk = encodeAck(this.tag, next);
    // Core only accepts acknowledgements that move forward, so a newer one
    // replaces any still waiting rather than queueing behind or ahead of it.
    const waiting = this.writes.find((write) => write.ack);
    if (waiting) {
      waiting.chunk = chunk;
      return;
    }
    this.enqueue(chunk, true).catch(() => {
      // A failed write closes the link already.
    });
  }

  /** Queues a write; acknowledgements (priority) go ahead of data. */
  private enqueue(chunk: Uint8Array, priority: boolean): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.closedFlag) {
        reject(new Error("Bluetooth link is closed"));
        return;
      }
      if (priority) this.writes.unshift({ chunk, resolve, reject, ack: true });
      else this.writes.push({ chunk, resolve, reject });
      void this.pump();
    });
  }

  private async pump(): Promise<void> {
    if (this.writing) return;
    this.writing = true;
    try {
      while (this.writes.length > 0) {
        const item = this.writes.shift()!;
        if (this.closedFlag) {
          item.reject(new Error("Bluetooth link is closed"));
          continue;
        }
        try {
          await BluetoothLowEnergy.writeCharacteristic({
            deviceId: this.peripheralId,
            serviceId: BLE_SERVICE_UUID,
            characteristicId: BLE_RX_CHAR_UUID,
            value: Array.from(item.chunk),
            type: "default",
            timeout: BLE_WRITE_TIMEOUT_MS,
          });
          item.resolve();
        } catch (error) {
          item.reject(error);
          this.fail("write failed");
        }
      }
    } finally {
      this.writing = false;
    }
  }

  private fail(reason: string): void {
    if (this.closedFlag) return;
    this.closedFlag = true;
    // While opening, open() reports the failure by throwing instead.
    if (!this.opened) {
      this.onSetupDrop?.();
      return;
    }
    void this.teardown();
    this.handlers.onClose(reason);
  }

  private async teardown(): Promise<void> {
    for (const pending of this.writes.splice(0)) {
      pending.reject(new Error("Bluetooth link is closed"));
    }
    const listeners = this.listeners.splice(0);
    await Promise.all(
      listeners.map((handle) => handle.remove().catch(() => undefined)),
    );
    try {
      await BluetoothLowEnergy.disconnect({ deviceId: this.peripheralId });
    } catch {
      // Already gone.
    }
  }
}
