/**
 * One connection to a Core over whichever link works best: Wi-Fi when the
 * phone can reach Core's WebSocket, Bluetooth LE otherwise. CoreAPI and the
 * connection UI see a single Transport.
 *
 * - Wi-Fi is tried first when an address is known. If it is not up within a
 *   grace period and Core's Bluetooth identity is known, Bluetooth starts too;
 *   whichever opens first is used. A phone on cellular or no network skips
 *   the grace period, since it cannot reach Core over Wi-Fi.
 * - While on Bluetooth, Wi-Fi is probed every minute and on network changes. A
 *   probe succeeds when its encrypted handshake verifies, which proves it is
 *   the same Core because only it holds the session keys.
 * - Switching happens between requests: new sends are held, replies already
 *   owed on Bluetooth are awaited (up to a cap), then Bluetooth is closed so
 *   the phone's and Core's radios are free.
 */

import { Network } from "@capacitor/network";
import { logger } from "@/lib/logger";
import type { RpcCall } from "@/lib/crypto/pairing";
import { isBluetoothTransportSupported } from "../ble/bluetooth";
import { BluetoothTransport } from "../ble/BluetoothTransport";
import {
  DEVICE_ENDPOINTS_METHOD,
  parseDeviceEndpointsResult,
  webSocketUrlsFromEndpoints,
} from "../deviceEndpoints";
import type {
  BluetoothIdentity,
  Transport,
  TransportEncryptionConfig,
  TransportEventHandlers,
  TransportLink,
  TransportState,
} from "../types";
import { WebSocketTransport } from "../WebSocketTransport";
import { LinkQuality, probeDelay, shouldPreferWebSocket } from "./linkQuality";

export interface HybridTransportConfig {
  deviceId: string;
  /** WebSocket URLs to try, most preferred first. May be empty. */
  wsUrls: readonly string[];
  encryption?: TransportEncryptionConfig;
  bluetooth?: BluetoothIdentity;
  /** Defaults to whether this build can use Bluetooth at all. */
  bluetoothEnabled?: boolean;
  /** How long Wi-Fi may stay down before Bluetooth is tried too. */
  bluetoothGraceMs?: number;
  /** How often Wi-Fi is probed while on Bluetooth. */
  probeIntervalMs?: number;
  /** How long a probe may spend on each Wi-Fi address. */
  probeTimeoutPerUrlMs?: number;
  /** Longest wait for replies owed on the old link before switching. */
  switchDrainCapMs?: number;
  /** A Wi-Fi drop this soon after switching to it backs probing off. */
  quickDropMs?: number;
  createWebSocket?: (
    urls: readonly string[],
    encryption?: TransportEncryptionConfig,
  ) => Transport;
  createBluetooth?: (
    identity: BluetoothIdentity,
    encryption?: TransportEncryptionConfig,
  ) => Transport;
}

const DEFAULTS = {
  bluetoothGraceMs: 6000,
  probeIntervalMs: 60000,
  probeTimeoutPerUrlMs: 5000,
  switchDrainCapMs: 10000,
  quickDropMs: 2 * 60 * 1000,
};

const ENDPOINTS_ID_PREFIX = "hybrid-endpoints-";

/** How long a socket waits after one address fails before trying the next. */
const WS_RECONNECT_INTERVAL_MS = 2000;
/** How long a probe's last address gets for Core to answer once it opens. */
const PROBE_HANDSHAKE_ALLOWANCE_MS = 5000;

function defaultWebSocket(
  deviceId: string,
): NonNullable<HybridTransportConfig["createWebSocket"]> {
  return (urls, encryption) =>
    new WebSocketTransport({
      deviceId,
      url: urls[0]!,
      fallbackUrls: urls.slice(1),
      pingInterval: 15000,
      pongTimeout: 10000,
      reconnectInterval: WS_RECONNECT_INTERVAL_MS,
      maxReconnectInterval: 30000,
      maxReconnectAttempts: Infinity,
      pingMessage: "ping",
      connectionTimeout: 5000,
      encryption,
    });
}

