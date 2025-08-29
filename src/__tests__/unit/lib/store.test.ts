import { describe, it, expect, beforeEach } from "vitest";
import { useStatusStore } from "../../../lib/store";

describe("StatusStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useStatusStore.setState({
      connected: false,
      connectionError: "",
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
});