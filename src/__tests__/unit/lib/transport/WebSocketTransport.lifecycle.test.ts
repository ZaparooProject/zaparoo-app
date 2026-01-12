/**
 * WebSocket lifecycle tests using MockWebSocket.
 *
 * These tests verify WebSocket event handling (onopen, onclose, onmessage, onerror),
 * heartbeat behavior, connection timeout, and reconnection logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocketTransport } from "../../../../lib/transport/WebSocketTransport";
import type { TransportState } from "../../../../lib/transport/types";

/**
 * MockWebSocket that allows manual triggering of WebSocket events.
 */
class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  public readyState: number = MockWebSocket.CONNECTING;
  public onopen: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;

  public url: string;
  public sentMessages: string[] = [];
  public closeCode?: number;
  public closeReason?: string;

  // Track all created instances for test assertions
  static instances: MockWebSocket[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closeCode = code;
    this.closeReason = reason;
    this.readyState = MockWebSocket.CLOSED;
    // Simulate async close event
    setTimeout(() => {
      this.onclose?.(new CloseEvent("close", { code, reason }));
    }, 0);
  }

  // Test helpers to simulate events
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  simulateClose(code = 1000, reason = ""): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close", { code, reason }));
  }

  simulateError(message = "Connection failed"): void {
    const errorEvent = new ErrorEvent("error", { message });
    this.onerror?.(errorEvent);
  }

  simulateMessage(data: string): void {
    this.onmessage?.(new MessageEvent("message", { data }));
  }

  static reset(): void {
    MockWebSocket.instances = [];
  }

  static getLatest(): MockWebSocket | undefined {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }
}