function defaultBluetooth(
  deviceId: string,
): NonNullable<HybridTransportConfig["createBluetooth"]> {
  return (identity, encryption) =>
    new BluetoothTransport({ deviceId, identity, encryption });
}

function requestId(data: string): string | number | null {
  if (!data.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(data) as { id?: unknown; method?: unknown };
    if (typeof parsed.method !== "string") return null;
    return typeof parsed.id === "string" || typeof parsed.id === "number"
      ? parsed.id
      : null;
  } catch {
    return null;
  }
}

function responseId(data: unknown): string | number | null {
  if (typeof data !== "string" || !data.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(data) as { id?: unknown; method?: unknown };
    if (parsed.method !== undefined) return null;
    return typeof parsed.id === "string" || typeof parsed.id === "number"
      ? parsed.id
      : null;
  } catch {
    return null;
  }
}

export class HybridTransport implements Transport {
  readonly deviceId: string;
  private readonly settings: typeof DEFAULTS;
  private readonly encryption?: TransportEncryptionConfig;
  private readonly bluetoothEnabled: boolean;
  private readonly createWebSocket: NonNullable<
    HybridTransportConfig["createWebSocket"]
  >;
  private readonly createBluetooth: NonNullable<
    HybridTransportConfig["createBluetooth"]
  >;
  private readonly configuredUrls: string[];
  private reportedUrls: string[] = [];
  private identity: BluetoothIdentity | null;

  private handlers: TransportEventHandlers = {};
  private _state: TransportState = "disconnected";
  private everConnected = false;
  private destroyed = false;
  private blocked = false;
  private paused = false;

  private ws: Transport | null = null;
  private ble: Transport | null = null;
  private probe: Transport | null = null;
  private active: TransportLink | null = null;
  private lastLink: TransportLink | null = null;

  private readonly wifiQuality = new LinkQuality();
  private readonly bluetoothQuality = new LinkQuality();
  private quickDrops = 0;
  private wifiSince = 0;
  private cameFromBluetooth = false;

  private switching: {
    to: Transport;
    address: string;
    capTimer: ReturnType<typeof setTimeout>;
  } | null = null;
  private held: string[] = [];
  private readonly inFlight = new Set<string | number>();
  private endpointsSeq = 0;
  private endpointsRequest: string | null = null;

  private graceTimer?: ReturnType<typeof setTimeout>;
  private probeTimer?: ReturnType<typeof setTimeout>;
  private probeDeadline?: ReturnType<typeof setTimeout>;

  constructor(config: HybridTransportConfig) {
    this.deviceId = config.deviceId;
    this.settings = {
      bluetoothGraceMs: config.bluetoothGraceMs ?? DEFAULTS.bluetoothGraceMs,
      probeIntervalMs: config.probeIntervalMs ?? DEFAULTS.probeIntervalMs,
      probeTimeoutPerUrlMs:
        config.probeTimeoutPerUrlMs ?? DEFAULTS.probeTimeoutPerUrlMs,
      switchDrainCapMs: config.switchDrainCapMs ?? DEFAULTS.switchDrainCapMs,
      quickDropMs: config.quickDropMs ?? DEFAULTS.quickDropMs,
    };
    this.encryption = config.encryption;
    this.bluetoothEnabled =
      config.bluetoothEnabled ?? isBluetoothTransportSupported();
    this.createWebSocket =
      config.createWebSocket ?? defaultWebSocket(config.deviceId);
    this.createBluetooth =
      config.createBluetooth ?? defaultBluetooth(config.deviceId);
    this.configuredUrls = [...new Set(config.wsUrls.filter(Boolean))];
    const identity = config.bluetooth;
    this.identity =
      identity && (identity.coreDeviceId || identity.peripheralId)
        ? { ...identity }
        : null;
  }

  // ── Transport ───────────────────────────────────────────────────────────

