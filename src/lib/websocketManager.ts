import { logger } from "./logger.ts";

export enum WebSocketState {
  IDLE = "idle",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  RECONNECTING = "reconnecting",
  DISCONNECTED = "disconnected",
  ERROR = "error"
}

export interface WebSocketManagerConfig {
  url: string;
  pingInterval?: number;
  pongTimeout?: number;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  reconnectBackoffMultiplier?: number;
  maxReconnectInterval?: number;
  pingMessage?: string;
  connectionTimeout?: number;
}

export interface WebSocketManagerCallbacks {
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  onMessage?: (event: MessageEvent) => void;
  onStateChange?: (state: WebSocketState) => void;
}

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketManagerConfig>;
  private callbacks: WebSocketManagerCallbacks;
  private state: WebSocketState = WebSocketState.IDLE;
  private reconnectAttempts = 0;
  private pingTimer?: ReturnType<typeof setInterval>;
  private pongTimer?: ReturnType<typeof setTimeout>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private connectionTimer?: ReturnType<typeof setTimeout>;
  private isDestroyed = false;
  private messageQueue: string[] = [];
  private readonly MAX_QUEUE_SIZE = 100;

  constructor(
    config: WebSocketManagerConfig,
    callbacks: WebSocketManagerCallbacks = {}
  ) {
    this.config = {
      url: config.url,
      pingInterval: config.pingInterval ?? 15000,
      pongTimeout: config.pongTimeout ?? 10000,
      reconnectInterval: config.reconnectInterval ?? 1000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? Infinity,
      reconnectBackoffMultiplier: config.reconnectBackoffMultiplier ?? 1.5,
      maxReconnectInterval: config.maxReconnectInterval ?? 30000,
      pingMessage: config.pingMessage ?? "ping",
      connectionTimeout: config.connectionTimeout ?? 10000
    };
    this.callbacks = callbacks;
  }

  connect(): void {
    if (this.isDestroyed) {
      logger.warn("Cannot connect: WebSocketManager has been destroyed");
      return;
    }

    if (
      this.state === WebSocketState.CONNECTING ||
      this.state === WebSocketState.CONNECTED
    ) {
      return;
    }

    this.setState(WebSocketState.CONNECTING);
    this.createWebSocket();
  }

  /**
   * Immediately reconnect without exponential backoff
   * Used when app resumes from background
   */
  immediateReconnect(): void {
    if (this.isDestroyed) {
      logger.warn("Cannot reconnect: WebSocketManager has been destroyed");
      return;
    }

    // If already connected, do nothing
    if (this.state === WebSocketState.CONNECTED && this.ws?.readyState === WebSocket.OPEN) {
      logger.log("Already connected, skipping immediate reconnect");
      return;
    }

    logger.log("Immediate reconnect triggered");

    // Clear any pending reconnection timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    // Reset reconnect attempts to get immediate connection
    this.reconnectAttempts = 0;

    // Close existing connection if any
    this.cleanup();

    // Add a delay to allow:
    // 1. Old socket to fully close (ws.close() is async)
    // 2. Mobile network stack to be ready after app resume (iOS/Android)
    // 3. Android WebView JavaScript execution to fully resume
    setTimeout(() => {
      if (this.isDestroyed) return;
      this.connect();
    }, 1500); // 1.5 seconds - gives WebView time to fully wake up
  }

  disconnect(): void {
    this.cleanup();
    this.setState(WebSocketState.DISCONNECTED);
  }

  destroy(): void {
    this.isDestroyed = true;
    this.cleanup();
    this.setState(WebSocketState.IDLE);
  }

  send(data: string, options?: { queue?: boolean }): void {
    const shouldQueue = options?.queue ?? true;

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else if (shouldQueue) {
      // Check if queue is at capacity
      if (this.messageQueue.length >= this.MAX_QUEUE_SIZE) {
        logger.warn(
          `Message queue full (${this.MAX_QUEUE_SIZE} messages). Discarding oldest message.`
        );
        this.messageQueue.shift(); // Remove oldest message
      }
      // Queue the message for sending once reconnected
      logger.debug("WebSocket not open, queuing message");
      this.messageQueue.push(data);
    } else {
      throw new Error(
        `Cannot send message: WebSocket is not open (state: ${this.ws?.readyState})`
      );
    }
  }

  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) {
      return;
    }

    logger.debug(`Flushing ${this.messageQueue.length} queued messages`);
    const messages = [...this.messageQueue];
    this.messageQueue = [];

    messages.forEach((message) => {
      try {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(message);
        } else {
          // If connection closed during flush, re-queue remaining messages
          this.messageQueue.push(message);
        }
      } catch (error) {
        logger.error("Failed to send queued message:", error);
        // Re-queue failed message
        this.messageQueue.push(message);
      }
    });
  }

  get readyState(): number | undefined {
    return this.ws?.readyState;
  }

  get currentState(): WebSocketState {
    return this.state;
  }

  get isConnected(): boolean {
    return (
      this.state === WebSocketState.CONNECTED &&
      this.ws?.readyState === WebSocket.OPEN
    );
  }

  private createWebSocket(): void {
    try {
      this.ws = new WebSocket(this.config.url);
      this.setupEventHandlers();
      this.startConnectionTimeout();
    } catch (error) {
      logger.error("Failed to create WebSocket:", error);
      this.handleConnectionError();
    }
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      logger.debug("WebSocket connected");
      this.clearConnectionTimeout();
      this.reconnectAttempts = 0;
      this.setState(WebSocketState.CONNECTED);
      this.startHeartbeat();
      this.flushMessageQueue();
      this.callbacks.onOpen?.();
    };

    this.ws.onclose = () => {
      logger.debug("WebSocket closed");
      this.clearConnectionTimeout();
      this.stopHeartbeat();
      this.callbacks.onClose?.();
      this.handleDisconnection();
    };

    this.ws.onerror = (error) => {
      logger.error("WebSocket error:", error);
      this.clearConnectionTimeout();
      this.callbacks.onError?.(error);
      this.handleConnectionError();
    };

    this.ws.onmessage = (event) => {
      // Reset heartbeat on any message (including pong)
      this.resetHeartbeat();

      // Handle pong messages
      if (event.data === "pong") {
        this.clearPongTimeout();
        return;
      }

      this.callbacks.onMessage?.(event);
    };
  }

  private setState(newState: WebSocketState): void {
    if (this.state !== newState) {
      logger.debug(`WebSocket state change: ${this.state} -> ${newState}`);
      this.state = newState;
      this.callbacks.onStateChange?.(newState);
    }
  }

  private handleDisconnection(): void {
    if (this.isDestroyed) return;

    this.setState(WebSocketState.RECONNECTING);
    this.scheduleReconnect();
  }

  private handleConnectionError(): void {
    if (this.isDestroyed) return;

    this.setState(WebSocketState.ERROR);
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (
      this.isDestroyed ||
      this.reconnectAttempts >= this.config.maxReconnectAttempts
    ) {
      this.setState(WebSocketState.DISCONNECTED);
      return;
    }

    // Calculate backoff delay with jitter
    const baseDelay = this.config.reconnectInterval;
    const backoffDelay =
      baseDelay *
      Math.pow(this.config.reconnectBackoffMultiplier, this.reconnectAttempts);
    const cappedDelay = Math.min(
      backoffDelay,
      this.config.maxReconnectInterval
    );

    // Add random jitter (0-50% of the delay) to prevent synchronized reconnection attempts
    const jitter = Math.random() * cappedDelay * 0.5;
    const delay = Math.floor(cappedDelay + jitter);

    logger.debug(
      `Scheduling reconnect attempt ${this.reconnectAttempts + 1} in ${delay}ms (base: ${cappedDelay}ms + jitter: ${Math.floor(jitter)}ms)`
    );

    this.reconnectTimer = setTimeout(() => {
      if (this.isDestroyed) return;

      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(this.config.pingMessage);
          this.startPongTimeout();
        } catch (error) {
          logger.error("Failed to send ping:", error);
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
    this.clearPongTimeout();
    // Restart ping timer
    if (this.pingTimer) {
      this.stopHeartbeat();
      this.startHeartbeat();
    }
  }

  private startPongTimeout(): void {
    this.clearPongTimeout();
    this.pongTimer = setTimeout(() => {
      logger.warn("Pong timeout - closing connection");
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
      logger.warn(`Connection timeout after ${this.config.connectionTimeout}ms - closing connection`);
      // Close the WebSocket to trigger reconnection logic
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
      // Remove event handlers to prevent callbacks during cleanup
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
