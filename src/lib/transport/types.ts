/**
 * Transport abstraction layer for device communication.
 *
 * This provides a unified interface for WebSocket and future Bluetooth transports,
 * enabling multi-device connections and transport-agnostic communication.
 */

import type { StoredCredentials } from "../crypto/credentials";
import type { RpcCall } from "../crypto/pairing";

/** The physical link a connection currently runs over. */
export type TransportLink = "wifi" | "bluetooth";

/** How to find a Core over Bluetooth LE. */
export interface BluetoothIdentity {
  /** Core's device id, as reported by Info and device.endpoints. */
  coreDeviceId?: string;
  /** The phone's handle for the peripheral, when one is known. */
  peripheralId?: string;
}

/** A learned Bluetooth identity for a Core. */
export interface LearnedBluetoothIdentity {
  coreDeviceId: string;
  peripheralId: string;
}

/** The result of Core's device.endpoints method. */
export interface DeviceEndpointsResult {
  deviceId: string;
  /** The name Core goes by on the network, when it said. */
  name?: string;
  scheme: string;
  addresses: string[];
  port: number;
  ble: boolean;
}

/**
 * Possible states of a transport connection.
 */
export type TransportState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

/**
 * Encryption configuration for a transport.
 * When provided and credentials exist, the transport requires an encrypted session.
 * Without credentials, plaintext is attempted; if the server demands encryption
 * (-32002), the connection fails so the consumer can prompt for pairing.
 */
export interface TransportEncryptionConfig {
  /** Lazily read on each connect so reconnects always see the latest credentials. */
  getCredentials: () => Promise<StoredCredentials | null>;
}

/**
 * Configuration for creating a transport.
 */
export interface TransportConfig {
  /** Unique identifier for the device */
  deviceId: string;
  /** Transport type */
  type: TransportType;
  /** Primary WebSocket address. Empty for a device known only by Bluetooth. */
  address: string;
  /** Alternate addresses for the same canonical device. */
  fallbackAddresses?: readonly string[];
  /** Optional encryption config */
  encryption?: TransportEncryptionConfig;
  /** Bluetooth identity for the bluetooth and hybrid transports. */
  bluetooth?: BluetoothIdentity;
}

/**
 * websocket: Wi-Fi only. bluetooth: Bluetooth LE only. hybrid: whichever of
 * the two works best, switching between them while connected.
 */
export type TransportType = "websocket" | "bluetooth" | "hybrid";

/**
 * Event handlers for transport events.
 */
export interface TransportEventHandlers {
  /** Called when the transport opens successfully at the selected address. */
  onOpen?: (address: string) => void;
  /** Called when the transport closes */
  onClose?: () => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
  /** Called when a message is received */
  onMessage?: (event: MessageEvent) => void;
  /** Called when the transport state changes */
  onStateChange?: (state: TransportState) => void;
  /** Called once when the first encrypted frame is successfully decrypted. */
  onEncryptedHandshakeOk?: () => void;
  /** Called when the transport commits to a plaintext session (no credentials, server doesn't demand encryption). */
  onPlaintextMode?: () => void;
  /** Called when the server returned -32002 (encryption required, must pair). */
  onEncryptionRequired?: () => void;
  /** Called when the server returned -32001 (unsupported encryption version). */
  onUnsupportedVersion?: () => void;
  /** Called when the server rejects our stored credentials (-32002 in encrypted mode). */
  onCredentialsRevoked?: () => void;
  /**
   * Called when the server keeps closing the socket during the encrypted
   * handshake without an error frame, which Core does for an unknown auth token.
   */
  onEncryptedHandshakeRejected?: () => void;
  /** Round-trip time of a completed heartbeat ping. */
  onHeartbeat?: (rttMs: number) => void;
  /** The connection moved to another link, or lost its link (null). */
  onLinkChange?: (link: TransportLink | null) => void;
  /** Bluetooth found the Core and learned how to reach it again. */
  onBluetoothIdentity?: (identity: LearnedBluetoothIdentity) => void;
  /** Core reported the addresses it can be reached at. */
  onEndpoints?: (endpoints: DeviceEndpointsResult) => void;
}

/**
 * Transport interface - implemented by WebSocketTransport, BluetoothTransport, etc.
 */
export interface Transport {
  /** Current connection state */
  readonly state: TransportState;
  /** Unique device identifier */
  readonly deviceId: string;
  /** Whether the transport is currently connected and ready to send */
  readonly isConnected: boolean;
  /** Whether this transport has ever successfully connected */
  readonly hasEverConnected: boolean;

  /**
   * Initiate connection.
   */
  connect(): void;

  /**
   * Disconnect and stop reconnection attempts.
   */
  disconnect(): void;

  /**
   * Send a message. Throws if not connected.
   * @param data - The message to send
   */
  send(data: string): void;

  /**
   * Immediately attempt reconnection (used for app resume).
   */
  immediateReconnect(): void;

  /**
   * Clear the encryption-blocked state. The consumer must call this after
   * resolving the cause of the block (e.g. successful pairing). Until it is
   * called, connect()/immediateReconnect() are no-ops to prevent lifecycle
   * events (app resume, visibilitychange, network change) from looping the
   * client through the same -32002 rejection on every wake.
   */
  clearEncryptionBlock(): void;

  /**
   * Pause heartbeat (used when tab/app is hidden).
   */
  pauseHeartbeat(): void;

  /**
   * Resume heartbeat (used when tab/app becomes visible).
   */
  resumeHeartbeat(): void;

  /**
   * Clean up resources and stop all activity.
   */
  destroy(): void;

  /**
   * Set event handlers.
   * @param handlers - Event handler callbacks
   */
  setEventHandlers(handlers: TransportEventHandlers): void;

  /** The link in use while connected; transports with one link may omit it. */
  readonly link?: TransportLink | null;

  /**
   * A plaintext JSON-RPC call for pairing over this transport, or null when
   * pairing goes over HTTP instead.
   */
  pairingCall?(): RpcCall | null;

  /** Whether pairing would run over Bluetooth rather than HTTP. */
  readonly pairsOverBluetooth?: boolean;
}

/**
 * Record of a device connection, used for state management.
 */
export interface DeviceConnection {
  /** Unique device identifier */
  deviceId: string;
  /** Connection address */
  address: string;
  /** Transport type */
  type: TransportType;
  /** The link in use, when known. */
  link?: TransportLink | null;
  /** Current connection state */
  state: TransportState;
  /** Whether we have received data from this device */
  hasData: boolean;
  /** Timestamp of last data received */
  lastDataTimestamp: number | null;
  /** Whether this device has ever successfully connected (used to distinguish initial vs reconnect) */
  hasConnectedBefore: boolean;
}