  get state(): TransportState {
    return this._state;
  }

  get isConnected(): boolean {
    if (this.switching) return true;
    return this.activeChild()?.isConnected ?? false;
  }

  get hasEverConnected(): boolean {
    return this.everConnected;
  }

  get link(): TransportLink | null {
    return this.activeChild()?.isConnected ? this.active : null;
  }

  setEventHandlers(handlers: TransportEventHandlers): void {
    this.handlers = handlers;
  }

  connect(): void {
    if (this.destroyed || this.blocked) return;
    if (this.ws || this.ble) return;
    const urls = this.wsUrls();
    if (urls.length > 0) {
      this.startWebSocket();
      this.armBluetoothGrace();
    } else if (this.canUseBluetooth()) {
      this.startBluetooth();
    } else {
      logger.warn(`[Hybrid:${this.deviceId}] Nothing to connect with`);
      return;
    }
    this.deriveState();
  }

  disconnect(): void {
    this.stopAll();
    this.setState("disconnected");
  }

  destroy(): void {
    this.destroyed = true;
    this.stopAll();
    this._state = "disconnected";
  }

  send(data: string): void {
    if (this.switching) {
      this.held.push(data);
      return;
    }
    const child = this.activeChild();
    if (!child) throw new Error("Cannot send message: not connected");
    child.send(data);
    const id = requestId(data);
    if (id !== null) this.inFlight.add(id);
  }

  immediateReconnect(): void {
    if (this.destroyed) return;
    this.paused = false;
    if (this.active === "bluetooth" && this.ble?.isConnected) {
      // A network change while on Bluetooth: Wi-Fi may be reachable now.
      this.ble.immediateReconnect();
      this.probeNow();
      return;
    }
    if (this.blocked) return;
    if (!this.ws && !this.ble) {
      this.connect();
      return;
    }
    this.ws?.immediateReconnect();
    this.ble?.immediateReconnect();
    this.recoverLostWifi();
  }

  clearEncryptionBlock(): void {
    this.blocked = false;
    this.ws?.clearEncryptionBlock();
    this.ble?.clearEncryptionBlock();
  }

  pauseHeartbeat(): void {
    this.paused = true;
    this.ws?.pauseHeartbeat();
    this.ble?.pauseHeartbeat();
    this.clearTimer("graceTimer");
    this.clearTimer("probeTimer");
    this.stopProbe();
  }

  resumeHeartbeat(): void {
    this.paused = false;
    this.ws?.resumeHeartbeat();
    this.ble?.resumeHeartbeat();
    if (this.active === "bluetooth") this.scheduleProbe();
    this.recoverLostWifi();
  }

  /**
   * Wi-Fi lost while paused (the user off in Settings turning a VPN or Wi-Fi
   * off) skips the Bluetooth grace, so arm it again on the way back.
   */
  private recoverLostWifi(): void {
    if (this.ble || this.graceTimer) return;
    if (this.ws?.isConnected !== false) return;
    this.armBluetoothGrace();
  }

  /**
   * Pairing goes over Bluetooth when that is how this Core was last reached,
   * or when no Wi-Fi address is known; otherwise over HTTP (null).
   */
  get pairsOverBluetooth(): boolean {
    return (
      this.canUseBluetooth() &&
      (this.lastLink === "bluetooth" ||
        this.active === "bluetooth" ||
        this.wsUrls().length === 0)
    );
  }

  pairingCall(): RpcCall | null {
    if (!this.pairsOverBluetooth) return null;
    if (!this.ble) this.ble = this.newBluetooth();
    const ble = this.ble as Transport & { pairingCall?: () => RpcCall | null };
    return ble.pairingCall?.() ?? null;
  }

  // ── Children ────────────────────────────────────────────────────────────

  private wsUrls(): string[] {
    return [...new Set([...this.configuredUrls, ...this.reportedUrls])];
  }

  private canUseBluetooth(): boolean {
    return this.bluetoothEnabled && this.identity !== null;
  }

