/**
 * Transport abstraction layer for device communication.
 *
 * This provides a unified interface for WebSocket and future Bluetooth transports,
 * enabling multi-device connections and transport-agnostic communication.
 */

/**
 * Possible states of a transport connection.
 */
export type TransportState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

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
