/**
 * ConnectionManager - Manages multiple device connections.
 *
 * Supports multiple simultaneous connections with one "active" device.
 * Routes messages to the active transport and handles lifecycle events.
 */

import { logger } from "../logger";
import type {
  Transport,
  TransportConfig,
  DeviceConnection,
  TransportEventHandlers,
} from "./types";
import { WebSocketTransport } from "./WebSocketTransport";

export interface ConnectionManagerEventHandlers {
  /** Called when any connection state changes */
  onConnectionChange?: (deviceId: string, connection: DeviceConnection) => void;
  /** Called when a message is received from any device */
  onMessage?: (deviceId: string, event: MessageEvent) => void;
  /** Called when the active device changes */
  onActiveDeviceChange?: (deviceId: string | null) => void;
}

export class ConnectionManager {
  private transports = new Map<string, Transport>();
  private connections = new Map<string, DeviceConnection>();
  private activeDeviceId: string | null = null;
  private handlers: ConnectionManagerEventHandlers = {};
  private isPaused = false;

  /**
   * Set event handlers for connection manager events.
   */
  setEventHandlers(handlers: ConnectionManagerEventHandlers): void {
    this.handlers = handlers;
  }

  /**
   * Add a new device connection.
   */
  addDevice(config: TransportConfig): Transport {
    // Remove existing connection with same deviceId if any
    if (this.transports.has(config.deviceId)) {
      this.removeDevice(config.deviceId);
    }

    logger.log(`[ConnectionManager] Adding device: ${config.deviceId}`);

    // Create transport based on type
    const transport = this.createTransport(config);

    // Initialize connection record
    const connection: DeviceConnection = {
      deviceId: config.deviceId,
      address: config.address,
      type: config.type,
      state: "disconnected",
      hasData: false,
      lastDataTimestamp: null,
      hasConnectedBefore: false,
    };

    // Setup event handlers
    const transportHandlers: TransportEventHandlers = {
      onOpen: () => {
        // State change is handled by onStateChange callback
        logger.debug(`[ConnectionManager] Transport ${config.deviceId} opened`);
      },
      onClose: () => {
        // State will be updated by onStateChange
      },
      onError: (error) => {
        logger.error(
          `[ConnectionManager] Device ${config.deviceId} error:`,
          error,
        );
      },
      onMessage: (event) => {
        // Mark that we've received data (internal tracking only - don't trigger React re-renders)
        connection.hasData = true;
        connection.lastDataTimestamp = Date.now();
        this.connections.set(config.deviceId, { ...connection });
        this.handlers.onMessage?.(config.deviceId, event);
      },
      onStateChange: (state) => {
        connection.state = state;
        // Sync hasConnectedBefore from transport
        connection.hasConnectedBefore = transport.hasEverConnected;
        this.connections.set(config.deviceId, { ...connection });
        this.handlers.onConnectionChange?.(config.deviceId, { ...connection });
      },
    };

    transport.setEventHandlers(transportHandlers);

    // Store transport and connection
    this.transports.set(config.deviceId, transport);
    this.connections.set(config.deviceId, connection);

    // Connect if not paused
    if (!this.isPaused) {
      transport.connect();
    }

    return transport;
  }

  /**
   * Remove a device connection.
   */
  removeDevice(deviceId: string): void {
    logger.log(`[ConnectionManager] Removing device: ${deviceId}`);

    const transport = this.transports.get(deviceId);
    if (transport) {
      transport.destroy();
      this.transports.delete(deviceId);
    }

    this.connections.delete(deviceId);

    // Clear active device if it was removed
    if (this.activeDeviceId === deviceId) {
      this.activeDeviceId = null;
      this.handlers.onActiveDeviceChange?.(null);
    }
  }

  /**
   * Set the active device for message routing.
   */
  setActiveDevice(deviceId: string | null): void {
    if (this.activeDeviceId === deviceId) return;

    if (deviceId && !this.transports.has(deviceId)) {
      logger.warn(
        `[ConnectionManager] Cannot set active: device ${deviceId} not found`,
      );
      return;
    }

    logger.log(`[ConnectionManager] Active device: ${deviceId}`);
    this.activeDeviceId = deviceId;
    this.handlers.onActiveDeviceChange?.(deviceId);
  }