  private activeChild(): Transport | null {
    if (this.active === "wifi") return this.ws;
    if (this.active === "bluetooth") return this.ble;
    return null;
  }

  private startWebSocket(): void {
    if (this.ws) return;
    const ws = this.createWebSocket(this.wsUrls(), this.encryption);
    this.ws = ws;
    ws.setEventHandlers(this.childHandlers("wifi", ws));
    ws.connect();
  }

  private newBluetooth(): Transport {
    const ble = this.createBluetooth(
      { ...(this.identity ?? {}) },
      this.encryption,
    );
    ble.setEventHandlers(this.childHandlers("bluetooth", ble));
    return ble;
  }

  private startBluetooth(): void {
    if (!this.canUseBluetooth()) return;
    if (!this.ble) this.ble = this.newBluetooth();
    this.ble.connect();
  }

  private armBluetoothGrace(): void {
    this.clearTimer("graceTimer");
    if (!this.canUseBluetooth() || this.paused) return;
    this.graceTimer = setTimeout(() => {
      this.graceTimer = undefined;
      if (this.destroyed || this.blocked) return;
      if (this.active === "wifi" && this.ws?.isConnected) return;
      logger.debug(`[Hybrid:${this.deviceId}] Wi-Fi slow; trying Bluetooth`);
      this.startBluetooth();
    }, this.settings.bluetoothGraceMs);
    void this.skipGraceWithoutWifi(this.graceTimer);
  }

  /** Starts Bluetooth at once when the phone has no network Core could be on. */
  private async skipGraceWithoutWifi(
    timer: ReturnType<typeof setTimeout>,
  ): Promise<void> {
    let connectionType: string;
    try {
      ({ connectionType } = await Network.getStatus());
    } catch {
      return;
    }
    if (connectionType !== "cellular" && connectionType !== "none") return;
    if (this.graceTimer !== timer) return;
    this.clearTimer("graceTimer");
    logger.debug(`[Hybrid:${this.deviceId}] No Wi-Fi; trying Bluetooth now`);
    this.startBluetooth();
  }

  private childHandlers(
    kind: TransportLink,
    child: Transport,
  ): TransportEventHandlers {
    const current = () =>
      kind === "wifi" ? this.ws === child : this.ble === child;
    const relevant = () =>
      current() && (this.active === kind || this.active === null);

    return {
      onOpen: (address) => {
        if (!current()) return;
        this.handleChildOpen(kind, child, address);
      },
      onStateChange: (state) => {
        if (!current()) return;
        if (
          this.active === kind &&
          (state === "reconnecting" || state === "connecting")
        ) {
          this.handleActiveLost(kind);
        }
        this.deriveState();
      },
      onClose: () => {
        if (current() && this.active === kind) this.handlers.onClose?.();
      },
      onError: (error) => {
        if (relevant()) this.handlers.onError?.(error);
      },
      onMessage: (event) => {
        if (!current() || this.active !== kind) return;
        this.handleChildMessage(event);
      },
      onHeartbeat: (rtt) => {
        (kind === "wifi" ? this.wifiQuality : this.bluetoothQuality).recordRtt(
          rtt,
        );
        if (current() && this.active === kind) this.handlers.onHeartbeat?.(rtt);
      },
      onEncryptedHandshakeOk: () => {
        if (relevant()) this.handlers.onEncryptedHandshakeOk?.();
      },
      onPlaintextMode: () => {
        if (relevant()) this.handlers.onPlaintextMode?.();
      },
      onEncryptionRequired: () => {
        if (!relevant()) return;
        this.lastLink = kind;
        this.handleBlocked(kind);
        this.handlers.onEncryptionRequired?.();
      },
      onUnsupportedVersion: () => {
        if (!relevant()) return;
        this.handleBlocked(kind);
        this.handlers.onUnsupportedVersion?.();
      },
      onCredentialsRevoked: () => {
        if (!relevant()) return;
        this.lastLink = kind;
        this.handleBlocked(kind);
        this.handlers.onCredentialsRevoked?.();
      },
      onEncryptedHandshakeRejected: () => {
        if (!relevant()) return;
        this.lastLink = kind;
        this.handleBlocked(kind);
        this.handlers.onEncryptedHandshakeRejected?.();
      },
      onBluetoothIdentity: (identity) => {
        this.identity = { ...identity };
        this.handlers.onBluetoothIdentity?.(identity);
      },
    };
  }

