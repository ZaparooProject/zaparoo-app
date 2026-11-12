/**
 * Core's JSON-RPC API over Bluetooth LE. Mirrors WebSocketTransport: the same
 * encryption session (with the "ble" label and the binary envelope), the same
 * heartbeat and the same encryption-block rules. Plaintext is never sent
 * except the pairing methods, which Core only accepts before authentication.
 */

import { logger } from "@/lib/logger";
import { EncryptedSession } from "@/lib/crypto/session";
import type { RpcCall, RpcCallError } from "@/lib/crypto/pairing";
import type {
  BluetoothIdentity,
  Transport,
  TransportEncryptionConfig,
  TransportEventHandlers,
  TransportLink,
  TransportState,
} from "../types";
import { getBluetoothReadiness } from "./bluetooth";
import { takeIdentifiedLink } from "./identify";
import {
  BleLink,
  BleLinkDroppedError,
  type BleLinkHandlers,
  type BleLinkOptions,
} from "./link";
import { findBluetoothDevice } from "./scanner";

/**
 * How often a link held open for pairing reads Info while the user enters
 * the PIN. Core drops a phone that bonds and then does not reach its
 * service, which is how it frees one its Bluetooth stack left stalled, so
 * the idle link has to keep using the service. A read that never returns
 * also shows the link is stalled.
 */
export const PAIRING_KEEPALIVE_MS = 1000;

export interface BluetoothTransportConfig {
  /** The app's id for the device (the registry record id). */
  deviceId: string;
  identity: BluetoothIdentity;
  encryption?: TransportEncryptionConfig;
  pingInterval?: number;
  pongTimeout?: number;
  reconnectInterval?: number;
  maxReconnectInterval?: number;
  /** How long to scan for a Core whose peripheral handle is unknown or stale. */
  scanTimeout?: number;
  /** How long a pairing request waits for its answer. */
  pairingTimeout?: number;
}

const SESSION_CLOSED_CODE = -32004;
const ENCRYPTION_REQUIRED_CODE = -32002;
const UNSUPPORTED_VERSION_CODE = -32001;
const MAX_HANDSHAKE_REJECTIONS = 3;
const GCM_TAG_LENGTH = 16;
/** How long the connect to a known peripheral may take while a scan runs. */
export const KNOWN_PERIPHERAL_CONNECT_TIMEOUT_MS = 3000;

const DEFAULTS = {
  pingInterval: 30000,
  pongTimeout: 20000,
  reconnectInterval: 2000,
  maxReconnectInterval: 30000,
  scanTimeout: 15000,
  pairingTimeout: 15000,
};

type Mode =
  /** No link. */
  | "idle"
  /** Opening a link. */
  | "opening"
  /** Link open, no credentials: only pairing requests may be sent. */
  | "pairing"
  /** Link open, encrypted session created, Core has not answered yet. */
  | "trying-encrypted"
  /** Core answered with a frame that decrypted. */
  | "encrypted-verified";

export class BluetoothUnavailableError extends Error {
  constructor(readonly readiness: string) {
    super(`Bluetooth is not ready: ${readiness}`);
    this.name = "BluetoothUnavailableError";
  }
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

interface PendingPairing {
  resolve: (result: unknown) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Reads a plaintext control message from Core, if this is one. */
function parseControl(
  bytes: Uint8Array,
): { id: unknown; result?: unknown; error?: RpcCallError } | null {
  if (bytes.length === 0 || bytes[0] !== 0x7b) return null;
  try {
    const parsed = JSON.parse(textDecoder.decode(bytes)) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const message = parsed as {
      jsonrpc?: unknown;
      id?: unknown;
      result?: unknown;
      error?: unknown;
    };
    if (message.jsonrpc !== "2.0") return null;
    const error = message.error as RpcCallError | undefined;
    if (
      error !== undefined &&
      (typeof error !== "object" ||
        error === null ||
        typeof error.code !== "number")
    ) {
      return null;
    }
    return { id: message.id, result: message.result, error };
  } catch {
    return null;
  }
}

/**
 * The size of the frame EncryptedSession.encryptAndFrameBinary makes for
 * `plaintext`: the ciphertext with its tag, behind the version, salt and
 * token on a session's first frame.
 */
function frameLength(
  plaintext: string,
  session: EncryptedSession,
  first: boolean,
): number {
  const header = first
    ? 2 +
      session.sessionSalt.length +
      textEncoder.encode(session.authToken).length
    : 0;
  return header + textEncoder.encode(plaintext).length + GCM_TAG_LENGTH;
}

export class BluetoothTransport implements Transport {
  readonly deviceId: string;
  private readonly config: typeof DEFAULTS & {
    encryption?: TransportEncryptionConfig;
  };
  private identity: BluetoothIdentity;
  private handlers: TransportEventHandlers = {};
  private _state: TransportState = "disconnected";
  private _hasConnectedBefore = false;
  private destroyed = false;
  private encryptionBlocked = false;
  private heartbeatPaused = false;
  private handshakeRejections = 0;
  private reconnectAttempts = 0;
  private generation = 0;