  /**
   * Get the active device ID.
   */
  getActiveDeviceId(): string | null {
    return this.activeDeviceId;
  }

  /**
   * Get a transport by device ID.
   */
  getTransport(deviceId: string): Transport | undefined {
    return this.transports.get(deviceId);
  }

  /**
   * Get the active transport.
   */
  getActiveTransport(): Transport | null {
    return this.activeDeviceId
      ? (this.transports.get(this.activeDeviceId) ?? null)
      : null;
  }

  /**
   * Get connection info for a device.
   */
  getConnection(deviceId: string): DeviceConnection | undefined {
    return this.connections.get(deviceId);
  }

  /**
   * Get the active connection info.
   */
  getActiveConnection(): DeviceConnection | null {
    return this.activeDeviceId
      ? (this.connections.get(this.activeDeviceId) ?? null)
      : null;
  }

  /**
   * Get all connections.
   */
  getAllConnections(): Map<string, DeviceConnection> {
    return new Map(this.connections);
  }

  /**
   * Send a message to the active device.
   */
  sendToActive(data: string, options?: { queue?: boolean }): void {
    const transport = this.getActiveTransport();
    if (!transport) {
      logger.warn("[ConnectionManager] Cannot send: no active device");
      return;
    }
    transport.send(data, options);
  }

  /**
   * Send a message to a specific device.
   */
  sendToDevice(
    deviceId: string,
    data: string,
    options?: { queue?: boolean },
  ): void {
    const transport = this.transports.get(deviceId);
    if (!transport) {
      logger.warn(
        `[ConnectionManager] Cannot send: device ${deviceId} not found`,
      );
      return;
    }
    transport.send(data, options);
  }

  /**
   * Check if the active device is connected.
   */
  isActiveConnected(): boolean {
    const transport = this.getActiveTransport();
    return transport?.isConnected ?? false;
  }

  /**
   * Pause all connections (used when app goes to background).
   */
  pauseAll(): void {
    logger.log("[ConnectionManager] Pausing all connections");
    this.isPaused = true;
    this.transports.forEach((transport) => {
      transport.pauseHeartbeat();
    });
  }

  /**
   * Resume all connections (used when app comes to foreground).
   */
  resumeAll(): void {
    logger.log("[ConnectionManager] Resuming all connections");
    this.isPaused = false;
    this.transports.forEach((transport) => {
      transport.immediateReconnect();
    });
  }

  /**
   * Trigger immediate reconnect on the active device.
   */
  immediateReconnectActive(): void {
    const transport = this.getActiveTransport();
    if (transport) {
      transport.immediateReconnect();
    }
  }

  /**
   * Destroy all connections and clean up.
   */
  destroy(): void {
    logger.log("[ConnectionManager] Destroying all connections");
    this.transports.forEach((transport) => {
      transport.destroy();
    });
    this.transports.clear();
    this.connections.clear();
    this.activeDeviceId = null;
  }

  /**
   * Create a transport based on config type.
   */
  private createTransport(config: TransportConfig): Transport {
    switch (config.type) {
      case "websocket":
        return new WebSocketTransport({
          deviceId: config.deviceId,
          url: config.address,
          pingInterval: 15000,
          pongTimeout: 15000,
          reconnectInterval: 1000,
          maxReconnectAttempts: Infinity,
          reconnectBackoffMultiplier: 1.5,
          maxReconnectInterval: 30000,
          pingMessage: "ping",
          connectionTimeout: 10000,
        });

      case "bluetooth":
        // Placeholder for future Bluetooth transport
        throw new Error("Bluetooth transport not yet implemented");

      default:
        throw new Error(`Unknown transport type: ${config.type}`);
    }
  }
}

// Singleton instance
export const connectionManager = new ConnectionManager();
