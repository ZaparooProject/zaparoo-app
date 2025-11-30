import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocketManager, WebSocketState } from "@/lib/websocketManager";

// Mock console methods to prevent stderr output
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
const originalConsoleDebug = console.debug;

// Mock the global WebSocket constructor
const mockWebSocketConstructor = vi.fn();

// Create a proper WebSocket mock class that we'll use as the implementation
class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    // Don't auto-connect, let tests control the connection state
  }

  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent("close"));
    }
  });

  // Test helper methods
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event("open"));
    }
  }

  simulateError() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onerror) {
      this.onerror(new Event("error"));
    }
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent("close"));
    }
  }

  simulateMessage(data: string) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent("message", { data }));
    }
  }
}

// Set up the mock implementation - must use regular function (not arrow) for Vitest 4 constructor mocks
mockWebSocketConstructor.mockImplementation(function (url: string) {
  const ws = new MockWebSocket(url);
  // Add WebSocket constants to the constructor for compatibility
  (mockWebSocketConstructor as any).CONNECTING = MockWebSocket.CONNECTING;
  (mockWebSocketConstructor as any).OPEN = MockWebSocket.OPEN;
  (mockWebSocketConstructor as any).CLOSING = MockWebSocket.CLOSING;
  (mockWebSocketConstructor as any).CLOSED = MockWebSocket.CLOSED;
  return ws;
});