  private mode: Mode = "idle";
  private ble: BleLink | null = null;
  private opening: Promise<BleLink> | null = null;
  private session: EncryptedSession | null = null;
  /** How far the session's first frame, which carries the handshake, got. */
  private handshake: "unsent" | "framed" | "delivered" = "unsent";
  private outbound: string[] = [];
  private draining = false;
  private inbound: Promise<void> = Promise.resolve();

  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private pingTimer?: ReturnType<typeof setTimeout>;
  private pongTimer?: ReturnType<typeof setTimeout>;
  private pingSentAt = 0;

  private pairingId = 0;
  private readonly pendingPairing = new Map<string, PendingPairing>();

  constructor(config: BluetoothTransportConfig) {
    this.deviceId = config.deviceId;
    this.identity = { ...config.identity };
    this.config = {
      pingInterval: config.pingInterval ?? DEFAULTS.pingInterval,
      pongTimeout: config.pongTimeout ?? DEFAULTS.pongTimeout,
      reconnectInterval: config.reconnectInterval ?? DEFAULTS.reconnectInterval,
      maxReconnectInterval:
        config.maxReconnectInterval ?? DEFAULTS.maxReconnectInterval,
      scanTimeout: config.scanTimeout ?? DEFAULTS.scanTimeout,
      pairingTimeout: config.pairingTimeout ?? DEFAULTS.pairingTimeout,
      encryption: config.encryption,
    };
  }

  get state(): TransportState {
    return this._state;
  }

  get isConnected(): boolean {
    return (
      this._state === "connected" &&
      this.ble !== null &&
      !this.ble.closed &&
      (this.mode === "trying-encrypted" || this.mode === "encrypted-verified")
    );
  }

  get hasEverConnected(): boolean {
    return this._hasConnectedBefore;
  }

  readonly pairsOverBluetooth = true;

  get link(): TransportLink | null {
    return this.isConnected ? "bluetooth" : null;
  }

  /** The identity the transport reconnects with, including what it learned. */
  get bluetoothIdentity(): BluetoothIdentity {
    return { ...this.identity };
  }

  setEventHandlers(handlers: TransportEventHandlers): void {
    this.handlers = handlers;
  }

  connect(): void {
    if (this.destroyed || this.encryptionBlocked) return;
    if (this._state === "connecting" || this._state === "connected") return;
    this.setState(this._hasConnectedBefore ? "reconnecting" : "connecting");
    void this.start();
  }

  disconnect(): void {
    this.cleanup();
    this.setState("disconnected");
  }

  destroy(): void {
    this.destroyed = true;
    this.cleanup();
    this._state = "disconnected";
  }

  send(data: string): void {
    if (!this.isConnected) {
      throw new Error("Cannot send message: Bluetooth link not ready");
    }
    this.outbound.push(data);
    void this.drain();
  }

  immediateReconnect(): void {
    if (this.destroyed) return;
    this.heartbeatPaused = false;
    if (this.isConnected) {
      this.resumeHeartbeat();
      return;
    }
    if (this.encryptionBlocked) return;
    if (this.mode === "opening") return;
    this.clearReconnect();
    this.reconnectAttempts = 0;
    this.closeLink();
    this.setState(this._hasConnectedBefore ? "reconnecting" : "connecting");
    void this.start();
  }

  clearEncryptionBlock(): void {
    this.encryptionBlocked = false;
    this.handshakeRejections = 0;
  }

  pauseHeartbeat(): void {
    this.heartbeatPaused = true;
    this.heartReset();
    this.clearReconnect();
  }

  resumeHeartbeat(): void {
    if (!this.isConnected) return;
    this.heartbeatPaused = false;
    this.heartCheck();
  }

  /** Pairing over this link with pair.start and pair.finish. */
  pairingCall(): RpcCall {
    return (method, params) => this.callPairing(method, params);
  }

