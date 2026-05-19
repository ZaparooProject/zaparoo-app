import { describe, it, expect, beforeEach } from "vitest";
import { useStatusStore, ConnectionState } from "../../../lib/store";
import { mockInboxMessage } from "../../../test-utils/factories";

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

  describe("updateDeviceHistoryMeta", () => {
    const seedEntry = (overrides: Record<string, unknown> = {}) => {
      useStatusStore.setState({
        deviceHistory: [{ address: "192.168.1.100", ...overrides }],
      });
    };

    it("is a no-op when the address does not exist", () => {
      useStatusStore.setState({ deviceHistory: [] });
      useStatusStore
        .getState()
        .updateDeviceHistoryMeta("ghost", { name: "Nope" });
      expect(useStatusStore.getState().deviceHistory).toEqual([]);
    });

    describe("source: auto (default)", () => {
      it("merges platform, version, and lastConnectedAt", () => {
        seedEntry();
        useStatusStore.getState().updateDeviceHistoryMeta("192.168.1.100", {
          platform: "linux",
          version: "1.2.3",
          lastConnectedAt: 12345,
        });
        const entry = useStatusStore.getState().deviceHistory[0]!;
        expect(entry.platform).toBe("linux");
        expect(entry.version).toBe("1.2.3");
        expect(entry.lastConnectedAt).toBe(12345);
      });

      it("sets name when no custom name is set", () => {
        seedEntry();
        useStatusStore
          .getState()
          .updateDeviceHistoryMeta("192.168.1.100", { name: "Office" });
        expect(useStatusStore.getState().deviceHistory[0]!.name).toBe("Office");
      });

      it("preserves a custom name (nameIsCustom=true)", () => {
        seedEntry({ name: "My Pixel", nameIsCustom: true });
        useStatusStore
          .getState()
          .updateDeviceHistoryMeta("192.168.1.100", { name: "Auto Name" });
        expect(useStatusStore.getState().deviceHistory[0]!.name).toBe(
          "My Pixel",
        );
      });

      it("ignores an empty-string name without overwriting an existing one", () => {
        seedEntry({ name: "Living Room" });
        useStatusStore
          .getState()
          .updateDeviceHistoryMeta("192.168.1.100", { name: "" });
        expect(useStatusStore.getState().deviceHistory[0]!.name).toBe(
          "Living Room",
        );
      });
    });

    describe("source: manual", () => {
      it("sets a name and marks nameIsCustom", () => {
        seedEntry();
        useStatusStore
          .getState()
          .updateDeviceHistoryMeta(
            "192.168.1.100",
            { name: "Bedroom" },
            { source: "manual" },
          );
        const entry = useStatusStore.getState().deviceHistory[0]!;
        expect(entry.name).toBe("Bedroom");
        expect(entry.nameIsCustom).toBe(true);
      });

      it("clears the custom name when name is empty string", () => {
        seedEntry({ name: "Bedroom", nameIsCustom: true });
        useStatusStore
          .getState()
          .updateDeviceHistoryMeta(
            "192.168.1.100",
            { name: "" },
            { source: "manual" },
          );
        const entry = useStatusStore.getState().deviceHistory[0]!;
        expect(entry.name).toBeUndefined();
        expect(entry.nameIsCustom).toBe(false);
      });

      it("clears the custom name when name is undefined and present in meta", () => {
        seedEntry({ name: "Bedroom", nameIsCustom: true });
        useStatusStore
          .getState()
          .updateDeviceHistoryMeta(
            "192.168.1.100",
            { name: undefined },
            { source: "manual" },
          );
        const entry = useStatusStore.getState().deviceHistory[0]!;
        expect(entry.name).toBeUndefined();
        expect(entry.nameIsCustom).toBe(false);
      });

      it("merges platform/version/lastConnectedAt without touching name when name is absent", () => {
        seedEntry({ name: "Existing", nameIsCustom: true });
        useStatusStore
          .getState()
          .updateDeviceHistoryMeta(
            "192.168.1.100",
            { platform: "darwin", version: "2.0.0", lastConnectedAt: 99 },
            { source: "manual" },
          );
        const entry = useStatusStore.getState().deviceHistory[0]!;
        expect(entry.name).toBe("Existing");
        expect(entry.nameIsCustom).toBe(true);
        expect(entry.platform).toBe("darwin");
        expect(entry.version).toBe("2.0.0");
        expect(entry.lastConnectedAt).toBe(99);
      });
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

  describe("inbox slice", () => {
    beforeEach(() => {
      useStatusStore.setState({ inboxMessages: [], inboxModalOpen: false });
    });

    it("should set inbox messages wholesale", () => {
      const messages = [
        mockInboxMessage({ id: 1 }),
        mockInboxMessage({ id: 2 }),
      ];
      useStatusStore.getState().setInboxMessages(messages);
      expect(useStatusStore.getState().inboxMessages).toEqual(messages);
    });

    it("should prepend new messages with addInboxMessage", () => {
      const first = mockInboxMessage({ id: 1 });
      const second = mockInboxMessage({ id: 2 });
      useStatusStore.getState().setInboxMessages([first]);
      useStatusStore.getState().addInboxMessage(second);
      expect(useStatusStore.getState().inboxMessages.map((m) => m.id)).toEqual([
        2, 1,
      ]);
    });

    it("should dedupe by id when adding a message that already exists", () => {
      const original = mockInboxMessage({ id: 7, title: "old" });
      const replacement = mockInboxMessage({ id: 7, title: "new" });
      useStatusStore.getState().setInboxMessages([original]);
      useStatusStore.getState().addInboxMessage(replacement);
      const messages = useStatusStore.getState().inboxMessages;
      expect(messages).toHaveLength(1);
      expect(messages[0]!.title).toBe("new");
    });

    it("should remove a message by id", () => {
      const a = mockInboxMessage({ id: 1 });
      const b = mockInboxMessage({ id: 2 });
      useStatusStore.getState().setInboxMessages([a, b]);
      useStatusStore.getState().removeInboxMessage(1);
      expect(useStatusStore.getState().inboxMessages.map((m) => m.id)).toEqual([
        2,
      ]);
    });

    it("should reset inbox state when resetConnectionState is called", () => {
      useStatusStore.setState({
        inboxMessages: [mockInboxMessage({ id: 99 })],
        inboxModalOpen: true,
      });
      useStatusStore.getState().resetConnectionState();
      expect(useStatusStore.getState().inboxMessages).toEqual([]);
      expect(useStatusStore.getState().inboxModalOpen).toBe(false);
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