  private handleChildOpen(
    kind: TransportLink,
    child: Transport,
    address: string,
  ): void {
    if (this.active === kind) {
      // The active link reconnected by itself.
      if (kind === "wifi") this.wifiSince = Date.now();
      this.handlers.onOpen?.(address);
      this.handlers.onLinkChange?.(kind);
      this.sendEndpointsRequest(child);
      this.deriveState();
      return;
    }
    if (this.active !== null && this.activeChild()?.isConnected) {
      // The other link already works; this one lost the race.
      this.dropChild(kind);
      return;
    }
    this.becomeActive(kind, child, address);
  }

  private becomeActive(
    kind: TransportLink,
    child: Transport,
    address: string,
  ): void {
    const previous = this.active;
    this.active = kind;
    this.lastLink = kind;
    this.everConnected = true;
    this.clearTimer("graceTimer");
    this.dropChild(kind === "wifi" ? "bluetooth" : "wifi");
    this.inFlight.clear();
    if (kind === "wifi") {
      this.wifiSince = Date.now();
      this.cameFromBluetooth = previous === "bluetooth";
      this.clearTimer("probeTimer");
      this.stopProbe();
    } else {
      this.cameFromBluetooth = false;
      this.scheduleProbe();
    }
    logger.debug(`[Hybrid:${this.deviceId}] Using ${kind}`);
    this.setState("connected");
    this.handlers.onOpen?.(address);
    this.handlers.onLinkChange?.(kind);
    this.sendEndpointsRequest(child);
  }

  private handleActiveLost(kind: TransportLink): void {
    if (kind === "wifi") {
      const upFor = Date.now() - this.wifiSince;
      if (this.cameFromBluetooth && upFor < this.settings.quickDropMs) {
        this.quickDrops++;
      } else if (upFor >= this.settings.quickDropMs) {
        this.quickDrops = 0;
      }
      this.wifiQuality.recordFailure();
      this.handlers.onLinkChange?.(null);
      this.armBluetoothGrace();
    } else {
      this.bluetoothQuality.recordFailure();
      this.handlers.onLinkChange?.(null);
      this.probeNow();
    }
  }

  private handleBlocked(kind: TransportLink): void {
    this.blocked = true;
    this.clearTimer("graceTimer");
    this.clearTimer("probeTimer");
    this.stopProbe();
    // The other link would hit the same credentials problem; stop it. A
    // Bluetooth child stays so pairing can use its link.
    this.dropChild(kind === "wifi" ? "bluetooth" : "wifi");
    this.active = kind;
    this.handlers.onLinkChange?.(null);
    this.setState("disconnected");
  }

  private dropChild(kind: TransportLink): void {
    if (kind === "wifi" && this.ws) {
      this.ws.destroy();
      this.ws = null;
    } else if (kind === "bluetooth" && this.ble) {
      this.ble.destroy();
      this.ble = null;
    }
  }

  private stopAll(): void {
    this.clearTimer("graceTimer");
    this.clearTimer("probeTimer");
    this.stopProbe();
    if (this.switching) {
      clearTimeout(this.switching.capTimer);
      this.switching.to.destroy();
      this.switching = null;
    }
    this.held = [];
    this.inFlight.clear();
    this.dropChild("wifi");
    this.dropChild("bluetooth");
    this.active = null;
    this.endpointsRequest = null;
  }