describe("WebSocketTransport lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.reset();
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("connection lifecycle", () => {
    it("should transition to connected state when onopen fires", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      const stateChanges: TransportState[] = [];
      transport.setEventHandlers({
        onStateChange: (state) => stateChanges.push(state),
      });

      transport.connect();
      expect(transport.state).toBe("connecting");

      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();

      expect(transport.state).toBe("connected");
      expect(transport.isConnected).toBe(true);
      expect(transport.hasEverConnected).toBe(true);
      expect(stateChanges).toContain("connected");

      transport.destroy();
    });

    it("should call onOpen handler when connection opens", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      const onOpen = vi.fn();
      transport.setEventHandlers({ onOpen });

      transport.connect();
      MockWebSocket.getLatest()!.simulateOpen();

      expect(onOpen).toHaveBeenCalledTimes(1);

      transport.destroy();
    });

    it("should transition to reconnecting state on close after being connected", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      const stateChanges: TransportState[] = [];
      transport.setEventHandlers({
        onStateChange: (state) => stateChanges.push(state),
      });

      transport.connect();
      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();

      expect(transport.hasEverConnected).toBe(true);

      ws.simulateClose();

      expect(transport.state).toBe("reconnecting");
      expect(stateChanges).toContain("reconnecting");

      transport.destroy();
    });

    it("should stay in connecting state on close before ever connecting", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      transport.connect();
      expect(transport.state).toBe("connecting");
      expect(transport.hasEverConnected).toBe(false);

      const ws = MockWebSocket.getLatest()!;
      ws.simulateClose();

      // Should stay in connecting (not change to reconnecting)
      expect(transport.hasEverConnected).toBe(false);

      transport.destroy();
    });

    it("should call onClose handler when connection closes", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      const onClose = vi.fn();
      transport.setEventHandlers({ onClose });

      transport.connect();
      MockWebSocket.getLatest()!.simulateOpen();
      MockWebSocket.getLatest()!.simulateClose();

      expect(onClose).toHaveBeenCalledTimes(1);

      transport.destroy();
    });

    it("should call onError handler when error occurs", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      const onError = vi.fn();
      transport.setEventHandlers({ onError });

      transport.connect();
      MockWebSocket.getLatest()!.simulateError("Test error");

      expect(onError).toHaveBeenCalledWith(expect.any(Error));

      transport.destroy();
    });
  });

  describe("message handling", () => {
    it("should pass regular messages to onMessage handler", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      const onMessage = vi.fn();
      transport.setEventHandlers({ onMessage });

      transport.connect();
      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();

      ws.simulateMessage('{"jsonrpc":"2.0","id":"123","result":{}}');

      expect(onMessage).toHaveBeenCalledTimes(1);
      expect(onMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: '{"jsonrpc":"2.0","id":"123","result":{}}',
        }),
      );

      transport.destroy();
    });

    it("should not pass pong messages to onMessage handler", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      const onMessage = vi.fn();
      transport.setEventHandlers({ onMessage });

      transport.connect();
      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();

      ws.simulateMessage("pong");

      expect(onMessage).not.toHaveBeenCalled();

      transport.destroy();
    });
  });

  describe("heartbeat", () => {
    it("should send ping after pingInterval when connected", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
        pingInterval: 1000,
      });

      transport.connect();
      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();

      expect(ws.sentMessages).not.toContain("ping");

      vi.advanceTimersByTime(1000);

      expect(ws.sentMessages).toContain("ping");

      transport.destroy();
    });

    it("should close connection if pong not received within pongTimeout", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
        pingInterval: 1000,
        pongTimeout: 500,
      });

      transport.connect();
      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();

      // Trigger ping
      vi.advanceTimersByTime(1000);
      expect(ws.sentMessages).toContain("ping");

      // Wait for pong timeout
      vi.advanceTimersByTime(500);

      expect(ws.readyState).toBe(MockWebSocket.CLOSED);

      transport.destroy();
    });

    it("should clear pong timeout when pong received", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
        pingInterval: 1000,
        pongTimeout: 500,
      });

      transport.connect();
      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();

      // Trigger ping
      vi.advanceTimersByTime(1000);

      // Receive pong before timeout
      ws.simulateMessage("pong");

      // Advance past pong timeout - connection should still be open
      vi.advanceTimersByTime(600);

      expect(ws.readyState).toBe(MockWebSocket.OPEN);

      transport.destroy();
    });

    it("should clear pong timeout when any message received", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
        pingInterval: 1000,
        pongTimeout: 500,
      });

      transport.connect();
      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();

      // Trigger ping
      vi.advanceTimersByTime(1000);

      // Receive any message before timeout
      ws.simulateMessage('{"some":"data"}');

      // Advance past pong timeout - connection should still be open
      vi.advanceTimersByTime(600);

      expect(ws.readyState).toBe(MockWebSocket.OPEN);

      transport.destroy();
    });

    it("should pause heartbeat when pauseHeartbeat is called", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
        pingInterval: 1000,
      });

      transport.connect();
      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();

      transport.pauseHeartbeat();

      vi.advanceTimersByTime(2000);

      // No pings should be sent after pause
      expect(ws.sentMessages).not.toContain("ping");

      transport.destroy();
    });

    it("should resume heartbeat when resumeHeartbeat is called", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
        pingInterval: 1000,
      });

      transport.connect();
      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();

      transport.pauseHeartbeat();
      vi.advanceTimersByTime(500);

      transport.resumeHeartbeat();

      vi.advanceTimersByTime(1000);

      expect(ws.sentMessages).toContain("ping");

      transport.destroy();
    });
  });

  describe("connection timeout", () => {
    it("should close connection if not opened within connectionTimeout", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
        connectionTimeout: 1000,
      });

      transport.connect();
      const ws = MockWebSocket.getLatest()!;

      expect(ws.readyState).toBe(MockWebSocket.CONNECTING);

      vi.advanceTimersByTime(1000);

      expect(ws.readyState).toBe(MockWebSocket.CLOSED);

      transport.destroy();
    });

    it("should clear connection timeout when connection opens", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
        connectionTimeout: 1000,
      });

      transport.connect();
      const ws = MockWebSocket.getLatest()!;

      // Open before timeout
      vi.advanceTimersByTime(500);
      ws.simulateOpen();

      // Advance past timeout - connection should still be open
      vi.advanceTimersByTime(1000);

      expect(ws.readyState).toBe(MockWebSocket.OPEN);

      transport.destroy();
    });
  });

  describe("reconnection", () => {
    it("should schedule reconnect with correct delay after disconnect", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
        reconnectInterval: 2000,
      });

      transport.connect();
      const ws1 = MockWebSocket.getLatest()!;
      ws1.simulateOpen();
      ws1.simulateClose();

      expect(MockWebSocket.instances.length).toBe(1);

      // Advance just before reconnect
      vi.advanceTimersByTime(1999);
      expect(MockWebSocket.instances.length).toBe(1);

      // Advance to reconnect time
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances.length).toBe(2);

      transport.destroy();
    });

    it("should not schedule duplicate reconnects", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
        reconnectInterval: 2000,
      });

      transport.connect();
      const ws = MockWebSocket.getLatest()!;

      // Simulate both error and close firing (which can happen)
      ws.simulateError();
      ws.simulateClose();

      vi.advanceTimersByTime(2000);

      // Should only have created one new WebSocket, not two
      expect(MockWebSocket.instances.length).toBe(2);

      transport.destroy();
    });

    it("should reset reconnect attempts on successful connection", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
        reconnectInterval: 100,
      });

      transport.connect();

      // Fail first connection
      MockWebSocket.getLatest()!.simulateError();
      MockWebSocket.getLatest()!.simulateClose();

      // Wait for reconnect
      vi.advanceTimersByTime(100);

      // Succeed second connection
      MockWebSocket.getLatest()!.simulateOpen();

      // Disconnect again
      MockWebSocket.getLatest()!.simulateClose();

      // Should reconnect with base delay (not accumulated)
      vi.advanceTimersByTime(100);

      expect(MockWebSocket.instances.length).toBe(3);

      transport.destroy();
    });

    it("should stop reconnecting when maxReconnectAttempts is reached", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
        reconnectInterval: 100,
        maxReconnectAttempts: 2,
      });

      const stateChanges: TransportState[] = [];
      transport.setEventHandlers({
        onStateChange: (state) => stateChanges.push(state),
      });

      transport.connect();

      // Fail connection attempts
      for (let i = 0; i < 3; i++) {
        MockWebSocket.getLatest()!.simulateError();
        MockWebSocket.getLatest()!.simulateClose();
        vi.advanceTimersByTime(100);
      }

      // Should have stopped after maxReconnectAttempts
      expect(MockWebSocket.instances.length).toBe(3); // initial + 2 retries
      expect(stateChanges).toContain("disconnected");

      transport.destroy();
    });

    it("should not reconnect after destroy", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
        reconnectInterval: 100,
      });

      transport.connect();
      MockWebSocket.getLatest()!.simulateOpen();
      MockWebSocket.getLatest()!.simulateClose();

      transport.destroy();

      vi.advanceTimersByTime(200);

      // Should not have created a new WebSocket
      expect(MockWebSocket.instances.length).toBe(1);
    });
  });

  describe("immediateReconnect", () => {
    it("should reconnect with delay after cleanup when disconnected", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      transport.connect();
      MockWebSocket.getLatest()!.simulateOpen();

      // Simulate disconnection (e.g., device went offline)
      MockWebSocket.getLatest()!.simulateClose();

      // Clear the scheduled reconnect from the close event
      vi.advanceTimersByTime(100);

      const instancesAfterClose = MockWebSocket.instances.length;

      // Now trigger immediate reconnect (e.g., app came to foreground)
      transport.immediateReconnect();

      // Advance past the 500ms delay
      vi.advanceTimersByTime(500);

      // Should have created a new WebSocket
      expect(MockWebSocket.instances.length).toBe(instancesAfterClose + 1);

      transport.destroy();
    });

    it("should resume heartbeat if already connected (stale connection detection)", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
        pingInterval: 1000,
        pongTimeout: 500,
      });

      transport.connect();
      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();

      // Initial heartbeat starts on connection - wait for first ping
      vi.advanceTimersByTime(1000);
      expect(ws.sentMessages.filter((m) => m === "ping")).toHaveLength(1);

      // Respond with pong to prevent timeout
      ws.simulateMessage("pong");

      // Pause heartbeat (simulating app going to background)
      transport.pauseHeartbeat();

      // Advance time - no more pings should be sent because heartbeat is paused
      vi.advanceTimersByTime(2000);
      expect(ws.sentMessages.filter((m) => m === "ping")).toHaveLength(1); // Still just 1

      // Verify transport still thinks it's connected
      expect(transport.state).toBe("connected");
      expect(transport.isConnected).toBe(true);

      // Now trigger immediateReconnect (simulating app coming to foreground)
      // This should resume heartbeat even though we're still "connected"
      transport.immediateReconnect();

      // Advance time - pings should now be sent again
      vi.advanceTimersByTime(1000);
      expect(ws.sentMessages.filter((m) => m === "ping")).toHaveLength(2);
      ws.simulateMessage("pong"); // Respond to prevent timeout

      // Advance more - another ping should be sent
      vi.advanceTimersByTime(1000);
      expect(ws.sentMessages.filter((m) => m === "ping")).toHaveLength(3);

      // Should not have created new WebSocket
      expect(MockWebSocket.instances.length).toBe(1);

      transport.destroy();
    });

    it("should skip reconnect logic if already connected but still resume heartbeat", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      transport.connect();
      MockWebSocket.getLatest()!.simulateOpen();

      const initialCount = MockWebSocket.instances.length;

      transport.immediateReconnect();
      vi.advanceTimersByTime(1000);

      // Should not have created new WebSocket
      expect(MockWebSocket.instances.length).toBe(initialCount);

      transport.destroy();
    });

    it("should cancel pending reconnect timer", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
        reconnectInterval: 5000,
      });

      transport.connect();
      MockWebSocket.getLatest()!.simulateOpen();
      MockWebSocket.getLatest()!.simulateClose();

      // A reconnect is now scheduled for 5 seconds

      // Immediate reconnect should cancel it and reconnect sooner
      transport.immediateReconnect();
      vi.advanceTimersByTime(500);

      expect(MockWebSocket.instances.length).toBe(2);

      // Advance past original reconnect time - should not create another
      vi.advanceTimersByTime(5000);
      expect(MockWebSocket.instances.length).toBe(2);

      transport.destroy();
    });
  });

  describe("send", () => {
    it("should send message when connected", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      transport.connect();
      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();

      transport.send('{"test":"data"}');

      expect(ws.sentMessages).toContain('{"test":"data"}');

      transport.destroy();
    });

    it("should throw when not connected", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      transport.connect();
      // Don't open the connection

      expect(() => transport.send('{"test":"data"}')).toThrow(
        "Cannot send message: WebSocket not open",
      );

      transport.destroy();
    });
  });
});
