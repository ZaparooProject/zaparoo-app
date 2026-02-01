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
      deviceHistory: [],
    });
  });

  describe("device history business logic", () => {
    it("should deduplicate devices when adding same address twice", () => {
      const { addDeviceHistory } = useStatusStore.getState();

      addDeviceHistory("192.168.1.100");
      addDeviceHistory("192.168.1.100"); // Add same address again

      // Should only have one entry
      expect(useStatusStore.getState().deviceHistory).toEqual([
        { address: "192.168.1.100" },
      ]);
    });

    it("should add, remove, and clear device history", () => {
      const { addDeviceHistory, removeDeviceHistory, clearDeviceHistory } =
        useStatusStore.getState();

      // Add devices
      addDeviceHistory("192.168.1.100");
      addDeviceHistory("192.168.1.200");
      expect(useStatusStore.getState().deviceHistory).toHaveLength(2);

      // Remove a device
      removeDeviceHistory("192.168.1.100");
      expect(useStatusStore.getState().deviceHistory).toEqual([
        { address: "192.168.1.200" },
      ]);

      // Clear all devices
      clearDeviceHistory();
      expect(useStatusStore.getState().deviceHistory).toEqual([]);
    });
  });

  describe("ConnectionState", () => {
    it("should derive connected boolean from connectionState (backward compatibility)", () => {
      const { setConnectionState } = useStatusStore.getState();

      // Only CONNECTED state should report as connected
      setConnectionState(ConnectionState.CONNECTED);
      expect(useStatusStore.getState().connected).toBe(true);

      // All other states should report as disconnected
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
        scanTime: "2024-01-01T00:00:00Z",
      });
      store.setGamesIndex({
        exists: false,
        indexing: true,
        totalSteps: 10,
        currentStep: 5,
        currentStepDisplay: "Processing...",
        totalFiles: 100,
      });
      store.setPlaying({
        systemId: "test-system",
        systemName: "Test System",
        mediaName: "Test Game",
        mediaPath: "/path/to/game",
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
      expect(resetState.runQueue).toBe(null);
      expect(resetState.writeQueue).toBe("");

      // Verify media-related state is reset
      expect(resetState.lastToken).toEqual({
        type: "",
        uid: "",
        text: "",
        data: "",
        scanTime: "",
      });
      expect(resetState.gamesIndex).toEqual({
        exists: true,
        indexing: false,
        optimizing: false,
        totalSteps: 0,
        currentStep: 0,
        currentStepDisplay: "",
        totalFiles: 0,
      });
      expect(resetState.playing).toEqual({
        systemId: "",
        systemName: "",
        mediaName: "",
        mediaPath: "",
      });
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