describe("WebSocketManager", () => {
  let manager: WebSocketManager;
  // Use 'any' for mock types to work with Vitest 4's stricter Mock type

  let onStateChange: any;

  let onOpen: any;

  let onClose: any;

  let onError: any;

  let onMessage: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockWebSocketConstructor.mockClear();

    // Mock console methods to suppress output during tests
    console.warn = vi.fn();
    console.error = vi.fn();
    console.debug = vi.fn();

    // Properly mock WebSocket in the global scope using vi.stubGlobal
    vi.stubGlobal("WebSocket", mockWebSocketConstructor);

    // Set WebSocket constants on the global mock
    (global.WebSocket as any).CONNECTING = MockWebSocket.CONNECTING;
    (global.WebSocket as any).OPEN = MockWebSocket.OPEN;
    (global.WebSocket as any).CLOSING = MockWebSocket.CLOSING;
    (global.WebSocket as any).CLOSED = MockWebSocket.CLOSED;

    onStateChange = vi.fn();
    onOpen = vi.fn();
    onClose = vi.fn();
    onError = vi.fn();
    onMessage = vi.fn();
  });

  afterEach(() => {
    if (manager) {
      manager.destroy();
    }
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();

    // Restore console methods
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    console.debug = originalConsoleDebug;
  });

  describe("constructor", () => {
    it("should initialize with default config values", () => {
      manager = new WebSocketManager({ url: "ws://localhost:7497" });
      expect(manager.currentState).toBe(WebSocketState.IDLE);
      expect(manager.isConnected).toBe(false);
    });

    it("should initialize with custom config values", () => {
      manager = new WebSocketManager(
        {
          url: "ws://localhost:7497",
          pingInterval: 1000,
          pongTimeout: 500,
          reconnectInterval: 100,
          maxReconnectAttempts: 3,
        },
        {
          onStateChange,
          onOpen,
          onClose,
          onError,
          onMessage,
        },
      );

      expect(manager.currentState).toBe(WebSocketState.IDLE);
      expect(manager.isConnected).toBe(false);
    });
  });

  describe("state management", () => {
    beforeEach(() => {
      manager = new WebSocketManager(
        { url: "ws://localhost:7497" },
        { onStateChange },
      );
    });

    it("should return current state", () => {
      expect(manager.currentState).toBe(WebSocketState.IDLE);
    });

    it("should call onStateChange when state changes", () => {
      manager.connect();
      expect(onStateChange).toHaveBeenCalledWith(WebSocketState.CONNECTING);
    });
  });

  describe("connect", () => {
    beforeEach(() => {
      manager = new WebSocketManager(
        { url: "ws://localhost:7497" },
        { onStateChange, onOpen },
      );
    });

    it("should create WebSocket connection", () => {
      manager.connect();
      expect(mockWebSocketConstructor).toHaveBeenCalledWith(
        "ws://localhost:7497",
      );
      expect(manager.currentState).toBe(WebSocketState.CONNECTING);
    });

    it("should not connect if already connecting", () => {
      manager.connect();
      expect(mockWebSocketConstructor).toHaveBeenCalledTimes(1);

      manager.connect(); // Second call should be ignored
      expect(mockWebSocketConstructor).toHaveBeenCalledTimes(1); // Still just 1 call
    });

    it("should not connect if destroyed", () => {
      manager.destroy();
      manager.connect();
      expect(mockWebSocketConstructor).not.toHaveBeenCalled();
    });

    it("should transition to connected state when WebSocket opens", () => {
      manager.connect();

      // Ensure WebSocket was created
      expect(mockWebSocketConstructor).toHaveBeenCalledTimes(1);

      const mockWs = mockWebSocketConstructor.mock.results[0]!
        .value as MockWebSocket;
      mockWs.simulateOpen();
      expect(manager.currentState).toBe(WebSocketState.CONNECTED);
      expect(onStateChange).toHaveBeenCalledWith(WebSocketState.CONNECTED);
      expect(onOpen).toHaveBeenCalled();
    });

    it("should handle connection errors", () => {
      manager = new WebSocketManager(
        { url: "ws://localhost:7497", maxReconnectAttempts: 1 },
        { onStateChange, onError },
      );

      manager.connect();

      // Ensure WebSocket was created
      expect(mockWebSocketConstructor).toHaveBeenCalledTimes(1);

      const mockWs = mockWebSocketConstructor.mock.results[0]!
        .value as MockWebSocket;
      mockWs.simulateError();
      expect(onError).toHaveBeenCalled();
    });
  });

  describe("disconnect", () => {
    beforeEach(() => {
      manager = new WebSocketManager({ url: "ws://localhost:7497" });
    });

    it("should disconnect and set state to disconnected", () => {
      manager.disconnect();
      expect(manager.currentState).toBe(WebSocketState.DISCONNECTED);
    });
  });

  describe("destroy", () => {
    beforeEach(() => {
      manager = new WebSocketManager({ url: "ws://localhost:7497" });
    });

    it("should destroy manager and set state to idle", () => {
      manager.destroy();
      expect(manager.currentState).toBe(WebSocketState.IDLE);
    });

    it("should close WebSocket connection on destroy", () => {
      manager.connect();

      // Verify WebSocket was created
      expect(mockWebSocketConstructor).toHaveBeenCalledTimes(1);
      const mockWs = mockWebSocketConstructor.mock.results[0]!
        .value as MockWebSocket;
      manager.destroy();
      expect(mockWs.close).toHaveBeenCalled();
    });

    it("should prevent operations after destroy", () => {
      manager.destroy();
      manager.connect();
      expect(mockWebSocketConstructor).not.toHaveBeenCalled();
    });
  });

  describe("send", () => {
    beforeEach(() => {
      manager = new WebSocketManager({ url: "ws://localhost:7497" });
    });

    it("should send message when connected", () => {
      manager.connect();

      // Verify WebSocket was created
      expect(mockWebSocketConstructor).toHaveBeenCalledTimes(1);
      const mockWs = mockWebSocketConstructor.mock.results[0]!
        .value as MockWebSocket;
      mockWs.simulateOpen();

      manager.send("test message");
      expect(mockWs.send).toHaveBeenCalledWith("test message");
    });

    it("should queue message when not connected (default behavior)", () => {
      // Should not throw when queuing is enabled (default)
      expect(() => manager.send("test message")).not.toThrow();
    });

    it("should throw error when not connected and queuing disabled", () => {
      expect(() => manager.send("test message", { queue: false })).toThrow(
        /Cannot send message: WebSocket is not open/,
      );
    });
  });

  describe("properties", () => {
    beforeEach(() => {
      manager = new WebSocketManager({ url: "ws://localhost:7497" });
    });

    it("should return readyState", () => {
      expect(manager.readyState).toBeUndefined(); // No WebSocket created yet

      manager.connect();
      expect(manager.readyState).toBe(MockWebSocket.CONNECTING);
    });

    it("should return isConnected false when not connected", () => {
      expect(manager.isConnected).toBe(false);
    });

    it("should return isConnected true when connected", () => {
      manager.connect();

      // Verify WebSocket was created
      expect(mockWebSocketConstructor).toHaveBeenCalledTimes(1);
      const mockWs = mockWebSocketConstructor.mock.results[0]!
        .value as MockWebSocket;
      mockWs.simulateOpen();
      expect(manager.isConnected).toBe(true);
    });
  });

  describe("message handling", () => {
    beforeEach(() => {
      manager = new WebSocketManager(
        { url: "ws://localhost:7497" },
        { onMessage },
      );
    });

    it("should handle message events", () => {
      manager.connect();

      // Verify WebSocket was created
      expect(mockWebSocketConstructor).toHaveBeenCalledTimes(1);
      const mockWs = mockWebSocketConstructor.mock.results[0]!
        .value as MockWebSocket;
      mockWs.simulateOpen();
      mockWs.simulateMessage("test message");
      expect(onMessage).toHaveBeenCalled();
    });
  });

  describe("close handling", () => {
    beforeEach(() => {
      manager = new WebSocketManager(
        { url: "ws://localhost:7497", maxReconnectAttempts: 0 },
        { onClose, onStateChange },
      );
    });

    it("should handle close events", () => {
      manager.connect();

      // Verify WebSocket was created
      expect(mockWebSocketConstructor).toHaveBeenCalledTimes(1);
      const mockWs = mockWebSocketConstructor.mock.results[0]!
        .value as MockWebSocket;
      mockWs.simulateOpen();
      mockWs.simulateClose();
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("ping mechanism", () => {
    beforeEach(() => {
      manager = new WebSocketManager({
        url: "ws://localhost:7497",
        pingInterval: 1000,
        pongTimeout: 500,
      });
    });

    it("should send ping messages at configured intervals", () => {
      manager.connect();

      // Verify WebSocket was created
      expect(mockWebSocketConstructor).toHaveBeenCalledTimes(1);
      const mockWs = mockWebSocketConstructor.mock.results[0]!
        .value as MockWebSocket;
      mockWs.simulateOpen();

      // Advance time to trigger ping
      vi.advanceTimersByTime(1000);
      expect(mockWs.send).toHaveBeenCalledWith("ping");
    });
  });

  describe("configuration", () => {
    it("should use default configuration values", () => {
      const defaultManager = new WebSocketManager({ url: "ws://test:7497" });
      expect(defaultManager.currentState).toBe(WebSocketState.IDLE);
      defaultManager.destroy();
    });

    it("should apply custom configuration", () => {
      const customManager = new WebSocketManager({
        url: "ws://custom:8080",
        pingInterval: 5000,
        pongTimeout: 2000,
        maxReconnectAttempts: 5,
      });

      expect(customManager.currentState).toBe(WebSocketState.IDLE);
      customManager.destroy();
    });

    it("should handle all callback configurations", () => {
      const callbacks = {
        onOpen: vi.fn(),
        onClose: vi.fn(),
        onError: vi.fn(),
        onMessage: vi.fn(),
        onStateChange: vi.fn(),
      };

      const callbackManager = new WebSocketManager(
        { url: "ws://test:7497" },
        callbacks,
      );
      expect(callbackManager.currentState).toBe(WebSocketState.IDLE);
      callbackManager.destroy();
    });
  });

  describe("WebSocketState enum", () => {
    it("should have correct enum values", () => {
      expect(WebSocketState.IDLE).toBe("idle");
      expect(WebSocketState.CONNECTING).toBe("connecting");
      expect(WebSocketState.CONNECTED).toBe("connected");
      expect(WebSocketState.RECONNECTING).toBe("reconnecting");
      expect(WebSocketState.DISCONNECTED).toBe("disconnected");
      expect(WebSocketState.ERROR).toBe("error");
    });
  });

  describe("edge cases", () => {
    it("should handle missing callbacks gracefully", () => {
      manager = new WebSocketManager({ url: "ws://localhost:7497" });

      manager.connect();

      // Verify WebSocket was created
      expect(mockWebSocketConstructor).toHaveBeenCalledTimes(1);
      const mockWs = mockWebSocketConstructor.mock.results[0]!
        .value as MockWebSocket;

      // These should not throw errors even without callbacks
      expect(() => mockWs.simulateOpen()).not.toThrow();
      expect(() => mockWs.simulateError()).not.toThrow();
      expect(() => mockWs.simulateClose()).not.toThrow();
      expect(() => mockWs.simulateMessage("test")).not.toThrow();
    });

    it("should handle rapid connect/disconnect cycles", () => {
      manager = new WebSocketManager({ url: "ws://localhost:7497" });

      manager.connect();
      manager.disconnect();
      manager.connect();
      manager.destroy();

      expect(manager.currentState).toBe(WebSocketState.IDLE);
    });
  });
});