  // ── Connecting ──────────────────────────────────────────────────────────

  private async start(): Promise<void> {
    const generation = ++this.generation;
    this.mode = "opening";
    let link: BleLink;
    try {
      link = await this.openLink(generation);
    } catch (error) {
      if (generation !== this.generation || this.destroyed) return;
      this.mode = "idle";
      logger.debug(`[BLE:${this.deviceId}] Connect failed`, error);
      this.handlers.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
      this.scheduleReconnect();
      return;
    }
    if (generation !== this.generation || this.destroyed) {
      void link.close();
      return;
    }
    this.ble = link;
    this.reconnectAttempts = 0;
    await this.initEncryption(generation, link);
  }

  /**
   * Opens a link to this Core: by its known handle, with a scan running
   * alongside when the Core's id is known. On iOS a connect to the known
   * handle can sit unanswered after the app restarts, while the same connect
   * made again once a scan has seen the peripheral completes at once.
   */
  private openLink(generation: number): Promise<BleLink> {
    const opening = (async () => {
      const readiness = await getBluetoothReadiness();
      if (readiness !== "ready") throw new BluetoothUnavailableError(readiness);

      const handlers = this.linkHandlers(generation);
      const { peripheralId, coreDeviceId } = this.identity;

      const identified = peripheralId ? takeIdentifiedLink(peripheralId) : null;
      if (identified) {
        if (
          (!coreDeviceId || identified.info.deviceId === coreDeviceId) &&
          identified.rebind(handlers)
        ) {
          this.learn(identified);
          return identified;
        }
        void identified.close();
      }
      let found: BleLink | null = null;
      let otherCore: string | undefined;

      // Opens one peripheral and keeps the link if it is this Core. Every
      // attempt runs on one chain, so a peripheral is never opened twice at
      // once.
      const tryOpen = async (
        id: string,
        options?: BleLinkOptions,
        retried = false,
      ): Promise<void> => {
        if (found || generation !== this.generation || id === otherCore) {
          return;
        }
        let link: BleLink;
        try {
          link = await BleLink.open(id, handlers, options);
        } catch (error) {
          logger.debug(`[BLE:${this.deviceId}] Connect to ${id} failed`, error);
          // Core dropped a link it found stalled; the next one gets through.
          if (error instanceof BleLinkDroppedError && !retried) {
            await tryOpen(id, options, true);
          }
          return;
        }
        if (!coreDeviceId || link.info.deviceId === coreDeviceId) {
          found = link;
          return;
        }
        if (id === peripheralId) {
          logger.debug(
            `[BLE:${this.deviceId}] Peripheral is a different Core; scanning`,
          );
          otherCore = id;
        }
        await link.close();
      };

      let chain: Promise<void> = peripheralId
        ? tryOpen(
            peripheralId,
            coreDeviceId
              ? { connectTimeoutMs: KNOWN_PERIPHERAL_CONNECT_TIMEOUT_MS }
              : undefined,
          )
        : Promise.resolve();

      if (coreDeviceId) {
        const scanning = new AbortController();
        void chain.then(() => {
          if (found) scanning.abort();
        });
        await findBluetoothDevice(
          (device) => {
            const attempt = chain.then(() => tryOpen(device.peripheralId));
            chain = attempt;
            return attempt.then(() => found !== null);
          },
          this.config.scanTimeout,
          scanning.signal,
        );
      }
      await chain;

      const link = found as BleLink | null;
      if (!link) throw new Error("Bluetooth device not found");
      this.learn(link);
      return link;
    })();
    this.opening = opening;
    return opening.finally(() => {
      if (this.opening === opening) this.opening = null;
    });
  }

  private learn(link: BleLink): void {
    const changed =
      this.identity.peripheralId !== link.peripheralId ||
      this.identity.coreDeviceId !== link.info.deviceId;
    this.identity = {
      coreDeviceId: link.info.deviceId,
      peripheralId: link.peripheralId,
    };
    if (changed) {
      this.handlers.onBluetoothIdentity?.({
        coreDeviceId: link.info.deviceId,
        peripheralId: link.peripheralId,
      });
    }
  }

  private linkHandlers(generation: number): BleLinkHandlers {
    return {
      onMessage: (message) => {
        if (generation !== this.generation) return;
        this.handleMessage(message);
      },
      onClose: (reason) => {
        if (generation !== this.generation) return;
        this.handleLinkClosed(reason);
      },
      onActivity: () => {
        if (generation !== this.generation) return;
        if (
          this.mode === "trying-encrypted" ||
          this.mode === "encrypted-verified"
        ) {
          this.heartCheck();
        }
      },
    };
  }

