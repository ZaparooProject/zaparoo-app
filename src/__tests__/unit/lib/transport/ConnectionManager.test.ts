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
    url: string;
    _state: TransportState = "disconnected";
    _hasConnected = false;
    handlers: Record<string, (...args: unknown[]) => void> = {};

    send = vi.fn();
    immediateReconnect = vi.fn();
    clearEncryptionBlock = vi.fn();
    pauseHeartbeat = vi.fn();
    resumeHeartbeat = vi.fn();
    disconnect = vi.fn(() => {
      this._state = "disconnected";
      this.handlers.onStateChange?.("disconnected");
    });
    destroy = vi.fn(() => {
      this._state = "disconnected";
    });

    constructor(config: { deviceId: string; url: string }) {
      this.deviceId = config.deviceId;
      this.url = config.url;
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
        this.handlers.onOpen?.(this.url);
      }, 0);
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

    simulateOpenAt(address: string): void {
      this.handlers.onOpen?.(address);
    }
  }

  return { WebSocketTransport: MockWebSocketTransport };
});

const createdLinkTransports = vi.hoisted(
  () =>
    [] as {
      kind: "bluetooth" | "hybrid";
      config: Record<string, unknown>;
      handlers: Record<string, (...args: unknown[]) => void>;
    }[],
);

function linkTransportMock(kind: "bluetooth" | "hybrid") {
  return class {
    readonly deviceId: string;
    readonly state = "disconnected";
    readonly isConnected = false;
    readonly hasEverConnected = false;
    readonly pairsOverBluetooth = kind === "bluetooth";
    private readonly entry: (typeof createdLinkTransports)[number];
    pairing = vi.fn();
    connect = vi.fn();
    disconnect = vi.fn();
    destroy = vi.fn();
    send = vi.fn();
    immediateReconnect = vi.fn();
    clearEncryptionBlock = vi.fn();
    pauseHeartbeat = vi.fn();
    resumeHeartbeat = vi.fn();

    constructor(config: Record<string, unknown>) {
      this.deviceId = config.deviceId as string;
      this.entry = { kind, config, handlers: {} };
      createdLinkTransports.push(this.entry);
    }

    setEventHandlers(h: Record<string, (...args: unknown[]) => void>): void {
      this.entry.handlers = h;
    }

    pairingCall() {
      return this.pairing;
    }
  };
}

vi.mock("../../../../lib/transport/ble/BluetoothTransport", () => ({
  BluetoothTransport: linkTransportMock("bluetooth"),
}));

vi.mock("../../../../lib/transport/hybrid/HybridTransport", () => ({
  HybridTransport: linkTransportMock("hybrid"),
}));

// Import after mock is set up
import { ConnectionManager } from "../../../../lib/transport/ConnectionManager";

// Helper type for mock transport
interface MockTransport {
  deviceId: string;
  state: TransportState;
  _state: TransportState; // Internal state for testing
  isConnected: boolean;
  hasEverConnected: boolean;
  send: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  immediateReconnect: ReturnType<typeof vi.fn>;
  clearEncryptionBlock: ReturnType<typeof vi.fn>;
  pauseHeartbeat: ReturnType<typeof vi.fn>;
  resumeHeartbeat: ReturnType<typeof vi.fn>;
  simulateMessage: (data: string) => void;
  simulateStateChange: (state: TransportState) => void;
  simulateOpenAt: (address: string) => void;
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

    it("should track the candidate address that actually opened", () => {
      const transport = manager.addDevice({
        deviceId: "device-1",
        type: "websocket",
        address: "ws://10.0.0.205:7497",
        fallbackAddresses: ["ws://10.0.0.206:7497"],
      }) as unknown as MockTransport;

      transport.simulateOpenAt("ws://10.0.0.206:7497");

      expect(manager.getConnection("device-1")?.address).toBe(
        "ws://10.0.0.206:7497",
      );
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

      expect(transport.send).toHaveBeenCalledWith('{"method": "test"}');
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

    it("should trigger immediate reconnect on disconnected transports when resuming", () => {
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

      // Both are disconnected by default
      manager.resumeAll();

      expect(transport1.immediateReconnect).toHaveBeenCalled();
      expect(transport2.immediateReconnect).toHaveBeenCalled();
    });

    it("should resume heartbeat on connected transports when resuming", () => {
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

      // Simulate transport1 connected, transport2 disconnected
      transport1._state = "connected";
      transport2._state = "disconnected";

      manager.resumeAll();

      // Connected transport should get resumeHeartbeat
      expect(transport1.resumeHeartbeat).toHaveBeenCalled();
      expect(transport1.immediateReconnect).not.toHaveBeenCalled();

      // Disconnected transport should get immediateReconnect
      expect(transport2.immediateReconnect).toHaveBeenCalled();
      expect(transport2.resumeHeartbeat).not.toHaveBeenCalled();
    });
  });

