import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useStatusStore, ConnectionState } from "../../../lib/store";

describe("Store Grace Period Logic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset store to initial state
    useStatusStore.setState({
      connectionState: ConnectionState.IDLE,
      connected: false,
      pendingDisconnection: false
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  describe("setConnectionStateWithGracePeriod", () => {
    it("should immediately set CONNECTED state without grace period", () => {
      const store = useStatusStore.getState();

      store.setConnectionStateWithGracePeriod(ConnectionState.CONNECTED);

      expect(useStatusStore.getState().connectionState).toBe(ConnectionState.CONNECTED);
      expect(useStatusStore.getState().connected).toBe(true);
      expect(useStatusStore.getState().pendingDisconnection).toBe(false);
    });

    it("should immediately set ERROR state without grace period", () => {
      const store = useStatusStore.getState();

      store.setConnectionStateWithGracePeriod(ConnectionState.ERROR);

      expect(useStatusStore.getState().connectionState).toBe(ConnectionState.ERROR);
      expect(useStatusStore.getState().connected).toBe(false);
      expect(useStatusStore.getState().pendingDisconnection).toBe(false);
    });

    it("should immediately set CONNECTING state without grace period", () => {
      const store = useStatusStore.getState();

      store.setConnectionStateWithGracePeriod(ConnectionState.CONNECTING);

      expect(useStatusStore.getState().connectionState).toBe(ConnectionState.CONNECTING);
      expect(useStatusStore.getState().connected).toBe(false);
      expect(useStatusStore.getState().pendingDisconnection).toBe(false);
    });

    it("should delay RECONNECTING state during grace period when previously connected", () => {
      // First set to connected
      useStatusStore.setState({
        connectionState: ConnectionState.CONNECTED,
        connected: true
      });

      const store = useStatusStore.getState();
      store.setConnectionStateWithGracePeriod(ConnectionState.RECONNECTING);

      // Should not change connection state immediately
      expect(useStatusStore.getState().connectionState).toBe(ConnectionState.CONNECTED);
      expect(useStatusStore.getState().connected).toBe(true);
      expect(useStatusStore.getState().pendingDisconnection).toBe(true);
    });

    it("should apply RECONNECTING state after grace period expires", () => {
      // First set to connected
      useStatusStore.setState({
        connectionState: ConnectionState.CONNECTED,
        connected: true
      });

      const store = useStatusStore.getState();
      store.setConnectionStateWithGracePeriod(ConnectionState.RECONNECTING);

      // Fast-forward past grace period
      vi.advanceTimersByTime(2000);

      expect(useStatusStore.getState().connectionState).toBe(ConnectionState.RECONNECTING);
      expect(useStatusStore.getState().connected).toBe(false);
      expect(useStatusStore.getState().pendingDisconnection).toBe(false);
    });

    it("should cancel grace period if reconnected before expiration", () => {
      // First set to connected
      useStatusStore.setState({
        connectionState: ConnectionState.CONNECTED,
        connected: true
      });

      const store = useStatusStore.getState();
      store.setConnectionStateWithGracePeriod(ConnectionState.RECONNECTING);

      // Before grace period expires, reconnect
      vi.advanceTimersByTime(1000);
      store.setConnectionStateWithGracePeriod(ConnectionState.CONNECTED);

      expect(useStatusStore.getState().connectionState).toBe(ConnectionState.CONNECTED);
      expect(useStatusStore.getState().connected).toBe(true);
      expect(useStatusStore.getState().pendingDisconnection).toBe(false);

      // Even after original grace period would have expired
      vi.advanceTimersByTime(2000);
      expect(useStatusStore.getState().connectionState).toBe(ConnectionState.CONNECTED);
    });

    it("should delay DISCONNECTED state during grace period when previously connected", () => {
      // First set to connected
      useStatusStore.setState({
        connectionState: ConnectionState.CONNECTED,
        connected: true
      });

      const store = useStatusStore.getState();
      store.setConnectionStateWithGracePeriod(ConnectionState.DISCONNECTED);

      // Should not change connection state immediately
      expect(useStatusStore.getState().connectionState).toBe(ConnectionState.CONNECTED);
      expect(useStatusStore.getState().connected).toBe(true);
      expect(useStatusStore.getState().pendingDisconnection).toBe(true);
    });

    it("should immediately set RECONNECTING if not previously connected", () => {
      // Start from non-connected state
      useStatusStore.setState({
        connectionState: ConnectionState.IDLE,
        connected: false
      });

      const store = useStatusStore.getState();
      store.setConnectionStateWithGracePeriod(ConnectionState.RECONNECTING);

      expect(useStatusStore.getState().connectionState).toBe(ConnectionState.RECONNECTING);
      expect(useStatusStore.getState().connected).toBe(false);
      expect(useStatusStore.getState().pendingDisconnection).toBe(false);
    });

    it("should use fixed 2 second grace period", () => {
      // First set to connected
      useStatusStore.setState({
        connectionState: ConnectionState.CONNECTED,
        connected: true
      });

      const store = useStatusStore.getState();
      store.setConnectionStateWithGracePeriod(ConnectionState.RECONNECTING);

      // Should still be connected after 1 second
      vi.advanceTimersByTime(1000);
      expect(useStatusStore.getState().connectionState).toBe(ConnectionState.CONNECTED);

      // Should disconnect after 2 second grace period
      vi.advanceTimersByTime(1000);
      expect(useStatusStore.getState().connectionState).toBe(ConnectionState.RECONNECTING);
    });
  });

  describe("clearGracePeriod", () => {
    it("should cancel pending disconnection", () => {
      // First set to connected, then trigger grace period
      useStatusStore.setState({
        connectionState: ConnectionState.CONNECTED,
        connected: true
      });

      const store = useStatusStore.getState();
      store.setConnectionStateWithGracePeriod(ConnectionState.RECONNECTING);

      expect(useStatusStore.getState().pendingDisconnection).toBe(true);

      store.clearGracePeriod();

      expect(useStatusStore.getState().pendingDisconnection).toBe(false);

      // Timer should be cancelled - advancing time should not trigger state change
      vi.advanceTimersByTime(3000);
      expect(useStatusStore.getState().connectionState).toBe(ConnectionState.CONNECTED);
    });
  });

});