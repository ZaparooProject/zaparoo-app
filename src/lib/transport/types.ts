/**
 * Transport abstraction layer for device communication.
 *
 * This provides a unified interface for WebSocket and future Bluetooth transports,
 * enabling multi-device connections and transport-agnostic communication.
 */

import type { StoredCredentials } from "../crypto/credentials";

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
  type: "websocket" | "bluetooth";
  /** Connection address (IP:port for WS, device ID for BT) */
  address: string;
  /** Optional encryption config */
  encryption?: TransportEncryptionConfig;
}

/**
 * Event handlers for transport events.
 */
export interface TransportEventHandlers {
  /** Called when the transport opens successfully */
  onOpen?: () => void;
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
  type: "websocket" | "bluetooth";
  /** Current connection state */
  state: TransportState;
  /** Whether we have received data from this device */
  hasData: boolean;
  /** Timestamp of last data received */
  lastDataTimestamp: number | null;
  /** Whether this device has ever successfully connected (used to distinguish initial vs reconnect) */
  hasConnectedBefore: boolean;
}
