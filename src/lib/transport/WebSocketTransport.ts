/**
 * WebSocket transport implementation.
 *
 * Handles WebSocket connection with automatic reconnection and heartbeat.
 * Message queuing is handled at the CoreAPI level, not here.
 */

import { logger } from "../logger";
import type {
  Transport,
  TransportEventHandlers,
  TransportState,
} from "./types";

export interface WebSocketTransportConfig {
  /** Device identifier */
  deviceId: string;
  /** WebSocket URL */
  url: string;
  /** Interval between ping messages (ms) */
  pingInterval?: number;
  /** Timeout waiting for pong response (ms) */
  pongTimeout?: number;
  /** Reconnect delay (ms) */
  reconnectInterval?: number;
  /** Maximum number of reconnect attempts */
  maxReconnectAttempts?: number;
  /** Ping message content */
  pingMessage?: string;
  /** Connection timeout (ms) */
  connectionTimeout?: number;
}

const DEFAULT_CONFIG: Omit<
  Required<WebSocketTransportConfig>,
  "deviceId" | "url"
> = {
  pingInterval: 15000,
  pongTimeout: 10000,
  reconnectInterval: 2000,
  maxReconnectAttempts: Infinity,
  pingMessage: "ping",
  connectionTimeout: 5000,
};

export class WebSocketTransport implements Transport {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketTransportConfig>;
  private handlers: TransportEventHandlers = {};
  private _state: TransportState = "disconnected";
  private reconnectAttempts = 0;
  private pingTimeoutId?: ReturnType<typeof setTimeout>;
  private pongTimeoutId?: ReturnType<typeof setTimeout>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private immediateReconnectTimer?: ReturnType<typeof setTimeout>;
  private connectionTimer?: ReturnType<typeof setTimeout>;
  private isDestroyed = false;
  private _hasConnectedBefore = false;
  private heartbeatPaused = false;

  readonly deviceId: string;

  constructor(config: WebSocketTransportConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.deviceId = config.deviceId;
  }

  get state(): TransportState {
    return this._state;
  }

  get isConnected(): boolean {
    return (
      this._state === "connected" && this.ws?.readyState === WebSocket.OPEN
    );
  }

  get hasEverConnected(): boolean {
    return this._hasConnectedBefore;
  }

  setEventHandlers(handlers: TransportEventHandlers): void {
    this.handlers = handlers;
  }

  connect(): void {
    if (this.isDestroyed) {
      logger.warn(
        `[Transport:${this.deviceId}] Cannot connect: transport destroyed`,
      );
      return;
    }

    // Skip if already in a connecting/connected state
    // Note: "reconnecting" is allowed to proceed since we may need to create a new WebSocket
    if (this._state === "connecting" || this._state === "connected") {
      return;
    }

    // Use "reconnecting" state if we've connected before, "connecting" for first connection
    // This prevents state flickering during reconnection loops
    if (this._hasConnectedBefore && this._state !== "reconnecting") {
      this.setState("reconnecting");
    } else if (!this._hasConnectedBefore) {
      this.setState("connecting");
    }
    // If already in "reconnecting" state, don't change it (prevents unnecessary re-renders)
    this.createWebSocket();
  }

  disconnect(): void {
    this.cleanup();
    this.setState("disconnected");
  }

  destroy(): void {
    this.isDestroyed = true;
    this.cleanup();
    this._state = "disconnected";
  }

