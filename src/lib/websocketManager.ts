export enum WebSocketState {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  DISCONNECTED = 'disconnected',
  ERROR = 'error'
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
  private isDestroyed = false;

  constructor(config: WebSocketManagerConfig, callbacks: WebSocketManagerCallbacks = {}) {
    this.config = {
      url: config.url,
      pingInterval: config.pingInterval ?? 15000,
      pongTimeout: config.pongTimeout ?? 10000,
      reconnectInterval: config.reconnectInterval ?? 1000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? Infinity,
      reconnectBackoffMultiplier: config.reconnectBackoffMultiplier ?? 1.5,
      maxReconnectInterval: config.maxReconnectInterval ?? 30000,
      pingMessage: config.pingMessage ?? 'ping'
    };
    this.callbacks = callbacks;
  }

  connect(): void {
    if (this.isDestroyed) {
      console.warn('Cannot connect: WebSocketManager has been destroyed');
      return;
    }

    if (this.state === WebSocketState.CONNECTING || this.state === WebSocketState.CONNECTED) {
      return;
    }

    this.setState(WebSocketState.CONNECTING);
    this.createWebSocket();
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

  send(data: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      throw new Error(`Cannot send message: WebSocket is not open (state: ${this.ws?.readyState})`);
    }
  }

  get readyState(): number | undefined {
    return this.ws?.readyState;
  }

  get currentState(): WebSocketState {
    return this.state;
  }

  get isConnected(): boolean {
    return this.state === WebSocketState.CONNECTED && this.ws?.readyState === WebSocket.OPEN;
  }

  private createWebSocket(): void {
    try {
      this.ws = new WebSocket(this.config.url);
      this.setupEventHandlers();
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.handleConnectionError();
    }
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      console.debug('WebSocket connected');
      this.reconnectAttempts = 0;
      this.setState(WebSocketState.CONNECTED);
      this.startHeartbeat();
      this.callbacks.onOpen?.();
    };

    this.ws.onclose = () => {
      console.debug('WebSocket closed');
      this.stopHeartbeat();
      this.callbacks.onClose?.();
      this.handleDisconnection();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.callbacks.onError?.(error);
      this.handleConnectionError();
    };

    this.ws.onmessage = (event) => {
      // Reset heartbeat on any message (including pong)
      this.resetHeartbeat();

      // Handle pong messages
      if (event.data === 'pong') {
        this.clearPongTimeout();
        return;
      }

      this.callbacks.onMessage?.(event);
    };
  }

  private setState(newState: WebSocketState): void {
    if (this.state !== newState) {
      console.debug(`WebSocket state change: ${this.state} -> ${newState}`);
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
    if (this.isDestroyed || this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.setState(WebSocketState.DISCONNECTED);
      return;
    }

    // Calculate backoff delay
    const baseDelay = this.config.reconnectInterval;
    const backoffDelay = baseDelay * Math.pow(this.config.reconnectBackoffMultiplier, this.reconnectAttempts);
    const delay = Math.min(backoffDelay, this.config.maxReconnectInterval);

    console.debug(`Scheduling reconnect attempt ${this.reconnectAttempts + 1} in ${delay}ms`);

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
          console.error('Failed to send ping:', error);
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
      console.warn('Pong timeout - closing connection');
      this.ws?.close();
    }, this.config.pongTimeout);
  }

  private clearPongTimeout(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = undefined;
    }
  }

  private cleanup(): void {
    this.stopHeartbeat();

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

      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }
}