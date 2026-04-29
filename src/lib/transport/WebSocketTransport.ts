/**
 * WebSocket transport implementation.
 *
 * Handles WebSocket connection with automatic reconnection and heartbeat.
 * Message queuing is handled at the CoreAPI level, not here.
 */

import { logger } from "../logger";
import { EncryptedSession } from "../crypto/session";
import type {
  Transport,
  TransportEncryptionConfig,
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
  /** Optional encryption config */
  encryption?: TransportEncryptionConfig;
}

// JSON-RPC error codes from the Zaparoo Core encryption spec.
const ENCRYPTION_REQUIRED_CODE = -32002;
const UNSUPPORTED_VERSION_CODE = -32001;

type EncMode = "idle" | "trying-encrypted" | "encrypted-verified" | "plaintext";

const DEFAULT_CONFIG: Omit<
  Required<WebSocketTransportConfig>,
  "deviceId" | "url" | "encryption"
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
  private config: Required<Omit<WebSocketTransportConfig, "encryption">> & {
    encryption?: TransportEncryptionConfig;
  };
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

  // Encryption state for the current connect cycle.
  private encMode: EncMode = "idle";
  private session: EncryptedSession | null = null;
  private outboundQueue: string[] = [];
  private drainInFlight = false;
  // True once the server has answered a plaintext request without a -32002/-32001
  // error. Until then we keep the consumer's encryption-state UI in "unknown" so
  // it can avoid the green-flash before -32002 arrives on encryption-required cores.
  private plaintextVerified = false;
  // Set to true when an encryption-related signal (revoked creds, -32002, -32001)
  // closes the connection. Suppresses the auto-reconnect loop until the consumer
  // resolves the issue (e.g. pairs) and triggers an explicit immediateReconnect().
  private encryptionBlocked = false;

  readonly deviceId: string;

  constructor(config: WebSocketTransportConfig) {
    const { encryption, ...rest } = config;
    this.config = {
      ...DEFAULT_CONFIG,
      ...rest,
      encryption,
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

    // Don't reconnect while encryption-blocked. Lifecycle callers (app resume,
    // visibilitychange, network change) must respect the block — only the
    // consumer can clear it via clearEncryptionBlock() after pairing.
    if (this.encryptionBlocked) {
      logger.debug(
        `[Transport:${this.deviceId}] connect() ignored: encryption-blocked`,
      );
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
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error(
        `Cannot send message: WebSocket not open (state: ${this.ws?.readyState})`,
      );
    }
    if (
      this.encMode === "trying-encrypted" ||
      this.encMode === "encrypted-verified"
    ) {
      this.outboundQueue.push(data);
      this.kickDrain();
    } else {
      this.ws.send(data);
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

    // Don't reconnect while encryption-blocked. The pairing flow clears the
    // block explicitly via clearEncryptionBlock(); lifecycle-driven calls
    // (resumeAll, network change) must not re-trigger the same -32002 loop.
    if (this.encryptionBlocked) {
      logger.debug(
        `[Transport:${this.deviceId}] immediateReconnect() ignored: encryption-blocked`,
      );
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

    // Cancel any pending reconnect timers to prevent connections opening in background
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

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

  clearEncryptionBlock(): void {
    if (this.encryptionBlocked) {
      logger.debug(
        `[Transport:${this.deviceId}] Encryption block cleared by consumer`,
      );
    }
    this.encryptionBlocked = false;
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

  private closeWebSocket(): void {
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

  private createWebSocket(): void {
    // Close any existing WebSocket to prevent stale handlers from corrupting state
    this.closeWebSocket();

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
      // setState and startHeartbeat are deferred to initEncryption() so that
      // encMode is set before any consumer can call send().
      void this.initEncryption();
    };

    this.ws.onclose = () => {
      logger.debug(`[Transport:${this.deviceId}] WebSocket closed`);
      this.clearConnectionTimeout();
      this.heartReset();
      // Silent close while attempting encrypted handshake — server likely
      // doesn't speak our encryption protocol. Surface as an error and stop.
      if (this.encMode === "trying-encrypted") {
        this.handlers.onError?.(new Error("Encrypted handshake failed"));
        this.failConnectionForEncryption(
          "silent close during encrypted handshake",
        );
        return;
      }
      // Silent close in plaintext mode before the server confirmed it accepts
      // plaintext. Most likely the server requires encryption but the -32002
      // frame was lost (server-side marshal failure, native WS plugin
      // dispatching close before message, or a Core build that just hangs up).
      // Surface as an encryption-required signal so the user gets a Pair
      // button instead of an infinite reconnect loop. Only do this when the
      // consumer wired up encryption credentials — otherwise this is a vanilla
      // disconnect (e.g. server crashed) and the existing reconnect path is
      // right.
      if (
        this.encMode === "plaintext" &&
        !this.plaintextVerified &&
        this.config.encryption !== undefined
      ) {
        logger.warn(
          `[Transport:${this.deviceId}] Silent close in plaintext mode without a verified reply — assuming encryption required`,
          {
            category: "websocket",
            action: "silent-close-plaintext",
            severity: "warning",
          },
        );
        this.handlers.onEncryptionRequired?.();
        this.failConnectionForEncryption(
          "silent close before plaintext verified",
        );
        return;
      }
      this.handlers.onClose?.();
      this.handleDisconnection();
    };

    this.ws.onerror = (event: Event) => {
      logger.error(`[Transport:${this.deviceId}] WebSocket error:`, event);
      this.clearConnectionTimeout();
      const errorEvent = event as ErrorEvent;
      const message =
        errorEvent.message || `Failed to connect to ${this.config.url}`;
      this.handlers.onError?.(new Error(message));
      this.handleConnectionError();
    };

    this.ws.onmessage = (event) => {
      // Any frame proves the connection is alive.
      this.heartCheck();

      if (
        this.encMode === "trying-encrypted" ||
        this.encMode === "encrypted-verified"
      ) {
        void this.handleEncryptedMessage(event);
      } else {
        this.handlePlaintextMessage(event);
      }
    };
  }

  // ── Encryption helpers ──────────────────────────────────────────────────

  private async initEncryption(): Promise<void> {
    const enc = this.config.encryption;

    // Each new WebSocket session starts unverified. Routine onclose/reconnect
    // cycles do not run cleanup(), so reset here to ensure the consumer
    // re-verifies the encryption mode after a reconnect.
    this.plaintextVerified = false;

    // Set encMode synchronously so an immediate close (server hangs up before
    // creds finish loading) is correctly attributed to the silent-close-
    // plaintext branch in ws.onclose, instead of falling through to
    // handleDisconnection's reconnect loop with no pairing UI ever surfacing.
    // Upgraded to "trying-encrypted" below if creds load successfully.
    this.encMode = "plaintext";

    if (!enc) {
      this.setState("connected");
      this.startHeartbeat();
      this.handlers.onOpen?.();
      // onPlaintextMode deferred — fires from handlePlaintextMessage after the
      // first non-error reply confirms the server speaks plaintext.
      return;
    }

    // Capture the WS at the start so we can detect a close-during-await: the
    // consumer's getCredentials() hits the Capacitor Preferences bridge, which
    // can take real ms on Android. If the server closes during that window,
    // ws.onclose runs and drives recovery; this stale init must NOT clobber
    // that with a setState("connected") on a dead socket.
    const wsAtStart = this.ws;

    try {
      const creds = await enc.getCredentials();

      if (
        this.isDestroyed ||
        this.ws !== wsAtStart ||
        this.ws?.readyState !== WebSocket.OPEN ||
        this.encryptionBlocked
      ) {
        return;
      }

      if (!creds) {
        // No stored credentials — try plaintext. Server may reject with -32002
        // (encryption required), in which case we fail and prompt for pairing.
        // encMode already "plaintext" from above.
        this.setState("connected");
        this.startHeartbeat();
        this.handlers.onOpen?.();
        // onPlaintextMode deferred — fires from handlePlaintextMessage after
        // the first non-error reply confirms plaintext is accepted.
        return;
      }

      // Defensive: persisted creds could be corrupted on disk. Treat malformed
      // hex as revoked so the consumer wipes them and prompts for re-pairing
      // instead of looping on the same broken value.
      if (
        creds.pairingKey.length === 0 ||
        creds.pairingKey.length % 2 !== 0 ||
        !/^[0-9a-fA-F]+$/.test(creds.pairingKey)
      ) {
        logger.error(
          `[Transport:${this.deviceId}] Stored pairingKey is malformed`,
          undefined,
          { category: "crypto", action: "init-failed" },
        );
        this.handlers.onCredentialsRevoked?.();
        this.failConnectionForEncryption("malformed pairing key");
        return;
      }
      const pairingKeyHex = creds.pairingKey.match(/.{2}/g) ?? [];
      const pairingKeyBytes = new Uint8Array(
        pairingKeyHex.map((h) => Number.parseInt(h, 16)),
      );
      this.session = await EncryptedSession.create(
        creds.authToken,
        pairingKeyBytes,
      );

      // Same close-during-await guard for the second await.
      if (
        this.isDestroyed ||
        this.ws !== wsAtStart ||
        this.ws?.readyState !== WebSocket.OPEN ||
        this.encryptionBlocked
      ) {
        return;
      }

      this.encMode = "trying-encrypted";
      logger.debug(
        `[Transport:${this.deviceId}] Encrypted session created (authToken: ${creds.authToken.slice(0, 8)}…)`,
        { category: "crypto", action: "session-created" },
      );
    } catch (err) {
      logger.error(
        `[Transport:${this.deviceId}] Failed to init encryption:`,
        err,
        {
          category: "crypto",
          action: "init-failed",
        },
      );
      if (this.isDestroyed || this.ws !== wsAtStart || this.encryptionBlocked) {
        return;
      }
      // Local crypto setup failed — surface as a connection error.
      this.handlers.onError?.(new Error("Failed to initialise encryption"));
      this.handleConnectionError();
      return;
    }

    this.setState("connected");
    this.startHeartbeat();
    this.handlers.onOpen?.();
  }

  private async handleEncryptedMessage(event: MessageEvent): Promise<void> {
    const raw = event.data as string;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      logger.warn(
        `[Transport:${this.deviceId}] Non-JSON frame in encrypted mode`,
        {
          category: "crypto",
          action: "parse-error",
        },
      );
      return;
    }

    // Plaintext protocol errors can arrive even on an encrypted connection.
    const code = (parsed as { error?: { code?: number } }).error?.code;
    if (code === UNSUPPORTED_VERSION_CODE) {
      logger.warn(
        `[Transport:${this.deviceId}] Unsupported encryption version (-32001)`,
        {
          category: "crypto",
          action: "unsupported-version",
        },
      );
      this.handlers.onUnsupportedVersion?.();
      this.failConnectionForEncryption("unsupported encryption version");
      return;
    }
    if (code === ENCRYPTION_REQUIRED_CODE) {
      // Server doesn't recognise our auth token — credentials are revoked.
      logger.warn(
        `[Transport:${this.deviceId}] Credentials rejected in encrypted mode (-32002)`,
        { category: "crypto", action: "credentials-revoked" },
      );
      this.handlers.onCredentialsRevoked?.();
      this.failConnectionForEncryption("credentials revoked");
      return;
    }

    // Decrypt the frame.
    if (typeof parsed.e === "string" && this.session) {
      let plaintext: string;
      try {
        plaintext = await this.session.decrypt(parsed.e);
      } catch (err) {
        logger.warn(`[Transport:${this.deviceId}] Decryption failed:`, err, {
          category: "crypto",
          action: "decrypt-failed",
        });
        // Either the handshake never verified or an established session
        // produced a bad frame — both are fatal in the binary model.
        this.handlers.onError?.(new Error("Encrypted handshake failed"));
        this.failConnectionForEncryption("decrypt failure");
        return;
      }

      // Success.
      if (this.encMode === "trying-encrypted") {
        this.encMode = "encrypted-verified";
        logger.debug(`[Transport:${this.deviceId}] Encrypted handshake OK`, {
          category: "crypto",
          action: "handshake-ok",
        });
        this.handlers.onEncryptedHandshakeOk?.();
      }

      // Intercept heartbeat pong in decrypted payload.
      if (plaintext === "pong") return;

      this.handlers.onMessage?.(
        new MessageEvent("message", { data: plaintext }),
      );
    }
  }

  private handlePlaintextMessage(event: MessageEvent): void {
    const raw = event.data as string;

    // Intercept heartbeat pong.
    if (raw === "pong") return;

    // Detect encryption-required or unsupported-version signals.
    try {
      const parsed = JSON.parse(raw) as { error?: { code?: number } };
      const code = parsed.error?.code;
      if (code === ENCRYPTION_REQUIRED_CODE) {
        logger.warn(
          `[Transport:${this.deviceId}] Encryption required (-32002)`,
          { category: "crypto", action: "encryption-required" },
        );
        this.handlers.onEncryptionRequired?.();
        this.failConnectionForEncryption("encryption required");
        return;
      }
      if (code === UNSUPPORTED_VERSION_CODE) {
        this.handlers.onUnsupportedVersion?.();
        this.failConnectionForEncryption("unsupported encryption version");
        return;
      }
    } catch {
      // Non-JSON (e.g. raw "pong" already handled above) — fall through.
    }

    // First non-error plaintext reply confirms the server accepts plaintext.
    // Until this point, the consumer keeps encryption-state UI in "unknown"
    // so the green Connected indicator does not flash before a possible -32002.
    if (!this.plaintextVerified && this.encMode === "plaintext") {
      this.plaintextVerified = true;
      this.handlers.onPlaintextMode?.();
    }

    this.handlers.onMessage?.(event);
  }

  // Encryption-related failure: stop the connection and suppress the
  // auto-reconnect loop. The consumer (ConnectionProvider) drives recovery
  // via PairingModal + immediateReconnect once the user pairs.
  private failConnectionForEncryption(reason: string): void {
    logger.warn(
      `[Transport:${this.deviceId}] Encryption-blocked disconnect: ${reason}`,
      { category: "crypto", action: "encryption-blocked" },
    );
    this.encryptionBlocked = true;
    this.cleanup();
    this.setState("disconnected");
    this.handlers.onClose?.();
  }

  private kickDrain(): void {
    if (this.drainInFlight || !this.session) return;
    this.drainInFlight = true;
    void this.drain();
  }

  private async drain(): Promise<void> {
    while (this.outboundQueue.length > 0) {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        this.drainInFlight = false;
        return;
      }
      const item = this.outboundQueue.shift()!;
      try {
        const frame = await this.session!.encryptAndFrame(item);
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(frame);
        }
      } catch (err) {
        logger.error(`[Transport:${this.deviceId}] Encrypt failed:`, err, {
          category: "crypto",
          action: "encrypt-failed",
        });
        this.handleConnectionError();
        break;
      }
    }
    this.drainInFlight = false;
  }

  // ── End encryption helpers ───────────────────────────────────────────────

  private handleDisconnection(): void {
    if (this.isDestroyed) return;
    // If we've already given up due to an encryption block, stay disconnected.
    // Emitting "reconnecting" here would mislead consumers — recovery requires
    // the user to pair, not an internal retry, and a transient "reconnecting"
    // event clobbers any pairingRequired UI state the consumer just set.
    if (this.encryptionBlocked) {
      this.setState("disconnected");
      return;
    }
    // Only use "reconnecting" state if we've successfully connected before
    // Otherwise stay in "connecting" state for initial connection attempts
    if (this._hasConnectedBefore) {
      this.setState("reconnecting");
    }
    this.scheduleReconnect();
  }

  private handleConnectionError(): void {
    if (this.isDestroyed) return;
    if (this.encryptionBlocked) {
      this.setState("disconnected");
      return;
    }
    // Only use "reconnecting" state if we've successfully connected before
    // Otherwise stay in "connecting" state for initial connection attempts
    if (this._hasConnectedBefore) {
      this.setState("reconnecting");
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    // Don't schedule reconnects while heartbeat is paused (app backgrounded)
    if (this.heartbeatPaused) {
      return;
    }

    // Don't loop on encryption-blocked failures — wait for the consumer
    // to drive recovery (e.g. via PairingModal + immediateReconnect).
    if (this.encryptionBlocked) {
      this.setState("disconnected");
      return;
    }

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
          this.send(this.config.pingMessage);

          // Start pong timeout - if no response, force disconnect
          this.pongTimeoutId = setTimeout(() => {
            logger.warn(
              `[Transport:${this.deviceId}] Pong timeout - forcing disconnect`,
            );
            // Close and null handlers before triggering disconnect to prevent
            // onclose from firing a duplicate handleDisconnection()
            this.closeWebSocket();
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

    this.closeWebSocket();

    // Reset encryption state for next connect cycle.
    this.session = null;
    this.outboundQueue = [];
    this.drainInFlight = false;
    this.encMode = "idle";
    this.plaintextVerified = false;
  }
}
