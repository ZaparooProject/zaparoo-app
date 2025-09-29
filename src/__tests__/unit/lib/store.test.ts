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

  it("should handle queue states correctly", () => {
    const { setRunQueue, setWriteQueue } = useStatusStore.getState();

    // Test run queue
    const runQueueItem = { value: "test-uid", unsafe: false };
    setRunQueue(runQueueItem);
    expect(useStatusStore.getState().runQueue).toEqual(runQueueItem);

    // Test write queue
    setWriteQueue("test-write-data");
    expect(useStatusStore.getState().writeQueue).toBe("test-write-data");
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

  describe("resetConnectionState", () => {
    it("should reset all connection-related state to default values", () => {
      const store = useStatusStore.getState();

      // Set up some state first
      store.setConnected(true);
      store.setConnectionState(ConnectionState.CONNECTED);
      store.setConnectionError("Some error");
      store.setLastConnectionTime(Date.now());
      store.setRunQueue({ value: "test-uid", unsafe: true });
      store.setWriteQueue("test-write-data");
      store.setLastToken({
        type: "nfc",
        uid: "test-uid",
        text: "test-text",
        data: "test-data",
        scanTime: "2024-01-01T00:00:00Z"
      });
      store.setGamesIndex({
        exists: false,
        indexing: true,
        totalSteps: 10,
        currentStep: 5,
        currentStepDisplay: "Processing...",
        totalFiles: 100
      });
      store.setPlaying({
        systemId: "test-system",
        systemName: "Test System",
        mediaName: "Test Game",
        mediaPath: "/path/to/game"
      });

      // Reset the state
      store.resetConnectionState();

      // Verify all connection-related state is reset
      const resetState = useStatusStore.getState();
      expect(resetState.connected).toBe(false);
      expect(resetState.connectionState).toBe(ConnectionState.IDLE);
      expect(resetState.lastConnectionTime).toBe(null);
      expect(resetState.connectionError).toBe("");
      expect(resetState.retryCount).toBe(0);
      expect(resetState.pendingDisconnection).toBe(false);
      expect(resetState.gracePeriodTimer).toBeUndefined();
      expect(resetState.runQueue).toBe(null);
      expect(resetState.writeQueue).toBe("");

      // Verify media-related state is reset
      expect(resetState.lastToken).toEqual({
        type: "",
        uid: "",
        text: "",
        data: "",
        scanTime: ""
      });
      expect(resetState.gamesIndex).toEqual({
        exists: true,
        indexing: false,
        optimizing: false,
        totalSteps: 0,
        currentStep: 0,
        currentStepDisplay: "",
        totalFiles: 0
      });
      expect(resetState.playing).toEqual({
        systemId: "",
        systemName: "",
        mediaName: "",
        mediaPath: ""
      });
    });

    it("should clear grace period timer if one exists", () => {
      const store = useStatusStore.getState();

      // Simulate a grace period timer being set
      const mockTimer = setTimeout(() => {}, 1000);
      useStatusStore.setState({ gracePeriodTimer: mockTimer });

      // Reset connection state
      store.resetConnectionState();

      // Verify timer is cleared
      const state = useStatusStore.getState();
      expect(state.gracePeriodTimer).toBeUndefined();
      expect(state.pendingDisconnection).toBe(false);
    });

    it("should not affect non-connection-related state", () => {
      const store = useStatusStore.getState();

      // Set some non-connection state
      store.setCameraOpen(true);
      store.setNfcModalOpen(true);
      store.addDeviceHistory("192.168.1.100");
      store.setLoggedInUser({ uid: "test-user" } as any);

      // Reset connection state
      store.resetConnectionState();

      // Verify non-connection state is preserved
      const state = useStatusStore.getState();
      expect(state.cameraOpen).toBe(true);
      expect(state.nfcModalOpen).toBe(true);
      expect(state.deviceHistory).toEqual([{ address: "192.168.1.100" }]);
      expect(state.loggedInUser).toEqual({ uid: "test-user" });
    });
  });
});