  describe("restartActiveConnection", () => {
    it("should replace an already-connected active socket", async () => {
      const transport = manager.addDevice({
        deviceId: "device-1",
        type: "websocket",
        address: "ws://localhost:7497",
      }) as unknown as MockTransport;
      manager.setActiveDevice("device-1");
      await vi.advanceTimersByTimeAsync(10);
      transport.disconnect.mockClear();
      transport.immediateReconnect.mockClear();

      manager.restartActiveConnection();

      expect(transport.disconnect).toHaveBeenCalledTimes(1);
      expect(transport.immediateReconnect).toHaveBeenCalledTimes(1);
      expect(transport.disconnect.mock.invocationCallOrder[0]!).toBeLessThan(
        transport.immediateReconnect.mock.invocationCallOrder[0]!,
      );
    });

    it("should defer reopening the socket while paused", async () => {
      const transport = manager.addDevice({
        deviceId: "device-1",
        type: "websocket",
        address: "ws://localhost:7497",
      }) as unknown as MockTransport;
      manager.setActiveDevice("device-1");
      await vi.advanceTimersByTimeAsync(10);
      manager.pauseAll();
      transport.disconnect.mockClear();
      transport.immediateReconnect.mockClear();

      manager.restartActiveConnection();

      expect(transport.disconnect).toHaveBeenCalledTimes(1);
      expect(transport.immediateReconnect).not.toHaveBeenCalled();

      manager.resumeAll();
      expect(transport.immediateReconnect).toHaveBeenCalledTimes(1);
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

  describe("bluetooth and hybrid transports", () => {
    beforeEach(() => {
      createdLinkTransports.length = 0;
    });

    it("creates a Bluetooth transport with the stored identity", () => {
      manager.addDevice({
        deviceId: "device-1",
        type: "bluetooth",
        address: "",
        bluetooth: { coreDeviceId: "core-1", peripheralId: "AA:BB" },
      });

      expect(createdLinkTransports).toHaveLength(1);
      expect(createdLinkTransports[0]!.kind).toBe("bluetooth");
      expect(createdLinkTransports[0]!.config).toMatchObject({
        deviceId: "device-1",
        identity: { coreDeviceId: "core-1", peripheralId: "AA:BB" },
      });
    });

    it("creates a hybrid transport with every non-empty WebSocket address", () => {
      manager.addDevice({
        deviceId: "device-1",
        type: "hybrid",
        address: "ws://10.0.0.5:7497/api/v0.1",
        fallbackAddresses: ["", "ws://192.168.1.5:7497/api/v0.1"],
        bluetooth: { coreDeviceId: "core-1" },
      });

      expect(createdLinkTransports[0]!.kind).toBe("hybrid");
      expect(createdLinkTransports[0]!.config).toMatchObject({
        deviceId: "device-1",
        wsUrls: [
          "ws://10.0.0.5:7497/api/v0.1",
          "ws://192.168.1.5:7497/api/v0.1",
        ],
        bluetooth: { coreDeviceId: "core-1" },
      });
    });

    it("gives a hybrid transport with no address no WebSocket URLs", () => {
      manager.addDevice({ deviceId: "device-1", type: "hybrid", address: "" });

      expect(createdLinkTransports[0]!.config.wsUrls).toEqual([]);
    });

    it("records the link and reports it as a connection change", () => {
      const onLinkChange = vi.fn();
      const onConnectionChange = vi.fn();
      manager.setEventHandlers({ onLinkChange, onConnectionChange });
      manager.addDevice({ deviceId: "device-1", type: "hybrid", address: "" });

      createdLinkTransports[0]!.handlers.onLinkChange!("bluetooth");

      expect(manager.getConnection("device-1")?.link).toBe("bluetooth");
      expect(onLinkChange).toHaveBeenCalledWith("device-1", "bluetooth");
      expect(onConnectionChange).toHaveBeenCalledWith(
        "device-1",
        expect.objectContaining({ link: "bluetooth" }),
      );
    });

    it("starts a connection with no known link", () => {
      manager.addDevice({ deviceId: "device-1", type: "hybrid", address: "" });

      expect(manager.getConnection("device-1")?.link).toBeNull();
    });

    it("forwards heartbeat, identity and endpoint events with the device id", () => {
      const onHeartbeat = vi.fn();
      const onBluetoothIdentity = vi.fn();
      const onEndpoints = vi.fn();
      manager.setEventHandlers({
        onHeartbeat,
        onBluetoothIdentity,
        onEndpoints,
      });
      manager.addDevice({ deviceId: "device-1", type: "hybrid", address: "" });
      const { handlers } = createdLinkTransports[0]!;
      const identity = { coreDeviceId: "core-1", peripheralId: "AA:BB" };
      const endpoints = {
        deviceId: "core-1",
        addresses: ["10.0.0.5"],
        port: 7497,
        ble: true,
      };

      handlers.onHeartbeat!(42);
      handlers.onBluetoothIdentity!(identity);
      handlers.onEndpoints!(endpoints);

      expect(onHeartbeat).toHaveBeenCalledWith("device-1", 42);
      expect(onBluetoothIdentity).toHaveBeenCalledWith("device-1", identity);
      expect(onEndpoints).toHaveBeenCalledWith("device-1", endpoints);
    });

    it("exposes the active transport's Bluetooth pairing", () => {
      manager.addDevice({
        deviceId: "device-1",
        type: "bluetooth",
        address: "",
      });
      manager.setActiveDevice("device-1");

      expect(manager.activePairsOverBluetooth()).toBe(true);
      expect(manager.getActivePairingCall()).toBeTypeOf("function");
    });

    it("reports no Bluetooth pairing for a WebSocket device", () => {
      manager.addDevice({
        deviceId: "device-1",
        type: "websocket",
        address: "ws://localhost:7497",
      });
      manager.setActiveDevice("device-1");

      expect(manager.activePairsOverBluetooth()).toBe(false);
      expect(manager.getActivePairingCall()).toBeNull();
    });
  });
});