  private deriveState(): void {
    if (this.destroyed) return;
    if (this.switching) {
      this.setState("connected");
      return;
    }
    const children = [this.ws, this.ble].filter(
      (child): child is Transport => child !== null,
    );
    const activeChild = this.activeChild();
    if (activeChild?.state === "connected") {
      this.setState("connected");
      return;
    }
    if (
      children.some(
        (child) =>
          child.state === "connecting" || child.state === "reconnecting",
      ) ||
      (activeChild === null && children.length > 0)
    ) {
      this.setState(this.everConnected ? "reconnecting" : "connecting");
      return;
    }
    this.setState("disconnected");
  }

  private setState(state: TransportState): void {
    if (this._state === state) return;
    this._state = state;
    this.handlers.onStateChange?.(state);
  }

  // ── Messages ────────────────────────────────────────────────────────────

  private sendEndpointsRequest(child: Transport): void {
    const id = `${ENDPOINTS_ID_PREFIX}${++this.endpointsSeq}`;
    this.endpointsRequest = id;
    try {
      child.send(
        JSON.stringify({ jsonrpc: "2.0", id, method: DEVICE_ENDPOINTS_METHOD }),
      );
    } catch (error) {
      logger.debug(`[Hybrid:${this.deviceId}] Endpoints request failed`, error);
    }
  }

  private handleChildMessage(event: MessageEvent): void {
    const data: unknown = event.data;
    if (
      this.endpointsRequest !== null &&
      typeof data === "string" &&
      data.includes(this.endpointsRequest)
    ) {
      const id = responseId(data);
      if (id === this.endpointsRequest) {
        this.endpointsRequest = null;
        this.handleEndpointsReply(data);
        return;
      }
    }
    const id = responseId(data);
    if (id !== null) this.inFlight.delete(id);
    this.handlers.onMessage?.(event);
    if (this.switching && this.inFlight.size === 0) this.completeSwitch();
  }

  private handleEndpointsReply(data: string): void {
    let parsed: { result?: unknown; error?: unknown };
    try {
      parsed = JSON.parse(data) as { result?: unknown; error?: unknown };
    } catch {
      return;
    }
    // Older Cores do not know the method; that only means no switching.
    if (parsed.error !== undefined) return;
    const endpoints = parseDeviceEndpointsResult(parsed.result);
    if (!endpoints) return;
    this.reportedUrls = webSocketUrlsFromEndpoints(endpoints);
    if (endpoints.ble && this.bluetoothEnabled) {
      if (!this.identity) {
        this.identity = { coreDeviceId: endpoints.deviceId };
      } else if (!this.identity.coreDeviceId) {
        this.identity = { ...this.identity, coreDeviceId: endpoints.deviceId };
      }
    }
    this.handlers.onEndpoints?.(endpoints);
    if (this.active === "bluetooth" && !this.probe && !this.switching) {
      this.probeNow();
    }
  }

  // ── Probing Wi-Fi while on Bluetooth ────────────────────────────────────

  private scheduleProbe(): void {
    this.clearTimer("probeTimer");
    if (this.paused || this.destroyed || this.blocked) return;
    const delay = probeDelay(this.settings.probeIntervalMs, this.quickDrops);
    this.probeTimer = setTimeout(() => {
      this.probeTimer = undefined;
      this.probeNow();
    }, delay);
  }