  private async initEncryption(
    generation: number,
    link: BleLink,
  ): Promise<void> {
    let session: EncryptedSession | null = null;
    try {
      const creds = await this.config.encryption?.getCredentials();
      if (generation !== this.generation || link.closed) return;
      if (creds) {
        if (
          creds.pairingKey.length === 0 ||
          creds.pairingKey.length % 2 !== 0 ||
          !/^[0-9a-fA-F]+$/.test(creds.pairingKey)
        ) {
          this.block("malformed pairing key", () =>
            this.handlers.onCredentialsRevoked?.(),
          );
          return;
        }
        const key = new Uint8Array(
          (creds.pairingKey.match(/.{2}/g) ?? []).map((h) =>
            Number.parseInt(h, 16),
          ),
        );
        session = await EncryptedSession.create(creds.authToken, key, "ble");
        if (generation !== this.generation || link.closed) return;
      }
    } catch (error) {
      if (generation !== this.generation) return;
      logger.error(`[BLE:${this.deviceId}] Failed to init encryption`, error, {
        category: "crypto",
        action: "init-failed",
      });
      this.handlers.onError?.(new Error("Failed to initialise encryption"));
      this.closeLink();
      this.scheduleReconnect();
      return;
    }

    if (!session) {
      // Bluetooth never carries plaintext requests, so with no credentials
      // the link stays open for pairing only.
      this.mode = "pairing";
      this.block(
        "pairing required",
        () => this.handlers.onEncryptionRequired?.(),
        true,
      );
      void this.keepPairingLinkAlive(generation, link);
      return;
    }

    this.session = session;
    this.handshake = "unsent";
    this.mode = "trying-encrypted";
    this._hasConnectedBefore = true;
    this.setState("connected");
    this.heartbeatPaused = false;
    this.heartCheck();
    this.handlers.onOpen?.(`bluetooth:${link.peripheralId}`);
  }

  // ── Messages ────────────────────────────────────────────────────────────

  private handleMessage(message: Uint8Array): void {
    const control = parseControl(message);
    if (control) {
      this.handleControl(control);
      return;
    }
    if (
      this.mode !== "trying-encrypted" &&
      this.mode !== "encrypted-verified"
    ) {
      logger.debug(`[BLE:${this.deviceId}] Dropping unexpected message`);
      return;
    }
    const session = this.session;
    const generation = this.generation;
    this.inbound = this.inbound
      .then(async () => {
        if (generation !== this.generation || session !== this.session) return;
        if (!session) return;
        let plaintext: string;
        try {
          plaintext = await session.decryptBytes(message);
        } catch (error) {
          if (generation !== this.generation || session !== this.session)
            return;
          logger.warn(`[BLE:${this.deviceId}] Decryption failed`, error, {
            category: "crypto",
            action: "decrypt-failed",
          });
          this.handlers.onError?.(new Error("Encrypted handshake failed"));
          this.closeLink();
          this.scheduleReconnect();
          return;
        }
        if (generation !== this.generation || session !== this.session) return;
        if (this.mode === "trying-encrypted") {
          this.mode = "encrypted-verified";
          this.handshakeRejections = 0;
          this.handlers.onEncryptedHandshakeOk?.();
        }
        if (plaintext === "pong") {
          if (this.pingSentAt > 0) {
            this.handlers.onHeartbeat?.(Date.now() - this.pingSentAt);
            this.pingSentAt = 0;
          }
          return;
        }
        this.handlers.onMessage?.(
          new MessageEvent("message", { data: plaintext }),
        );
      })
      .catch((error: unknown) => {
        logger.error(
          `[BLE:${this.deviceId}] Inbound processing failed`,
          error,
          {
            category: "bluetooth",
            action: "inbound-processing-failed",
          },
        );
      });
  }

