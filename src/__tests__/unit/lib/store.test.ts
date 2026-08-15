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
      playing: {
        systemId: "",
        systemName: "",
        mediaName: "",
        mediaPath: "",
      },
      backgroundPlaying: {
        systemId: "",
        systemName: "",
        mediaName: "",
        mediaPath: "",
      },
      playlists: {
        primary: null,
        background: null,
      },
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

  describe("background media", () => {
    it("should update background media independently", () => {
      const primary = {
        systemId: "SNES",
        systemName: "Super Nintendo",
        mediaName: "Super Mario World",
        mediaPath: "/games/smw.sfc",
      };
      const background = {
        systemId: "Audio",
        systemName: "Audio",
        mediaName: "Soundtrack",
        mediaPath: "/music/soundtrack.mp3",
        slot: "background" as const,
      };

      const playlist = {
        id: "soundtrack",
        name: "Soundtrack",
        slot: "background" as const,
        repeat: "all" as const,
        items: [
          { name: "Theme", zapScript: "@Audio/Theme" },
          { name: "Battle", zapScript: "@Audio/Battle" },
        ],
        index: 0,
        total: 2,
        playing: true,
      };

      useStatusStore.getState().setPlaying(primary);
      useStatusStore.getState().setBackgroundPlaying(background);
      useStatusStore.getState().setPlaylist("background", playlist);

      expect(useStatusStore.getState().playing).toEqual(primary);
      expect(useStatusStore.getState().backgroundPlaying).toEqual(background);
      expect(useStatusStore.getState().playlists.background).toEqual(playlist);
      expect(useStatusStore.getState().playlists.primary).toBeNull();
    });
  });

  describe("resetConnectionState", () => {
    it("should reset all connection-related state to default values", () => {
      const store = useStatusStore.getState();

      // Set up some state first
      store.setConnected(true);
      store.setConnectionState(ConnectionState.CONNECTED);
      store.setConnectionError("Some error");
      store.setRunQueue({
        value: "test-uid",
        unsafe: true,
        source: "deepLink",
      });
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
      store.setBackgroundPlaying({
        systemId: "Audio",
        systemName: "Audio",
        mediaName: "Test Song",
        mediaPath: "/path/to/song.mp3",
        slot: "background",
      });
      store.setPlaylist("background", {
        id: "soundtrack",
        name: "Soundtrack",
        slot: "background",
        repeat: "none",
        items: [{ name: "Test Song", zapScript: "@Audio/Test Song" }],
        index: 0,
        total: 1,
        playing: true,
      });
      store.setCurrentClient({
        paired: true,
        role: "admin",
        capabilities: ["settings.write"],
      });

      // Reset the state
      store.resetConnectionState();

      // Verify all connection-related state is reset
      const resetState = useStatusStore.getState();
      expect(resetState.connected).toBe(false);
      expect(resetState.connectionState).toBe(ConnectionState.IDLE);
      expect(resetState.connectionError).toBe("");
      // Queued deep-link intents are device-independent and survive resets
      expect(resetState.runQueue).toEqual({
        value: "test-uid",
        unsafe: true,
        source: "deepLink",
      });
      expect(resetState.writeQueue).toBe("test-write-data");

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
      expect(resetState.backgroundPlaying).toEqual({
        systemId: "",
        systemName: "",
        mediaName: "",
        mediaPath: "",
      });
      expect(resetState.playlists).toEqual({
        primary: null,
        background: null,
      });
      expect(resetState.currentClient).toBeNull();
    });

    it("should not affect non-connection-related state", () => {
      const store = useStatusStore.getState();

      // Set some non-connection state
      store.setCameraOpen(true);
      store.setLoggedInUser({ uid: "test-user" } as any);

      // Reset connection state
      store.resetConnectionState();

      // Verify non-connection state is preserved
      const state = useStatusStore.getState();
      expect(state.cameraOpen).toBe(true);
      expect(state.loggedInUser).toEqual({ uid: "test-user" });
    });
  });
});
