/**
 * WebSocket transport implementation.
 *
 * Handles WebSocket connection with automatic reconnection, heartbeat,
 * and message queuing.
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
  /** Initial reconnect delay (ms) */
  reconnectInterval?: number;
  /** Maximum number of reconnect attempts */
  maxReconnectAttempts?: number;
  /** Backoff multiplier for reconnect delay */
  reconnectBackoffMultiplier?: number;
  /** Maximum reconnect delay (ms) */
  maxReconnectInterval?: number;
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
  reconnectInterval: 1000,
  maxReconnectAttempts: Infinity,
  reconnectBackoffMultiplier: 1.5,
  maxReconnectInterval: 30000,
  pingMessage: "ping",
  connectionTimeout: 10000,
};

export class WebSocketTransport implements Transport {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketTransportConfig>;
  private handlers: TransportEventHandlers = {};
  private _state: TransportState = "disconnected";
  private reconnectAttempts = 0;
  private pingTimer?: ReturnType<typeof setInterval>;
  private pongTimer?: ReturnType<typeof setTimeout>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private connectionTimer?: ReturnType<typeof setTimeout>;
  private isDestroyed = false;
  private messageQueue: string[] = [];
  private readonly MAX_QUEUE_SIZE = 100;
  private _hasConnectedBefore = false;

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

  send(data: string, options?: { queue?: boolean }): void {
    const shouldQueue = options?.queue ?? true;

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else if (shouldQueue) {
      if (this.messageQueue.length >= this.MAX_QUEUE_SIZE) {
        logger.warn(
          `[Transport:${this.deviceId}] Message queue full. Discarding oldest message.`,
        );
        this.messageQueue.shift();
      }
      logger.debug(`[Transport:${this.deviceId}] Queuing message`);
      this.messageQueue.push(data);
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
        `[Transport:${this.deviceId}] Already connected, skipping reconnect`,
      );
      return;
    }

    logger.log(`[Transport:${this.deviceId}] Immediate reconnect triggered`);

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
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
    setTimeout(() => {
      if (this.isDestroyed) return;
      this.connect();
    }, 500);
  }

  pauseHeartbeat(): void {
    logger.debug(`[Transport:${this.deviceId}] Pausing heartbeat`);
    this.stopHeartbeat();
  }

  resumeHeartbeat(): void {
    if (this._state === "connected" && this.ws?.readyState === WebSocket.OPEN) {
      logger.debug(`[Transport:${this.deviceId}] Resuming heartbeat`);
      this.startHeartbeat();
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
      logger.error(
        `[Transport:${this.deviceId}] Failed to create WebSocket:`,
        error,
      );
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
      this.flushMessageQueue();
      this.handlers.onOpen?.();
    };

    this.ws.onclose = () => {
      logger.debug(`[Transport:${this.deviceId}] WebSocket closed`);
      this.clearConnectionTimeout();
      this.stopHeartbeat();
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
      // Reset heartbeat on any message
      this.resetHeartbeat();

      // Handle pong messages
      if (event.data === "pong") {
        this.clearPongTimeout();
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

    // Calculate backoff delay with jitter
    const baseDelay = this.config.reconnectInterval;
    const backoffDelay =
      baseDelay *
      Math.pow(this.config.reconnectBackoffMultiplier, this.reconnectAttempts);
    const cappedDelay = Math.min(
      backoffDelay,
      this.config.maxReconnectInterval,
    );
    const jitter = Math.random() * cappedDelay * 0.5;
    const delay = Math.floor(cappedDelay + jitter);

    logger.debug(
      `[Transport:${this.deviceId}] Reconnect attempt ${this.reconnectAttempts + 1} in ${delay}ms`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.isDestroyed) return;
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) return;

    logger.debug(
      `[Transport:${this.deviceId}] Flushing ${this.messageQueue.length} queued messages`,
    );
    const messages = [...this.messageQueue];
    this.messageQueue = [];

    messages.forEach((message) => {
      try {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(message);
        } else {
          this.messageQueue.push(message);
        }
      } catch (error) {
        logger.error(
          `[Transport:${this.deviceId}] Failed to send queued message:`,
          error,
        );
        this.messageQueue.push(message);
      }
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(this.config.pingMessage);
          this.startPongTimeout();
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

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
    this.clearPongTimeout();
  }

  private resetHeartbeat(): void {
    // On message receive, just clear the pong timeout - the ping interval continues as normal.
    // No need to restart the entire interval; that was causing unnecessary overhead.
    this.clearPongTimeout();
  }

  private startPongTimeout(): void {
    this.clearPongTimeout();
    this.pongTimer = setTimeout(() => {
      logger.warn(
        `[Transport:${this.deviceId}] Pong timeout - closing connection`,
      );
      this.ws?.close();
    }, this.config.pongTimeout);
  }

  private clearPongTimeout(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = undefined;
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
    this.stopHeartbeat();
    this.clearConnectionTimeout();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
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