  private handleControl(control: {
    id: unknown;
    result?: unknown;
    error?: RpcCallError;
  }): void {
    if (typeof control.id === "string") {
      const pending = this.pendingPairing.get(control.id);
      if (pending) {
        this.pendingPairing.delete(control.id);
        clearTimeout(pending.timer);
        if (control.error) pending.reject(control.error);
        else pending.resolve(control.result);
        return;
      }
    }
    const code = control.error?.code;
    if (code === UNSUPPORTED_VERSION_CODE) {
      this.block("unsupported encryption version", () =>
        this.handlers.onUnsupportedVersion?.(),
      );
      return;
    }
    if (code === ENCRYPTION_REQUIRED_CODE) {
      this.block("credentials revoked", () =>
        this.session
          ? this.handlers.onCredentialsRevoked?.()
          : this.handlers.onEncryptionRequired?.(),
      );
      return;
    }
    if (code === SESSION_CLOSED_CODE) {
      const reason =
        typeof control.error?.data === "object" && control.error.data !== null
          ? String((control.error.data as { reason?: unknown }).reason ?? "")
          : "";
      logger.debug(`[BLE:${this.deviceId}] Core closed the session: ${reason}`);
      // Core drops the link itself on most stacks; on Windows it cannot, so
      // disconnecting here is what ends it there.
      this.handleLinkClosed(reason || "session closed");
      return;
    }
    logger.debug(`[BLE:${this.deviceId}] Ignoring plaintext message`);
  }

  private handleLinkClosed(reason: string): void {
    const mode = this.mode;
    const handshakeDelivered = this.handshake === "delivered";
    this.rejectPairing(new Error("Bluetooth connection lost"));
    this.closeLink();
    this.heartReset();
    if (this.destroyed) return;
    if (mode === "pairing") {
      // The pairing link went away; the next pairing request reopens it.
      this.mode = "idle";
      return;
    }
    // Core cannot have refused a handshake that never reached it, so a link
    // lost before then is an ordinary drop.
    if (mode === "trying-encrypted" && handshakeDelivered) {
      this.handshakeRejections++;
      if (this.handshakeRejections >= MAX_HANDSHAKE_REJECTIONS) {
        logger.warn(
          `[BLE:${this.deviceId}] Encrypted handshake rejected: ${reason}`,
          { category: "crypto", action: "handshake-rejected" },
        );
        this.block("handshake rejected", () =>
          this.handlers.onEncryptedHandshakeRejected?.(),
        );
        return;
      }
    }
    this.handlers.onClose?.();
    this.scheduleReconnect();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    const generation = this.generation;
    try {
      while (this.outbound.length > 0) {
        const session = this.session;
        const link = this.ble;
        if (
          !session ||
          !link ||
          link.closed ||
          generation !== this.generation
        ) {
          return;
        }
        const item = this.outbound.shift()!;
        // Sized before encrypting: an encrypted frame has used a counter
        // value Core expects next, so dropping one would end the session.
        const first = this.handshake === "unsent";
        if (frameLength(item, session, first) > link.info.maxMessage) {
          logger.error(
            `[BLE:${this.deviceId}] Message too large for Bluetooth`,
            undefined,
            { category: "bluetooth", action: "message-too-large" },
          );
          continue;
        }
        const frame = await session.encryptAndFrameBinary(item);
        if (first && session === this.session) this.handshake = "framed";
        if (generation !== this.generation || link.closed) return;
        await link.send(frame);
        if (first && session === this.session) this.handshake = "delivered";
      }
    } catch (error) {
      if (generation !== this.generation) return;
      logger.warn(`[BLE:${this.deviceId}] Send failed`, error, {
        category: "bluetooth",
        action: "send-failed",
      });
    } finally {
      this.draining = false;
      if (
        this.outbound.length > 0 &&
        generation === this.generation &&
        this.isConnected
      ) {
        void this.drain();
      }
    }
  }

  // ── Pairing ─────────────────────────────────────────────────────────────

  private async pairingLink(): Promise<BleLink> {
    if (this.mode === "pairing" && this.ble && !this.ble.closed) {
      return this.ble;
    }
    if (this.opening && this.mode === "opening") {
      await this.opening.catch(() => undefined);
      // start() may have moved the link into pairing while this waited.
      if ((this.mode as Mode) === "pairing" && this.ble && !this.ble.closed) {
        return this.ble;
      }
    }
    // An encrypted link cannot pair; start a fresh one that stays in pairing.
    this.clearReconnect();
    this.closeLink();
    this.heartReset();
    this.encryptionBlocked = true;
    // The encrypted link is gone, so nothing can be sent until pairing ends.
    this.setState("disconnected");
    const generation = ++this.generation;
    this.mode = "opening";
    try {
      const link = await this.openLink(generation);
      if (generation !== this.generation) {
        void link.close();
        throw new Error("Pairing was interrupted");
      }
      this.ble = link;
      this.mode = "pairing";
      void this.keepPairingLinkAlive(generation, link);
      return link;
    } catch (error) {
      if (generation === this.generation) this.mode = "idle";
      throw error;
    }
  }

