/**
 * Unit tests for ConnectionManager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TransportState } from "../../../../lib/transport/types";

// Mock must be declared before any imports that use it
vi.mock("../../../../lib/transport/WebSocketTransport", () => {
  // Define mock class inside factory to avoid hoisting issues
  class MockWebSocketTransport {
    deviceId: string;
    _state: TransportState = "disconnected";
    _hasConnected = false;
    handlers: Record<string, (...args: unknown[]) => void> = {};

    send = vi.fn();
    immediateReconnect = vi.fn();
    pauseHeartbeat = vi.fn();
    resumeHeartbeat = vi.fn();
    destroy = vi.fn(() => {
      this._state = "disconnected";
    });

    constructor(config: { deviceId: string; url: string }) {
      this.deviceId = config.deviceId;
    }

    get state(): TransportState {
      return this._state;
    }

    get isConnected(): boolean {
      return this._state === "connected";
    }

    get hasEverConnected(): boolean {
      return this._hasConnected;
    }

    setEventHandlers(h: Record<string, (...args: unknown[]) => void>): void {
      this.handlers = h;
    }

    connect(): void {
      this._state = "connecting";
      this.handlers.onStateChange?.("connecting");
      // Simulate immediate connection
      setTimeout(() => {
        this._state = "connected";
        this._hasConnected = true;
        this.handlers.onStateChange?.("connected");
        this.handlers.onOpen?.();
      }, 0);
    }

    disconnect(): void {
      this._state = "disconnected";
      this.handlers.onStateChange?.("disconnected");
    }

    // Test helpers
    simulateMessage(data: string): void {
      this.handlers.onMessage?.({ data });
    }

    simulateStateChange(newState: TransportState): void {
      this._state = newState;
      if (newState === "connected") {
        this._hasConnected = true;
      }
      this.handlers.onStateChange?.(newState);
    }
  }

  return { WebSocketTransport: MockWebSocketTransport };
});

// Import after mock is set up
import { ConnectionManager } from "../../../../lib/transport/ConnectionManager";

// Helper type for mock transport
interface MockTransport {
  deviceId: string;
  state: TransportState;
  isConnected: boolean;
  hasEverConnected: boolean;
  send: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  immediateReconnect: ReturnType<typeof vi.fn>;
  pauseHeartbeat: ReturnType<typeof vi.fn>;
  simulateMessage: (data: string) => void;
  simulateStateChange: (state: TransportState) => void;
}

describe("ConnectionManager", () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new ConnectionManager();
  });

  afterEach(() => {
    vi.useRealTimers();
    manager.destroy();
  });

  describe("addDevice", () => {
    it("should create a transport for the device", () => {
      const transport = manager.addDevice({
        deviceId: "device-1",
        type: "websocket",
        address: "ws://localhost:7497",
      });

      expect(transport).toBeDefined();
      expect(transport.deviceId).toBe("device-1");
    });

    it("should initialize connection record with hasConnectedBefore false", () => {
      manager.addDevice({
        deviceId: "device-1",
        type: "websocket",
        address: "ws://localhost:7497",
      });

      const connection = manager.getConnection("device-1");
      expect(connection).toBeDefined();
      expect(connection?.hasConnectedBefore).toBe(false);
      expect(connection?.hasData).toBe(false);
    });

    it("should remove existing device with same ID before adding", () => {
      const transport1 = manager.addDevice({
        deviceId: "device-1",
        type: "websocket",
        address: "ws://localhost:7497/v1",
      });

      const transport2 = manager.addDevice({
        deviceId: "device-1",
        type: "websocket",
        address: "ws://localhost:7497/v2",
      });

      expect(transport1.destroy).toHaveBeenCalled();
      expect(manager.getTransport("device-1")).toBe(transport2);
    });
  });

  describe("removeDevice", () => {
    it("should destroy transport and remove connection", () => {
      const transport = manager.addDevice({
        deviceId: "device-1",
        type: "websocket",
        address: "ws://localhost:7497",
      });

      manager.removeDevice("device-1");

      expect(transport.destroy).toHaveBeenCalled();
      expect(manager.getTransport("device-1")).toBeUndefined();
      expect(manager.getConnection("device-1")).toBeUndefined();
    });

    it("should clear active device if removed device was active", () => {
      manager.addDevice({
        deviceId: "device-1",
        type: "websocket",
        address: "ws://localhost:7497",
      });
      manager.setActiveDevice("device-1");

      expect(manager.getActiveDeviceId()).toBe("device-1");

      manager.removeDevice("device-1");

      expect(manager.getActiveDeviceId()).toBeNull();
    });
  });

  describe("setActiveDevice", () => {
    it("should set active device", () => {
      manager.addDevice({
        deviceId: "device-1",
        type: "websocket",
        address: "ws://localhost:7497",
      });

      manager.setActiveDevice("device-1");

      expect(manager.getActiveDeviceId()).toBe("device-1");
    });

    it("should not set non-existent device as active", () => {
      manager.setActiveDevice("non-existent");

      expect(manager.getActiveDeviceId()).toBeNull();
    });

    it("should allow setting null as active device", () => {
      manager.addDevice({
        deviceId: "device-1",
        type: "websocket",
        address: "ws://localhost:7497",
      });
      manager.setActiveDevice("device-1");
      manager.setActiveDevice(null);

      expect(manager.getActiveDeviceId()).toBeNull();
    });
  });

  describe("getActiveConnection", () => {
    it("should return null when no active device", () => {
      expect(manager.getActiveConnection()).toBeNull();
    });

    it("should return connection for active device", async () => {
      manager.addDevice({
        deviceId: "device-1",
        type: "websocket",
        address: "ws://localhost:7497",
      });
      manager.setActiveDevice("device-1");

      const connection = manager.getActiveConnection();
      expect(connection).toBeDefined();
      expect(connection?.deviceId).toBe("device-1");
    });
  });

  describe("event handlers", () => {
    it("should call onConnectionChange when connection state changes", async () => {
      const onConnectionChange = vi.fn();
      manager.setEventHandlers({ onConnectionChange });

      const transport = manager.addDevice({
        deviceId: "device-1",
        type: "websocket",
        address: "ws://localhost:7497",
      }) as unknown as MockTransport;

      // Simulate state change
      transport.simulateStateChange("connected");

      expect(onConnectionChange).toHaveBeenCalledWith(
        "device-1",
        expect.objectContaining({
          deviceId: "device-1",
          state: "connected",
        }),
      );
    });

    it("should only call onConnectionChange once per state change (no duplicates)", async () => {
      const onConnectionChange = vi.fn();
      manager.setEventHandlers({ onConnectionChange });

      manager.addDevice({
        deviceId: "device-1",
        type: "websocket",
        address: "ws://localhost:7497",
      }) as unknown as MockTransport;

      // Wait for auto-connect to complete
      await vi.advanceTimersByTimeAsync(10);

      // Count how many times "connected" state was reported
      const connectedCalls = onConnectionChange.mock.calls.filter(
        (call) => call[1].state === "connected",
      );

      // Should only be called once for connected state, not twice
      // (This verifies the fix for duplicate onOpen + onStateChange firing)
      expect(connectedCalls.length).toBe(1);
    });

    it("should sync hasConnectedBefore from transport on state change", async () => {
      manager.addDevice({
        deviceId: "device-1",
        type: "websocket",
        address: "ws://localhost:7497",
      });

      // Wait for connection
      await vi.advanceTimersByTimeAsync(10);

      const connection = manager.getConnection("device-1");
      expect(connection?.hasConnectedBefore).toBe(true);
    });

    it("should call onMessage when message is received", () => {
      const onMessage = vi.fn();
      manager.setEventHandlers({ onMessage });

      const transport = manager.addDevice({
        deviceId: "device-1",
        type: "websocket",
        address: "ws://localhost:7497",
      }) as unknown as MockTransport;

      transport.simulateMessage('{"result": "ok"}');

      expect(onMessage).toHaveBeenCalledWith(
        "device-1",
        expect.objectContaining({ data: '{"result": "ok"}' }),
      );
    });

    it("should set hasData to true when message is received", () => {
      const transport = manager.addDevice({
        deviceId: "device-1",
        type: "websocket",
        address: "ws://localhost:7497",
      }) as unknown as MockTransport;

      expect(manager.getConnection("device-1")?.hasData).toBe(false);

      transport.simulateMessage('{"result": "ok"}');

      expect(manager.getConnection("device-1")?.hasData).toBe(true);
    });
  });

  describe("sendToActive", () => {
    it("should send message to active device", async () => {
      const transport = manager.addDevice({
        deviceId: "device-1",
        type: "websocket",
        address: "ws://localhost:7497",
      }) as unknown as MockTransport;
      manager.setActiveDevice("device-1");

      await vi.advanceTimersByTimeAsync(10);

      manager.sendToActive('{"method": "test"}');

      expect(transport.send).toHaveBeenCalledWith(
        '{"method": "test"}',
        undefined,
      );
    });

    it("should not throw when no active device", () => {
      expect(() => manager.sendToActive('{"method": "test"}')).not.toThrow();
    });
  });

  describe("pauseAll and resumeAll", () => {
    it("should pause heartbeat on all transports", () => {
      const transport1 = manager.addDevice({
        deviceId: "device-1",
        type: "websocket",
        address: "ws://localhost:7497",
      }) as unknown as MockTransport;
      const transport2 = manager.addDevice({
        deviceId: "device-2",
        type: "websocket",
        address: "ws://localhost:7498",
      }) as unknown as MockTransport;

      manager.pauseAll();

      expect(transport1.pauseHeartbeat).toHaveBeenCalled();
      expect(transport2.pauseHeartbeat).toHaveBeenCalled();
    });

    it("should trigger immediate reconnect on all transports when resuming", () => {
      const transport1 = manager.addDevice({
        deviceId: "device-1",
        type: "websocket",
        address: "ws://localhost:7497",
      }) as unknown as MockTransport;
      const transport2 = manager.addDevice({
        deviceId: "device-2",
        type: "websocket",
        address: "ws://localhost:7498",
      }) as unknown as MockTransport;

      manager.resumeAll();

      expect(transport1.immediateReconnect).toHaveBeenCalled();
      expect(transport2.immediateReconnect).toHaveBeenCalled();
    });
  });

  describe("isActiveConnected", () => {
    it("should return false when no active device", () => {
      expect(manager.isActiveConnected()).toBe(false);
    });

    it("should return true when active device is connected", async () => {
      manager.addDevice({
        deviceId: "device-1",
        type: "websocket",
        address: "ws://localhost:7497",
      });
      manager.setActiveDevice("device-1");

      // Wait for connection
      await vi.advanceTimersByTimeAsync(10);

      expect(manager.isActiveConnected()).toBe(true);
    });
  });

  describe("bluetooth transport", () => {
    it("should throw error for bluetooth transport (not yet implemented)", () => {
      expect(() =>
        manager.addDevice({
          deviceId: "device-1",
          type: "bluetooth",
          address: "bt://device-uuid",
        }),
      ).toThrow("Bluetooth transport not yet implemented");
    });
  });
});