  private probeNow(): void {
    if (
      this.destroyed ||
      this.blocked ||
      this.paused ||
      this.probe ||
      this.switching ||
      this.active !== "bluetooth"
    ) {
      return;
    }
    const urls = this.wsUrls();
    if (urls.length === 0) {
      this.scheduleProbe();
      return;
    }
    this.clearTimer("probeTimer");
    const probe = this.createWebSocket(urls, this.encryption);
    this.probe = probe;
    let openedAt = 0;
    let address = "";
    const finish = (ok: boolean) => {
      if (this.probe !== probe) return;
      this.clearTimer("probeDeadline");
      if (ok) {
        this.wifiQuality.recordRtt(Date.now() - openedAt);
        const prefer =
          !this.ble?.isConnected ||
          shouldPreferWebSocket(
            this.wifiQuality.snapshot(),
            this.bluetoothQuality.snapshot(),
          );
        if (prefer) {
          this.probe = null;
          this.beginSwitch(probe, address);
          return;
        }
        logger.debug(`[Hybrid:${this.deviceId}] Wi-Fi reachable but slower`);
      } else {
        this.wifiQuality.recordFailure();
      }
      this.stopProbe();
      this.scheduleProbe();
    };
    probe.setEventHandlers({
      onOpen: (opened) => {
        if (this.probe !== probe) return;
        openedAt = Date.now();
        address = opened;
        try {
          probe.send("ping");
        } catch {
          finish(false);
        }
      },
      onEncryptedHandshakeOk: () => finish(true),
      onPlaintextMode: () => finish(true),
      onEncryptionRequired: () => finish(false),
      onCredentialsRevoked: () => finish(false),
      onEncryptedHandshakeRejected: () => finish(false),
      onUnsupportedVersion: () => finish(false),
    });
    // The socket rests between addresses, so a probe that left that out
    // would end before it reached the later ones. The last address can
    // connect at the very end of its time and still has to be verified.
    this.probeDeadline = setTimeout(
      () => finish(false),
      this.settings.probeTimeoutPerUrlMs * urls.length +
        WS_RECONNECT_INTERVAL_MS * (urls.length - 1) +
        PROBE_HANDSHAKE_ALLOWANCE_MS,
    );
    probe.connect();
  }

  private stopProbe(): void {
    this.clearTimer("probeDeadline");
    if (this.probe) {
      this.probe.destroy();
      this.probe = null;
    }
  }

  private beginSwitch(to: Transport, address: string): void {
    logger.debug(`[Hybrid:${this.deviceId}] Switching to Wi-Fi`);
    this.clearTimer("probeTimer");
    const capTimer = setTimeout(
      () => this.completeSwitch(),
      this.settings.switchDrainCapMs,
    );
    this.switching = { to, address, capTimer };
    if (this.inFlight.size === 0 || !this.ble?.isConnected) {
      this.completeSwitch();
    }
  }

  private completeSwitch(): void {
    const switching = this.switching;
    if (!switching) return;
    clearTimeout(switching.capTimer);
    this.switching = null;
    const ws = switching.to;
    if (
      !ws.isConnected &&
      this.active === "bluetooth" &&
      this.ble?.isConnected
    ) {
      // Nothing watched the socket while replies drained. It dropped in that
      // time, so Bluetooth is still the link that works: keep it.
      logger.debug(`[Hybrid:${this.deviceId}] Wi-Fi dropped before the switch`);
      ws.destroy();
      this.wifiQuality.recordFailure();
      this.releaseHeld();
      this.scheduleProbe();
      return;
    }
    this.dropChild("wifi");
    this.ws = ws;
    ws.setEventHandlers(this.childHandlers("wifi", ws));
    this.active = "wifi";
    this.lastLink = "wifi";
    this.wifiSince = Date.now();
    this.cameFromBluetooth = true;
    this.inFlight.clear();
    this.dropChild("bluetooth");
    this.handlers.onOpen?.(switching.address);
    this.handlers.onLinkChange?.("wifi");
    this.deriveState();
    this.releaseHeld();
    if (!ws.isConnected) this.handleActiveLost("wifi");
  }

  /** Sends what was held during a switch over whichever link is now active. */
  private releaseHeld(): void {
    const held = this.held;
    this.held = [];
    for (const data of held) {
      try {
        this.send(data);
      } catch (error) {
        logger.warn(`[Hybrid:${this.deviceId}] Held send failed`, error);
      }
    }
  }

  private clearTimer(
    name: "graceTimer" | "probeTimer" | "probeDeadline",
  ): void {
    const timer = this[name];
    if (timer) clearTimeout(timer);
    this[name] = undefined;
  }
}