  send(data: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      throw new Error(
        `Cannot send message: WebSocket not open (state: ${this.ws?.readyState})`,
      );
    }
  }

  immediateReconnect(): void {
    if (this.isDestroyed) {
      logger.warn(
        `[Transport:${this.deviceId}] Cannot reconnect: transport destroyed`,
      );
      return;
    }

    if (this._state === "connected" && this.ws?.readyState === WebSocket.OPEN) {
      logger.log(
        `[Transport:${this.deviceId}] Already connected, resuming heartbeat`,
      );
      // Resume heartbeat to detect stale connections (e.g., device went away while app was in background)
      this.resumeHeartbeat();
      return;
    }

    logger.log(`[Transport:${this.deviceId}] Immediate reconnect triggered`);

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    // Clear any pending immediate reconnect timer to prevent race conditions
    // when multiple reconnection triggers fire in quick succession
    if (this.immediateReconnectTimer) {
      clearTimeout(this.immediateReconnectTimer);
      this.immediateReconnectTimer = undefined;
    }

    this.reconnectAttempts = 0;
    this.cleanup();

    // Set state to allow connect() to proceed
    // Use "reconnecting" if we've connected before to maintain consistent UI state
    if (this._hasConnectedBefore) {
      this.setState("reconnecting");
    } else {
      this.setState("disconnected");
    }

    // Brief delay to allow network stack to be ready after app resume
    // Track this timeout so it can be cancelled by subsequent calls
    this.immediateReconnectTimer = setTimeout(() => {
      this.immediateReconnectTimer = undefined;
      if (this.isDestroyed) return;
      this.connect();
    }, 500);
  }

  pauseHeartbeat(): void {
    logger.debug(`[Transport:${this.deviceId}] Pausing heartbeat`);
    this.heartbeatPaused = true;
    this.heartReset();

    // Cancel any pending immediate reconnect to prevent connections opening in background
    if (this.immediateReconnectTimer) {
      clearTimeout(this.immediateReconnectTimer);
      this.immediateReconnectTimer = undefined;
    }
  }

  resumeHeartbeat(): void {
    if (this._state === "connected" && this.ws?.readyState === WebSocket.OPEN) {
      logger.debug(`[Transport:${this.deviceId}] Resuming heartbeat`);
      this.heartbeatPaused = false;
      this.heartCheck();
    }
  }

  // Private methods

  private setState(newState: TransportState): void {
    if (this._state !== newState) {
      logger.debug(
        `[Transport:${this.deviceId}] State: ${this._state} -> ${newState}`,
      );
      this._state = newState;
      this.handlers.onStateChange?.(newState);
    }
  }

  private createWebSocket(): void {
    try {
      this.ws = new WebSocket(this.config.url);
      this.setupEventHandlers();
      this.startConnectionTimeout();
    } catch (error) {
      // Check if this is an invalid URL error (e.g., invalid IP address like 192.168.1.286)
      // These are user input errors, not application bugs, so we use warn instead of error
      // to avoid polluting error tracking with non-actionable reports
      const isInvalidUrlError =
        error instanceof DOMException &&
        error.message.includes("did not match the expected pattern");

      if (isInvalidUrlError) {
        logger.warn(
          `[Transport:${this.deviceId}] Invalid device address format`,
        );
        // Provide a user-friendly error message
        this.handlers.onError?.(new Error("Invalid device address format"));
      } else {
        logger.error(
          `[Transport:${this.deviceId}] Failed to create WebSocket:`,
          error,
        );
      }
      this.handleConnectionError();
    }
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      logger.debug(`[Transport:${this.deviceId}] WebSocket connected`);
      this.clearConnectionTimeout();
      this.reconnectAttempts = 0;
      this._hasConnectedBefore = true;
      this.setState("connected");
      this.startHeartbeat();
      this.handlers.onOpen?.();
    };

    this.ws.onclose = () => {
      logger.debug(`[Transport:${this.deviceId}] WebSocket closed`);
      this.clearConnectionTimeout();
      this.heartReset();
      this.handlers.onClose?.();
      this.handleDisconnection();
    };

    this.ws.onerror = (event: Event) => {
      logger.error(`[Transport:${this.deviceId}] WebSocket error:`, event);
      this.clearConnectionTimeout();
      // WebSocket error events don't expose details for security reasons,
      // but we can check if it's an ErrorEvent which may have a message
      const errorEvent = event as ErrorEvent;
      const message =
        errorEvent.message || `Failed to connect to ${this.config.url}`;
      this.handlers.onError?.(new Error(message));
      this.handleConnectionError();
    };

    this.ws.onmessage = (event) => {
      // Reset heartbeat cycle on any message - this proves connection is alive
      this.heartCheck();

      // Handle pong messages - no further processing needed
      if (event.data === "pong") {
        return;
      }

      this.handlers.onMessage?.(event);
    };
  }

  private handleDisconnection(): void {
    if (this.isDestroyed) return;
    // Only use "reconnecting" state if we've successfully connected before
    // Otherwise stay in "connecting" state for initial connection attempts
    if (this._hasConnectedBefore) {
      this.setState("reconnecting");
    }
    this.scheduleReconnect();
  }

  private handleConnectionError(): void {
    if (this.isDestroyed) return;
    // Only use "reconnecting" state if we've successfully connected before
    // Otherwise stay in "connecting" state for initial connection attempts
    if (this._hasConnectedBefore) {
      this.setState("reconnecting");
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (
      this.isDestroyed ||
      this.reconnectAttempts >= this.config.maxReconnectAttempts
    ) {
      this.setState("disconnected");
      return;
    }

    // Guard against duplicate scheduling (e.g., both onerror and onclose firing)
    if (this.reconnectTimer) {
      return;
    }

    // Use fixed interval for local network devices - no backoff needed
    const delay = this.config.reconnectInterval;

    logger.debug(
      `[Transport:${this.deviceId}] Reconnect attempt ${this.reconnectAttempts + 1} in ${delay}ms`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.isDestroyed) return;
      this.reconnectAttempts++;
      // Reset state to allow connect() to proceed
      // This is necessary because after a failed initial connection,
      // state is still "connecting" which would cause connect() to return early
      if (this._hasConnectedBefore) {
        this.setState("reconnecting");
      } else {
        this.setState("disconnected");
      }
      this.connect();
    }, delay);
  }

  /**
   * Start the heartbeat cycle. Called on connection open and resume.
   * Uses setTimeout-based approach from websocket-heartbeat-js for reliable disconnect detection.
   */
  private startHeartbeat(): void {
    this.heartbeatPaused = false;
    this.heartCheck();
  }

  /**
   * Stop all heartbeat timers.
   */
  private stopHeartbeat(): void {
    this.heartReset();
  }

  /**
   * Reset and restart the heartbeat cycle.
   * Called on any message received to reset the ping timer.
   */
  private heartCheck(): void {
    this.heartReset();
    this.heartStart();
  }

  /**
   * Start the ping timeout. After pingInterval, sends ping and starts pong timeout.
   */
  private heartStart(): void {
    if (this.isDestroyed || this.heartbeatPaused) return;

    this.pingTimeoutId = setTimeout(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(this.config.pingMessage);

          // Start pong timeout - if no response, force disconnect
          this.pongTimeoutId = setTimeout(() => {
            logger.warn(
              `[Transport:${this.deviceId}] Pong timeout - forcing disconnect`,
            );
            // Close the WebSocket
            this.ws?.close();
            // Force disconnect handling immediately, don't wait for onclose event
            // This ensures we detect dead connections even if browser doesn't fire onclose
            this.stopHeartbeat();
            this.handleDisconnection();
          }, this.config.pongTimeout);
        } catch (error) {
          logger.error(
            `[Transport:${this.deviceId}] Failed to send ping:`,
            error,
          );
          this.handleConnectionError();
        }
      }
    }, this.config.pingInterval);
  }

  /**
   * Clear all heartbeat timers.
   */
  private heartReset(): void {
    if (this.pingTimeoutId) {
      clearTimeout(this.pingTimeoutId);
      this.pingTimeoutId = undefined;
    }
    if (this.pongTimeoutId) {
      clearTimeout(this.pongTimeoutId);
      this.pongTimeoutId = undefined;
    }
  }

  private startConnectionTimeout(): void {
    this.clearConnectionTimeout();
    this.connectionTimer = setTimeout(() => {
      logger.warn(`[Transport:${this.deviceId}] Connection timeout`);
      if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
    }, this.config.connectionTimeout);
  }

  private clearConnectionTimeout(): void {
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = undefined;
    }
  }

  private cleanup(): void {
    this.heartReset();
    this.clearConnectionTimeout();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.immediateReconnectTimer) {
      clearTimeout(this.immediateReconnectTimer);
      this.immediateReconnectTimer = undefined;
    }

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;

      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
  }
}
