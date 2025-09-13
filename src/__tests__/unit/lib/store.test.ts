import { describe, it, expect, beforeEach } from "vitest";
import { useStatusStore, ConnectionState } from "../../../lib/store";

describe("StatusStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useStatusStore.setState({
      connected: false,
      connectionError: "",
      connectionState: ConnectionState.IDLE,
      lastConnectionTime: null,
      deviceHistory: []
    });
  });

  it("should have default initial state", () => {
    const state = useStatusStore.getState();
    expect(state.connected).toBe(false);
    expect(state.connectionError).toBe("");
    expect(state.lastToken.uid).toBe("");
    expect(state.playing.systemId).toBe("");
    expect(state.deviceHistory).toEqual([]);
  });

  it("should update connection state", () => {
    const { setConnected, setConnectionError } = useStatusStore.getState();
    
    setConnected(true);
    expect(useStatusStore.getState().connected).toBe(true);
    
    setConnectionError("Test error");
    expect(useStatusStore.getState().connectionError).toBe("Test error");
  });

  it("should manage device history", () => {
    const { addDeviceHistory, removeDeviceHistory, clearDeviceHistory } = useStatusStore.getState();
    
    // Add a device
    addDeviceHistory("192.168.1.100");
    expect(useStatusStore.getState().deviceHistory).toEqual([{ address: "192.168.1.100" }]);
    
    // Add another device
    addDeviceHistory("192.168.1.200");
    expect(useStatusStore.getState().deviceHistory).toEqual([
      { address: "192.168.1.100" },
      { address: "192.168.1.200" }
    ]);
    
    // Remove a device
    removeDeviceHistory("192.168.1.100");
    expect(useStatusStore.getState().deviceHistory).toEqual([{ address: "192.168.1.200" }]);
    
    // Clear all devices
    clearDeviceHistory();
    expect(useStatusStore.getState().deviceHistory).toEqual([]);
  });

  describe("ConnectionState", () => {
    it("should have ConnectionState enum values", () => {
      expect(ConnectionState.IDLE).toBe("IDLE");
      expect(ConnectionState.CONNECTING).toBe("CONNECTING");
      expect(ConnectionState.CONNECTED).toBe("CONNECTED");
      expect(ConnectionState.RECONNECTING).toBe("RECONNECTING");
      expect(ConnectionState.ERROR).toBe("ERROR");
      expect(ConnectionState.DISCONNECTED).toBe("DISCONNECTED");
    });

    it("should set connection state", () => {
      const { setConnectionState } = useStatusStore.getState();
      setConnectionState(ConnectionState.CONNECTING);
      
      expect(useStatusStore.getState().connectionState).toBe(ConnectionState.CONNECTING);
    });

    it("should set last connection time", () => {
      const { setLastConnectionTime } = useStatusStore.getState();
      const now = Date.now();
      setLastConnectionTime(now);
      
      expect(useStatusStore.getState().lastConnectionTime).toBe(now);
    });

    it("should provide backward compatible connected getter", () => {
      const { setConnectionState } = useStatusStore.getState();
      
      setConnectionState(ConnectionState.CONNECTED);
      expect(useStatusStore.getState().connected).toBe(true);
      
      setConnectionState(ConnectionState.CONNECTING);
      expect(useStatusStore.getState().connected).toBe(false);
      
      setConnectionState(ConnectionState.DISCONNECTED);
      expect(useStatusStore.getState().connected).toBe(false);
      
      setConnectionState(ConnectionState.ERROR);
      expect(useStatusStore.getState().connected).toBe(false);
    });
  });
});