  /** Reads Info now and then while the link waits in pairing mode. */
  private async keepPairingLinkAlive(
    generation: number,
    link: BleLink,
  ): Promise<void> {
    const holding = () =>
      generation === this.generation &&
      this.mode === "pairing" &&
      this.ble === link &&
      !link.closed &&
      !this.destroyed;
    while (holding()) {
      await new Promise((resolve) => setTimeout(resolve, PAIRING_KEEPALIVE_MS));
      if (!holding()) return;
      // A pairing request in flight uses the service already.
      if (this.pendingPairing.size > 0) continue;
      try {
        await link.readInfo();
      } catch (error) {
        // The failed read ended the link, which reports the loss.
        logger.debug(`[BLE:${this.deviceId}] Pairing link read failed`, error);
        return;
      }
    }
  }

  private async callPairing(method: string, params: unknown): Promise<unknown> {
    const link = await this.pairingLink();
    const id = `pair-${++this.pairingId}`;
    const result = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingPairing.delete(id);
        reject(new Error("Pairing request timed out"));
      }, this.config.pairingTimeout);
      this.pendingPairing.set(id, { resolve, reject, timer });
    });
    const sent = link.send(
      textEncoder.encode(
        JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      ),
    );
    // Racing observes both: the timeout can fire while a write is still
    // pending, and that write can fail after the timeout has already won.
    try {
      await Promise.race([sent, result]);
    } catch (error) {
      const pending = this.pendingPairing.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingPairing.delete(id);
      }
      throw error;
    }
    return result;
  }

  private rejectPairing(error: Error): void {
    for (const [id, pending] of this.pendingPairing) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pendingPairing.delete(id);
    }
  }

  // ── State, heartbeat, reconnect ─────────────────────────────────────────

  private block(reason: string, notify: () => void, keepLink = false): void {
    logger.warn(`[BLE:${this.deviceId}] Encryption-blocked: ${reason}`, {
      category: "crypto",
      action: "encryption-blocked",
    });
    notify();
    this.encryptionBlocked = true;
    this.clearReconnect();
    this.heartReset();
    if (!keepLink) {
      this.rejectPairing(new Error("Bluetooth session closed"));
      this.closeLink();
      this.mode = "idle";
    }
    this.setState("disconnected");
    this.handlers.onClose?.();
  }

  private setState(state: TransportState): void {
    if (this._state === state) return;
    this._state = state;
    this.handlers.onStateChange?.(state);
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.encryptionBlocked) {
      this.setState("disconnected");
      return;
    }
    this.setState(this._hasConnectedBefore ? "reconnecting" : "connecting");
    if (this.heartbeatPaused || this.reconnectTimer) return;
    const delay = Math.min(
      this.config.reconnectInterval * 2 ** this.reconnectAttempts,
      this.config.maxReconnectInterval,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.destroyed || this.encryptionBlocked) return;
      this.reconnectAttempts++;
      void this.start();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private heartCheck(): void {
    this.heartReset();
    if (this.destroyed || this.heartbeatPaused) return;
    this.pingTimer = setTimeout(() => {
      if (!this.isConnected) return;
      this.pingSentAt = Date.now();
      this.send("ping");
      this.pongTimer = setTimeout(() => {
        logger.warn(`[BLE:${this.deviceId}] Heartbeat timed out`, {
          category: "bluetooth",
          action: "heartbeat-timeout",
        });
        this.handleLinkClosed("heartbeat timeout");
      }, this.config.pongTimeout);
    }, this.config.pingInterval);
  }

  private heartReset(): void {
    if (this.pingTimer) clearTimeout(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pingTimer = undefined;
    this.pongTimer = undefined;
  }

  private closeLink(): void {
    const link = this.ble;
    this.ble = null;
    this.session = null;
    this.outbound = [];
    this.draining = false;
    this.inbound = Promise.resolve();
    this.pingSentAt = 0;
    if (this.mode !== "opening") this.mode = "idle";
    if (link) void link.close();
  }

  private cleanup(): void {
    this.generation++;
    this.clearReconnect();
    this.heartReset();
    this.rejectPairing(new Error("Bluetooth connection closed"));
    this.closeLink();
    this.mode = "idle";
    this.reconnectAttempts = 0;
  }
}
